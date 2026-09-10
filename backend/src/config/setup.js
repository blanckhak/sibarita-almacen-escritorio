const pool = require('./db')
const bcrypt = require('bcryptjs')

async function setup() {
  console.log('Iniciando configuracion de base de datos...')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS almacenes (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      ubicacion VARCHAR(200),
      creado_en TIMESTAMP DEFAULT NOW()
    );

    -- El nombre de almacen es unico: sin esto, correr por error el seed de
    -- almacenes dos veces duplica MALSA/JOPISA/INDELPAS. Si ya hay duplicados
    -- el indice no se crea y solo se avisa (hay que limpiarlos a mano).
    DO $mig$ BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS almacenes_nombre_unique ON almacenes (lower(nombre));
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'almacenes_nombre_unique no creado: hay nombres de almacen duplicados';
    END $mig$;

    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      rol_id INTEGER REFERENCES roles(id),
      almacen_id INTEGER REFERENCES almacenes(id),
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS unidades_medida (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL UNIQUE,
      abreviatura VARCHAR(10)
    );

    CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL UNIQUE,
      creado_en TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria VARCHAR(100);
    ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad_medida_id INTEGER REFERENCES unidades_medida(id);
    ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_interno VARCHAR(50);

    -- Metrica del producto (Bloque 2, Fase 7): ENTERO (default) / EN_PARTIDA.
    -- El CHECK tiene nombre propio -> DROP/ADD idempotente (en instalaciones
    -- nuevas ya sale del CREATE TABLE de database.sql).
    ALTER TABLE productos ADD COLUMN IF NOT EXISTS metrica VARCHAR(10) NOT NULL DEFAULT 'ENTERO';
    ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_metrica_check;
    ALTER TABLE productos ADD CONSTRAINT productos_metrica_check
      CHECK (metrica IN ('ENTERO', 'EN_PARTIDA'));

    CREATE UNIQUE INDEX IF NOT EXISTS productos_codigo_interno_unique
      ON productos (codigo_interno) WHERE codigo_interno IS NOT NULL;

    -- El dedup de producto nuevo por nombre (guias.js) compara sin distinguir
    -- mayusculas/minusculas; este indice hace que esa misma nocion de igualdad
    -- sea la que realmente impide duplicados a nivel de base de datos.
    CREATE UNIQUE INDEX IF NOT EXISTS productos_nombre_lower_unique ON productos (LOWER(nombre));

    -- "Stock consolidado" (Bloque 3): el mismo material se cargaba en guias con
    -- nombres apenas distintos (espacios de mas, tildes, guion vs barra) y cada
    -- variante creaba un producto aparte, partiendo su stock. producto_canon
    -- reduce el nombre a una forma comparable -> minusculas, sin tildes y sin
    -- nada que no sea letra/numero: "Tornillo 1/2", "tornillo  1 - 2",
    -- "TORNILLO 1/2" y "Tornillo1/2" caen todos en "tornillo12" -> mismo
    -- producto. guias.js compara con esta forma; el indice unico la vuelve la
    -- regla real en la base.
    CREATE OR REPLACE FUNCTION producto_canon(txt text) RETURNS text AS $func$
      SELECT regexp_replace(
        translate(lower(coalesce(txt, '')), 'áéíóúüñ', 'aeiouun'),
        '[^a-z0-9]', '', 'g')
    $func$ LANGUAGE sql IMMUTABLE;

    -- Si ya hay casi-duplicados de guias viejas, el indice no se puede crear;
    -- no se rompe el arranque, solo no se aplica la unicidad hasta limpiarlos.
    DO $mig$ BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS productos_canon_unique ON productos (producto_canon(nombre));
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'productos_canon_unique no creado: hay nombres casi-duplicados existentes';
    END $mig$;

    CREATE TABLE IF NOT EXISTS inventario (
      id SERIAL PRIMARY KEY,
      almacen_id INTEGER REFERENCES almacenes(id),
      producto_id INTEGER REFERENCES productos(id),
      tipo VARCHAR(20) CHECK (tipo IN ('NUEVO', 'DEVOLUCION')),
      cantidad NUMERIC(12,3) NOT NULL DEFAULT 0,
      descripcion TEXT,
      creado_en TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS movimientos (
      id SERIAL PRIMARY KEY,
      almacen_origen_id INTEGER REFERENCES almacenes(id),
      almacen_destino_id INTEGER REFERENCES almacenes(id),
      producto_id INTEGER REFERENCES productos(id),
      tipo VARCHAR(50),
      cantidad NUMERIC(12,3),
      descripcion TEXT,
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE inventario  ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES productos(id);
    ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES productos(id);

    CREATE SEQUENCE IF NOT EXISTS etiquetas_codigo_seq START 9001;

    CREATE TABLE IF NOT EXISTS guias (
      id SERIAL PRIMARY KEY,
      numero_guia VARCHAR(50) NOT NULL,
      almacen_id INTEGER REFERENCES almacenes(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha DATE NOT NULL DEFAULT CURRENT_DATE,
      creado_en TIMESTAMP DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS guias_numero_almacen_unique
      ON guias (numero_guia, almacen_id);

    -- El numero de guia solo tiene que ser unico entre las guias VIGENTES: si
    -- una se anula (cambio de guia del proveedor, error de carga), se puede
    -- volver a registrar el mismo numero. Se recrea el indice como parcial una
    -- sola vez.
    DO $mig$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'guias_numero_almacen_unique' AND indexdef LIKE '%ANULADA%'
      ) THEN
        DROP INDEX IF EXISTS guias_numero_almacen_unique;
        CREATE UNIQUE INDEX guias_numero_almacen_unique
          ON guias (numero_guia, almacen_id) WHERE estado <> 'ANULADA';
      END IF;
    END $mig$;

    -- Datos de proveedor/O.C. y estado de la guia (Fase A del nuevo spec del cliente)
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS proveedor VARCHAR(150);
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS numero_oc VARCHAR(50);
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS direccion VARCHAR(200);
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'CARGADA'
      CHECK (estado IN ('CARGADA', 'CERRADA'));
    -- Anular guia: motivo obligatorio, revierte el stock y retira sus codigos,
    -- la guia queda visible en el historial. El CHECK se recrea para sumar
    -- ANULADA (el ADD COLUMN de arriba no re-corre si la columna ya existe).
    ALTER TABLE guias DROP CONSTRAINT IF EXISTS guias_estado_check;
    ALTER TABLE guias ADD CONSTRAINT guias_estado_check
      CHECK (estado IN ('CARGADA', 'CERRADA', 'ANULADA'));
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS motivo_anulacion VARCHAR(200);
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS anulada_en TIMESTAMP;
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS anulada_por INTEGER REFERENCES usuarios(id);

    -- Guia de remision y factura del proveedor (Fase B, formato de impresion)
    -- Tipo del documento con que entra la guia: el numero_guia puede ser una
    -- guia de remision, una factura o una boleta; este campo lo aclara.
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20) NOT NULL DEFAULT 'GUIA';
    ALTER TABLE guias DROP CONSTRAINT IF EXISTS guias_tipo_documento_check;
    ALTER TABLE guias ADD CONSTRAINT guias_tipo_documento_check
      CHECK (tipo_documento IN ('GUIA', 'FACTURA', 'BOLETA', 'OTRO'));

    ALTER TABLE guias ADD COLUMN IF NOT EXISTS guia_remision VARCHAR(50);
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS factura VARCHAR(50);

    CREATE TABLE IF NOT EXISTS guia_items (
      id SERIAL PRIMARY KEY,
      guia_id INTEGER REFERENCES guias(id),
      producto_id INTEGER REFERENCES productos(id),
      cantidad NUMERIC(12,3) NOT NULL,
      tipo VARCHAR(20) NOT NULL DEFAULT 'PRODUCTO' CHECK (tipo IN ('PRODUCTO', 'SERVICIO')),
      descripcion VARCHAR(200),
      destino VARCHAR(20) CHECK (destino IS NULL OR destino IN ('ALMACEN', 'COMPRAS_DIARIAS', 'OTRO'))
    );

    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS recogido BOOLEAN;

    -- Desglose de partidas parciales de una linea EN_PARTIDA (Fase 7).
    CREATE TABLE IF NOT EXISTS guia_item_partidas (
      id SERIAL PRIMARY KEY,
      guia_item_id INTEGER REFERENCES guia_items(id),
      cantidad NUMERIC(12,3) NOT NULL,
      referencia VARCHAR(200)
    );

    -- Destino "Otro" (Bloque 5, Cambios_del_Sistema_Requerimientos.txt):
    -- mismo patron que categoria/categoria_detalle de Solicitud de
    -- Materiales. Se recrea el CHECK porque no tiene nombre propio -> el
    -- DROP/ADD es idempotente (en instalaciones nuevas el CHECK ya sale
    -- con OTRO incluido desde el CREATE TABLE de arriba, aca solo aplica
    -- a las que ya existian).
    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS destino_detalle VARCHAR(200);

    -- Tipo de linea PRODUCTO / SERVICIO (Bloque 6, Fase 8). Una linea SERVICIO
    -- solo se registra e imprime: nunca genera etiqueta ni toca inventario, y
    -- no tiene destino fisico. En instalaciones nuevas ya sale del CREATE TABLE
    -- de database.sql; aca solo aplica a las que ya existian.
    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'PRODUCTO';
    ALTER TABLE guia_items DROP CONSTRAINT IF EXISTS guia_items_tipo_check;
    ALTER TABLE guia_items ADD CONSTRAINT guia_items_tipo_check
      CHECK (tipo IN ('PRODUCTO', 'SERVICIO'));

    -- Texto libre de la linea SERVICIO (Fase 8): un servicio no va al catalogo
    -- de productos, se guarda su descripcion aca y producto_id queda NULL.
    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS descripcion VARCHAR(200);

    -- destino pasa a ser NULLABLE (las lineas SERVICIO lo dejan en NULL). El
    -- CHECK se recrea admitiendo NULL. Idempotente (DROP/ADD).
    ALTER TABLE guia_items ALTER COLUMN destino DROP NOT NULL;
    -- Fase 12 (R5): OFICINA y LABORATORIO se unifican en COMPRAS_DIARIAS. Los
    -- datos se migran ACA, antes de recrear el CHECK, para que una 2a corrida
    -- (con filas ya en COMPRAS_DIARIAS) no choque contra la lista vieja.
    UPDATE guia_items SET destino = 'COMPRAS_DIARIAS' WHERE destino IN ('OFICINA', 'LABORATORIO');
    ALTER TABLE guia_items DROP CONSTRAINT IF EXISTS guia_items_destino_check;
    ALTER TABLE guia_items ADD CONSTRAINT guia_items_destino_check
      CHECK (destino IS NULL OR destino IN ('ALMACEN', 'COMPRAS_DIARIAS', 'OTRO'));

    CREATE TABLE IF NOT EXISTS etiquetas (
      id SERIAL PRIMARY KEY,
      codigo INTEGER NOT NULL UNIQUE,
      guia_item_id INTEGER REFERENCES guia_items(id),
      producto_id INTEGER REFERENCES productos(id),
      almacen_id INTEGER REFERENCES almacenes(id),
      estado VARCHAR(20) NOT NULL DEFAULT 'EN_ALMACEN' CHECK (estado IN ('EN_ALMACEN', 'SALIO', 'REEMPLAZADA')),
      condicion VARCHAR(10) NOT NULL DEFAULT 'NUEVO' CHECK (condicion IN ('NUEVO', 'USADO')),
      fecha_generacion TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS etiqueta_historial (
      id SERIAL PRIMARY KEY,
      etiqueta_id INTEGER REFERENCES etiquetas(id),
      evento VARCHAR(20) NOT NULL CHECK (evento IN ('GENERADA', 'IMPRESA', 'REIMPRESA', 'SALIO', 'DEVOLVIO', 'TRANSFERIDA', 'REEMPLAZADA')),
      almacen_origen_id INTEGER REFERENCES almacenes(id),
      almacen_destino_id INTEGER REFERENCES almacenes(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha TIMESTAMP DEFAULT NOW(),
      detalle TEXT
    );

    -- Devoluciones "Usado" (Bloque 4, Cambios_del_Sistema_Requerimientos.txt):
    -- el codigo viejo pasa a estado REEMPLAZADA y se genera uno nuevo con
    -- condicion USADO. Los CHECK con nombre propio se recrean con DROP/ADD
    -- (idempotente); en instalaciones nuevas ya salen bien del CREATE de arriba.
    ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS condicion VARCHAR(10) NOT NULL DEFAULT 'NUEVO';
    ALTER TABLE etiquetas DROP CONSTRAINT IF EXISTS etiquetas_estado_check;
    ALTER TABLE etiquetas ADD CONSTRAINT etiquetas_estado_check
      CHECK (estado IN ('EN_ALMACEN', 'SALIO', 'REEMPLAZADA', 'ANULADA'));
    ALTER TABLE etiquetas DROP CONSTRAINT IF EXISTS etiquetas_condicion_check;
    ALTER TABLE etiquetas ADD CONSTRAINT etiquetas_condicion_check
      CHECK (condicion IN ('NUEVO', 'USADO'));
    -- Cantidad propia del codigo. Solo la usan los codigos USADO generados por
    -- una devolucion parcial (volvio menos de lo que salio). NULL = la cantidad
    -- es la del guia_item (el caso normal de un ingreso).
    ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS cantidad NUMERIC(12,3);
    -- Ubicacion fisica del codigo dentro del almacen (estante, rack, pasillo...).
    -- Texto libre, se completa DESPUES del ingreso a medida que se acomoda.
    ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS ubicacion VARCHAR(100);
    ALTER TABLE etiqueta_historial DROP CONSTRAINT IF EXISTS etiqueta_historial_evento_check;
    ALTER TABLE etiqueta_historial ADD CONSTRAINT etiqueta_historial_evento_check
      CHECK (evento IN ('GENERADA', 'IMPRESA', 'REIMPRESA', 'SALIO', 'DEVOLVIO', 'TRANSFERIDA', 'REEMPLAZADA', 'ANULADA', 'CORREGIDA'));

    CREATE SEQUENCE IF NOT EXISTS notas_salida_numero_seq START 1;

    CREATE TABLE IF NOT EXISTS notas_salida (
      id SERIAL PRIMARY KEY,
      numero_nota VARCHAR(20) NOT NULL UNIQUE,
      seccion VARCHAR(100),
      persona_responsable VARCHAR(150) NOT NULL,
      motivo VARCHAR(20) NOT NULL CHECK (motivo IN ('USO_INTERNO', 'PRESTAMO', 'REPARACION', 'DESECHO', 'OTRO')),
      guia_id INTEGER REFERENCES guias(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha TIMESTAMP DEFAULT NOW(),
      estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'DEVUELTO', 'CERRADO', 'EN_APROBACION')),
      observaciones TEXT
    );

    CREATE TABLE IF NOT EXISTS notas_salida_detalle (
      id SERIAL PRIMARY KEY,
      nota_salida_id INTEGER REFERENCES notas_salida(id),
      etiqueta_id INTEGER REFERENCES etiquetas(id),
      cantidad NUMERIC(12,3) NOT NULL,
      p_unitario NUMERIC(12,2),
      total NUMERIC(12,2),
      observaciones TEXT
    );

    ALTER TABLE notas_salida ADD COLUMN IF NOT EXISTS requiere_devolucion BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE notas_salida ADD COLUMN IF NOT EXISTS fecha_salida TIMESTAMP;

    -- Devoluciones "Usado" (Bloque 4): condicion/fecha en que volvio cada linea
    -- y el codigo nuevo si volvio usada.
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS devuelto_condicion VARCHAR(10);
    ALTER TABLE notas_salida_detalle DROP CONSTRAINT IF EXISTS notas_salida_detalle_devuelto_condicion_check;
    ALTER TABLE notas_salida_detalle ADD CONSTRAINT notas_salida_detalle_devuelto_condicion_check
      CHECK (devuelto_condicion IN ('NUEVO', 'USADO'));
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS devuelto_en TIMESTAMP;
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS etiqueta_devuelta_id INTEGER REFERENCES etiquetas(id);
    -- Devolucion USADA: datos reales de lo que volvio (panel al marcar
    -- "Devuelto usado"). devuelto_cantidad puede ser menor a la que salio;
    -- devuelto_peso es opcional (kg u otra unidad). NULL mientras no se devuelve
    -- o cuando volvio NUEVA (el mismo codigo entero).
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS devuelto_cantidad NUMERIC(12,3);
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS devuelto_peso NUMERIC(12,2);
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS devuelto_obs TEXT;
    -- Unidad en la que se registra la devolucion usada (Caja, Rollo, Kilogramo,
    -- etc del catalogo unidades_medida), en vez de asumir siempre peso.
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS devuelto_unidad_medida_id INTEGER REFERENCES unidades_medida(id);
    -- Presentacion en la que vuelve fisicamente (Caja/Rollo/Bolsa/Saco), aparte
    -- de la unidad de medida de arriba. Lista fija (no es un catalogo admin).
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS devuelto_presentacion VARCHAR(20);
    ALTER TABLE notas_salida_detalle DROP CONSTRAINT IF EXISTS notas_salida_detalle_devuelto_presentacion_check;
    ALTER TABLE notas_salida_detalle ADD CONSTRAINT notas_salida_detalle_devuelto_presentacion_check
      CHECK (devuelto_presentacion IN ('CAJA', 'ROLLO', 'BOLSA', 'SACO'));

    CREATE TABLE IF NOT EXISTS parametros_aprobacion (
      id SERIAL PRIMARY KEY,
      monto_minimo NUMERIC(12,2),
      activo BOOLEAN NOT NULL DEFAULT false
    );

    -- Solicitud de Materiales (Fase B): registro independiente, no ligado a
    -- inventario/etiquetas porque las lineas son texto libre (muestras,
    -- herramientas, etc.) que no siempre estan en el catalogo de productos.
    -- Atenderla solo cambia su estado, no genera movimientos de stock.
    CREATE SEQUENCE IF NOT EXISTS solicitudes_materiales_numero_seq START 1;

    CREATE TABLE IF NOT EXISTS solicitudes_materiales (
      id SERIAL PRIMARY KEY,
      numero_solicitud VARCHAR(20) NOT NULL UNIQUE,
      almacen_id INTEGER REFERENCES almacenes(id),
      seccion VARCHAR(100),
      persona_responsable VARCHAR(150) NOT NULL,
      categoria VARCHAR(20) NOT NULL CHECK (categoria IN ('MUESTRAS', 'INSUMOS', 'MATERIA_PRIMA', 'REPUESTOS', 'HERRAMIENTAS', 'OTROS')),
      categoria_detalle VARCHAR(200),
      periodo DATE,
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha TIMESTAMP DEFAULT NOW(),
      estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'ATENDIDA', 'RECHAZADA')),
      observaciones TEXT
    );

    CREATE TABLE IF NOT EXISTS solicitudes_materiales_detalle (
      id SERIAL PRIMARY KEY,
      solicitud_id INTEGER REFERENCES solicitudes_materiales(id),
      producto VARCHAR(200) NOT NULL,
      cantidad NUMERIC(12,2) NOT NULL
    );

    -- Compras diarias (Fase 10, Bloque 5): modulo nuevo aparte. Es un LOG de
    -- compras del dia (fecha, oficina, proveedor y lineas con monto), ligado
    -- OPCIONALMENTE a una Solicitud de Materiales. No tiene flujo de estados,
    -- no toca inventario ni etiquetas: solo se registra, se consulta e imprime.
    CREATE SEQUENCE IF NOT EXISTS compras_diarias_numero_seq START 1;

    CREATE TABLE IF NOT EXISTS compras_diarias (
      id SERIAL PRIMARY KEY,
      numero_compra VARCHAR(20) NOT NULL UNIQUE,
      fecha DATE NOT NULL,
      oficina VARCHAR(150) NOT NULL,
      proveedor VARCHAR(150),
      solicitud_id INTEGER REFERENCES solicitudes_materiales(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha_registro TIMESTAMP DEFAULT NOW(),
      observaciones TEXT
    );

    CREATE TABLE IF NOT EXISTS compras_diarias_detalle (
      id SERIAL PRIMARY KEY,
      compra_id INTEGER REFERENCES compras_diarias(id),
      descripcion VARCHAR(200) NOT NULL,
      cantidad NUMERIC(12,2) NOT NULL,
      monto_unitario NUMERIC(12,2) NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS actividad_log (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      usuario_nombre VARCHAR(100),
      accion VARCHAR(100),
      detalle TEXT,
      fecha TIMESTAMP DEFAULT NOW()
    );
    -- IP del equipo desde donde se hizo la accion (LAN). Sirve para saber
    -- que PC registro cada guia/nota cuando varios usuarios entran por red.
    ALTER TABLE actividad_log ADD COLUMN IF NOT EXISTS ip VARCHAR(45);

    CREATE TABLE IF NOT EXISTS alertas (
      id SERIAL PRIMARY KEY,
      almacen_id INTEGER REFERENCES almacenes(id),
      tipo VARCHAR(50),
      mensaje TEXT,
      leida BOOLEAN DEFAULT false,
      fecha TIMESTAMP DEFAULT NOW()
    );

    -- ==========================================================
    -- FASE 11 (R6): cantidades por Kilo / Metro con decimales
    -- ==========================================================
    -- Las cantidades eran INTEGER y los validadores rechazaban decimales a
    -- proposito. Ahora se admiten fracciones (ej. 1.2, 0.3, 3.5 m). Widening
    -- seguro: los enteros existentes quedan igual (3 -> 3.000; el front los
    -- muestra con fmtCantidad, sin ceros de mas). Idempotente: cada columna
    -- solo se convierte si todavia es integer.
    DO $mig$
    DECLARE
      col RECORD;
    BEGIN
      FOR col IN
        SELECT * FROM (VALUES
          ('guia_items',          'cantidad'),
          ('guia_item_partidas',  'cantidad'),
          ('etiquetas',           'cantidad'),
          ('notas_salida_detalle','cantidad'),
          ('notas_salida_detalle','devuelto_cantidad'),
          ('inventario',          'cantidad'),
          ('movimientos',         'cantidad')
        ) AS t(tabla, columna)
      LOOP
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = col.tabla AND column_name = col.columna
            AND data_type = 'integer'
        ) THEN
          EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC(12,3) USING %I::numeric',
            col.tabla, col.columna, col.columna);
          RAISE NOTICE 'Fase 11: %.% -> NUMERIC(12,3)', col.tabla, col.columna;
        END IF;
      END LOOP;
    END $mig$;

    -- Unidades que aceptan decimales (Kilo, Metro, Metro cuadrado, Litro). El
    -- resto (Unidad, Caja, Rollo, Plancha) siguen forzando entero en el front.
    ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS permite_decimal BOOLEAN NOT NULL DEFAULT false;
    UPDATE unidades_medida SET permite_decimal = true
      WHERE abreviatura IN ('KG', 'M', 'M2', 'L') AND permite_decimal = false;

    -- Devolucion parcial: cobrar solo lo consumido (ej. salieron 3.5 m, vuelven
    -- 2.5 m usados -> se consumio 1 m). cantidad_consumida = salio - volvio;
    -- total_consumido = ese consumo x el p_unitario de la linea (NULL si la
    -- nota no maneja precios). Se llenan al registrar/editar la devolucion.
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS cantidad_consumida NUMERIC(12,3);
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS total_consumido    NUMERIC(12,2);

    -- ==========================================================
    -- FASE 11 (R4): agrupador, observaciones y codigo de impresion
    -- ==========================================================
    -- guias.observaciones: la impresion de la Nota de Ingreso ya la referenciaba
    -- pero la columna no existia (nunca salia nada). guia_items.id_agrupador:
    -- codigo libre, se puede repetir en varias lineas para agruparlas en la
    -- impresion. observaciones por linea. codigo_impresion: etiqueta a imprimir
    -- en lugar del numero de secuencia, editable a mano antes de imprimir; NO
    -- toca etiquetas.codigo ni el codigo de barras.
    ALTER TABLE guias      ADD COLUMN IF NOT EXISTS observaciones TEXT;
    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS id_agrupador     VARCHAR(30);
    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS observaciones    VARCHAR(300);
    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS codigo_impresion VARCHAR(30);

    -- ==========================================================
    -- FASE 12 (R5): rol Almacenero 3 + destinos Oficina/Laboratorio -> Compras Diarias
    -- ==========================================================
    -- Nuevo perfil 'almacenero3' (mismos permisos que 'almacen', ver soloRoles
    -- en las rutas). El usuario de demo se siembra mas abajo.
    INSERT INTO roles (nombre) VALUES ('almacenero3') ON CONFLICT (nombre) DO NOTHING;

    -- La migracion de datos y el CHECK de guia_items.destino
    -- (OFICINA/LABORATORIO -> COMPRAS_DIARIAS) estan mas arriba, junto al
    -- ALTER COLUMN destino DROP NOT NULL, para respetar el orden.
    -- Cosmetico: las notas de salida automaticas viejas guardaban la seccion
    -- como texto 'Oficina' / 'Laboratorio'.
    UPDATE notas_salida SET seccion = 'Compras Diarias' WHERE seccion IN ('Oficina', 'Laboratorio');

    -- ==========================================================
    -- FASE 13 (R3): servicio EXTERNO / INTERNO
    -- ==========================================================
    -- Un servicio (guia_items.tipo='SERVICIO') puede ser EXTERNO (al guardar la
    -- guia se genera su Nota de Salida automatica, sin etiqueta ni inventario)
    -- o INTERNO (genera un codigo unico, queda retenido en almacen, tampoco
    -- mueve inventario). servicio_modo solo aplica cuando tipo='SERVICIO'.
    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS servicio_modo VARCHAR(10);
    ALTER TABLE guia_items DROP CONSTRAINT IF EXISTS guia_items_servicio_modo_check;
    ALTER TABLE guia_items ADD  CONSTRAINT guia_items_servicio_modo_check
      CHECK (servicio_modo IS NULL OR servicio_modo IN ('EXTERNO', 'INTERNO'));
    -- Unidad de medida por linea: para lineas SERVICIO (no tienen producto en
    -- el catalogo) y como override opcional de una linea PRODUCTO. Si esta
    -- NULL en una linea PRODUCTO se usa la del catalogo (productos.unidad_medida_id).
    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS unidad_medida_id INTEGER REFERENCES unidades_medida(id);
    -- Detalle de nota de salida SIN etiqueta: linea de servicio EXTERNO. La
    -- descripcion del servicio va aca (etiqueta_id ya es NULLABLE).
    ALTER TABLE notas_salida_detalle ADD COLUMN IF NOT EXISTS descripcion_servicio VARCHAR(200);

    -- ==========================================================
    -- FASE 13 (R1): impresion parametrizada
    -- ==========================================================
    -- Que mostrar en cada documento impreso (INGRESO / SALIDA / DEVOLUCION) y
    -- cuantas lineas por hoja. Lo edita solo admin desde /configuracion.
    CREATE TABLE IF NOT EXISTS parametros_impresion (
      id SERIAL PRIMARY KEY,
      documento VARCHAR(20) NOT NULL UNIQUE
        CHECK (documento IN ('INGRESO', 'SALIDA', 'DEVOLUCION')),
      mostrar_precio        BOOLEAN NOT NULL DEFAULT true,
      mostrar_ubicacion     BOOLEAN NOT NULL DEFAULT true,
      mostrar_motivo        BOOLEAN NOT NULL DEFAULT true,
      mostrar_observaciones BOOLEAN NOT NULL DEFAULT true,
      mostrar_partidas      BOOLEAN NOT NULL DEFAULT true,
      lineas_por_pagina     SMALLINT NOT NULL DEFAULT 6 CHECK (lineas_por_pagina BETWEEN 4 AND 12),
      pie_texto             VARCHAR(300)
    );
    INSERT INTO parametros_impresion (documento) VALUES ('INGRESO'), ('SALIDA'), ('DEVOLUCION')
      ON CONFLICT (documento) DO NOTHING;

    -- ==========================================================
    -- FASE 14 (R7-a): periodos por almacen
    -- ==========================================================
    -- Un periodo ACTIVO por almacen (indice unico parcial). Toda guia / nota
    -- de salida / etiqueta nueva se graba con el periodo_id activo de su
    -- almacen. ~8 periodos/año, rangos de fecha libres. Al cerrar (Fase 15) se
    -- congela la foto de stock y se arrastra el saldo al periodo siguiente.
    CREATE TABLE IF NOT EXISTS periodos (
      id SERIAL PRIMARY KEY,
      almacen_id INTEGER NOT NULL REFERENCES almacenes(id),
      nombre VARCHAR(60) NOT NULL,
      fecha_inicio DATE NOT NULL,
      fecha_fin DATE,
      estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'CERRADO')),
      periodo_anterior_id INTEGER REFERENCES periodos(id),
      cerrado_por INTEGER REFERENCES usuarios(id),
      cerrado_en TIMESTAMP,
      reabierto_en TIMESTAMP,
      usuario_id INTEGER REFERENCES usuarios(id),
      creado_en TIMESTAMP DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS periodos_activo_por_almacen
      ON periodos (almacen_id) WHERE estado = 'ACTIVO';

    -- Foto de stock por producto al abrir (APERTURA) y al cerrar (CIERRE) un
    -- periodo. APERTURA(n+1) = CIERRE(n) -> arrastre de saldo (Fase 15).
    CREATE TABLE IF NOT EXISTS periodos_saldos (
      id SERIAL PRIMARY KEY,
      periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
      tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('APERTURA', 'CIERRE')),
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      stock_nuevo      NUMERIC(12,3) NOT NULL DEFAULT 0,
      stock_devolucion NUMERIC(12,3) NOT NULL DEFAULT 0,
      UNIQUE (periodo_id, tipo, producto_id)
    );

    ALTER TABLE guias        ADD COLUMN IF NOT EXISTS periodo_id INTEGER REFERENCES periodos(id);
    ALTER TABLE notas_salida ADD COLUMN IF NOT EXISTS periodo_id INTEGER REFERENCES periodos(id);
    ALTER TABLE etiquetas    ADD COLUMN IF NOT EXISTS periodo_id INTEGER REFERENCES periodos(id);
  `)

  // Fase 14: backfill. Corre una sola vez (guarda: no hay periodos todavia).
  // Por cada almacen crea un "Periodo inicial" ACTIVO (desde la guia mas
  // antigua o hoy) y engancha las guias / notas / etiquetas existentes. La
  // APERTURA del periodo inicial = foto actual de inventario (asi el
  // movimiento del periodo arranca en 0 desde ahora).
  const hayPeriodos = await pool.query('SELECT 1 FROM periodos LIMIT 1')
  if (hayPeriodos.rows.length === 0) {
    const almacenes = await pool.query('SELECT id FROM almacenes ORDER BY id')
    for (const alm of almacenes.rows) {
      const desde = await pool.query(
        `SELECT COALESCE(MIN(fecha), CURRENT_DATE) AS d FROM guias WHERE almacen_id = $1`,
        [alm.id]
      )
      const per = await pool.query(
        `INSERT INTO periodos (almacen_id, nombre, fecha_inicio, estado)
         VALUES ($1, 'Periodo inicial', $2, 'ACTIVO') RETURNING id`,
        [alm.id, desde.rows[0].d]
      )
      const periodoId = per.rows[0].id
      await pool.query(`UPDATE guias SET periodo_id = $1 WHERE almacen_id = $2 AND periodo_id IS NULL`, [periodoId, alm.id])
      await pool.query(
        `UPDATE etiquetas SET periodo_id = $1 WHERE almacen_id = $2 AND periodo_id IS NULL`,
        [periodoId, alm.id]
      )
      await pool.query(
        `UPDATE notas_salida n SET periodo_id = $1
         WHERE periodo_id IS NULL AND EXISTS (
           SELECT 1 FROM notas_salida_detalle d JOIN etiquetas e ON d.etiqueta_id = e.id
           WHERE d.nota_salida_id = n.id AND e.almacen_id = $2)`,
        [periodoId, alm.id]
      )
      // Notas de servicio EXTERNO no tienen etiqueta -> se enganchan por su guia.
      await pool.query(
        `UPDATE notas_salida n SET periodo_id = $1
         WHERE n.periodo_id IS NULL AND n.guia_id IN (SELECT id FROM guias WHERE almacen_id = $2)`,
        [periodoId, alm.id]
      )
      await pool.query(
        `INSERT INTO periodos_saldos (periodo_id, tipo, producto_id, stock_nuevo, stock_devolucion)
         SELECT $1, 'APERTURA', producto_id,
                COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'NUEVO'), 0),
                COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'DEVOLUCION'), 0)
         FROM inventario WHERE almacen_id = $2 AND producto_id IS NOT NULL
         GROUP BY producto_id`,
        [periodoId, alm.id]
      )
    }
    console.log('Fase 14: periodos iniciales creados')
  }

  const rolesExist = await pool.query('SELECT COUNT(*) FROM roles')
  if (parseInt(rolesExist.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO roles (nombre) VALUES
        ('admin'),('almacen'),('mantenimiento'),('compras')
    `)
    console.log('Roles creados')
  }

  // Migracion: el set de roles paso de admin/supervisor/operador/auditor/
  // transportista a los 4 perfiles reales de la empresa (admin/almacen/
  // mantenimiento/compras). Se renombra en vez de recrear para no perder
  // usuarios existentes. Idempotente: cada UPDATE deja de encontrar filas
  // despues de la primera corrida, asi que corre sin condicion en cada
  // arranque.
  await pool.query(`UPDATE roles SET nombre = 'almacen' WHERE nombre = 'supervisor'`)
  await pool.query(`
    UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE nombre = 'almacen')
    WHERE rol_id = (SELECT id FROM roles WHERE nombre = 'operador')
  `)
  await pool.query(`DELETE FROM roles WHERE nombre = 'operador'`)
  await pool.query(`UPDATE roles SET nombre = 'compras' WHERE nombre = 'auditor'`)
  await pool.query(`UPDATE roles SET nombre = 'mantenimiento' WHERE nombre = 'transportista'`)

  // Alinea las cuentas de demo pre-existentes con los nuevos emails/roles
  // (idempotente por el mismo motivo: la busqueda por email viejo deja de
  // encontrar filas despues de la primera corrida). La cuenta vieja de
  // 'operador' no se renombra ni se borra -> queda con rol 'almacen' (ya
  // migrado arriba), simplemente duplicada con la nueva cuenta 'almacen@'.
  const renombresDemo = [
    { emailViejo: 'supervisor@sibarita.com', nombre: 'Almacen MALSA',       email: 'almacen@sibarita.com',       pass: 'almac123' },
    { emailViejo: 'auditor@sibarita.com',    nombre: 'Compras MALSA',       email: 'compras@sibarita.com',       pass: 'compras123' },
    { emailViejo: 'transporte@sibarita.com', nombre: 'Mantenimiento MALSA', email: 'mantenimiento@sibarita.com', pass: 'mant123' },
  ]
  for (const r of renombresDemo) {
    const hash = await bcrypt.hash(r.pass, 10)
    await pool.query(
      `UPDATE usuarios SET nombre = $1, email = $2, password = $3 WHERE email = $4`,
      [r.nombre, r.email, hash, r.emailViejo]
    )
  }

  const unidadesExist = await pool.query('SELECT COUNT(*) FROM unidades_medida')
  if (parseInt(unidadesExist.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO unidades_medida (nombre, abreviatura) VALUES
        ('Unidad','U'),('Kilogramo','KG'),('Metro','M'),('Metro cuadrado','M2'),
        ('Litro','L'),('Caja','CJA'),('Rollo','ROLLO'),('Plancha','PLANCHA')
    `)
    console.log('Unidades de medida creadas')
  }

  const productosExist = await pool.query('SELECT COUNT(*) FROM productos')
  if (parseInt(productosExist.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO productos (nombre) VALUES ('Producto General')
    `)
    console.log('Productos creados')
  }

  const almacenesExist = await pool.query('SELECT COUNT(*) FROM almacenes')
  if (parseInt(almacenesExist.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO almacenes (nombre, ubicacion) VALUES
        ('MALSA','Zona Norte'),('JOPISA','Zona Centro'),('INDELPAS','Zona Sur')
    `)
    await pool.query(`
      INSERT INTO inventario (almacen_id, producto_id, tipo, cantidad) VALUES
        (1,1,'NUEVO',1300),(1,1,'DEVOLUCION',1200),
        (2,1,'NUEVO',1400),(2,1,'DEVOLUCION',600),
        (3,1,'NUEVO',840),(3,1,'DEVOLUCION',400)
    `)
    console.log('Almacenes e inventario inicial creados')
  }

  // Asigna un producto por defecto a registros existentes de antes de este catalogo
  await pool.query(`
    UPDATE inventario SET producto_id = (SELECT id FROM productos ORDER BY id LIMIT 1)
    WHERE producto_id IS NULL
  `)

  const usuariosExist = await pool.query('SELECT COUNT(*) FROM usuarios')
  if (parseInt(usuariosExist.rows[0].count) === 0) {
    const usuarios = [
      { nombre: 'Administrador',        email: 'admin@sibarita.com',         pass: 'admin123',  rol: 1, almacen: null },
      { nombre: 'Almacen MALSA',        email: 'almacen@sibarita.com',       pass: 'almac123',  rol: 2, almacen: 1   },
      { nombre: 'Mantenimiento MALSA',  email: 'mantenimiento@sibarita.com', pass: 'mant123',   rol: 3, almacen: 1   },
      { nombre: 'Compras MALSA',        email: 'compras@sibarita.com',       pass: 'compras123', rol: 4, almacen: null },
    ]
    for (const u of usuarios) {
      const hash = await bcrypt.hash(u.pass, 10)
      await pool.query(
        'INSERT INTO usuarios (nombre,email,password,rol_id,almacen_id) VALUES ($1,$2,$3,$4,$5)',
        [u.nombre, u.email, hash, u.rol, u.almacen]
      )
    }
    console.log('Usuarios creados')
  }

  // Almacenero 1 / Almacenero 2 (rol 'almacen', mismo almacen MALSA): dos
  // cuentas para probar el multiusuario LAN (dos PCs guardando guias del
  // mismo almacen a la vez). A diferencia del bloque de arriba, esto corre
  // siempre -- no solo en tabla vacia -- porque instalaciones existentes
  // (instalador 1.4.0 sobre una BD ya usada) nunca pasan por ese bloque, y
  // los botones de "Usuarios de prueba" del login los necesitan igual.
  const almaceneroDemo = [
    { nombre: 'Almacenero 1', email: 'almacenero1@sibarita.com', pass: 'almacenero1' },
    { nombre: 'Almacenero 2', email: 'almacenero2@sibarita.com', pass: 'almacenero2' },
  ]
  for (const u of almaceneroDemo) {
    const hash = await bcrypt.hash(u.pass, 10)
    await pool.query(
      `INSERT INTO usuarios (nombre,email,password,rol_id,almacen_id)
       VALUES ($1,$2,$3,2,1)
       ON CONFLICT (email) DO NOTHING`,
      [u.nombre, u.email, hash]
    )
  }

  // Almacenero 3 (Fase 12, R5): nuevo perfil 'almacenero3'. rol_id no es fijo
  // (SERIAL), asi que se resuelve por nombre. Corre siempre, igual que el
  // bloque de arriba, para instalaciones existentes y el login de prueba.
  {
    const hash = await bcrypt.hash('almacenero3', 10)
    await pool.query(
      `INSERT INTO usuarios (nombre,email,password,rol_id,almacen_id)
       VALUES ('Almacenero 3','almacenero3@sibarita.com',$1,
               (SELECT id FROM roles WHERE nombre = 'almacenero3'),1)
       ON CONFLICT (email) DO NOTHING`,
      [hash]
    )
  }

  console.log('Base de datos lista.')
}

module.exports = setup
