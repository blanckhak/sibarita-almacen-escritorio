-- Base de datos Sibarita
CREATE DATABASE sibarita_db;

\c sibarita_db;

-- Tabla de roles
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

-- 4 perfiles reales de la empresa: admin (todo), almacen (opera el dia a
-- dia: guias, notas de salida, inventario, movimientos, atiende solicitudes),
-- mantenimiento (crea Solicitudes de Materiales, ve lo que le entregan),
-- compras (solo lectura sobre guias/reportes/historial).
INSERT INTO roles (nombre) VALUES
  ('admin'),
  ('almacen'),
  ('mantenimiento'),
  ('compras');

-- Tabla de almacenes
CREATE TABLE almacenes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  ubicacion VARCHAR(200),
  creado_en TIMESTAMP DEFAULT NOW()
);

INSERT INTO almacenes (nombre, ubicacion) VALUES
  ('MALSA',    'Zona Norte'),
  ('JOPISA',   'Zona Centro'),
  ('INDELPAS', 'Zona Sur');

-- Tabla de usuarios
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol_id INTEGER REFERENCES roles(id),
  almacen_id INTEGER REFERENCES almacenes(id),
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- Tabla de unidades de medida (catalogo administrable, Fase 2 seccion 5.4)
CREATE TABLE unidades_medida (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  abreviatura VARCHAR(10)
);

-- Fase 11 (R6): permite_decimal marca las unidades que aceptan cantidades
-- fraccionadas (Kilo, Metro, Metro cuadrado, Litro). El resto fuerza entero
-- en el formulario.
ALTER TABLE unidades_medida ADD COLUMN permite_decimal BOOLEAN NOT NULL DEFAULT false;

INSERT INTO unidades_medida (nombre, abreviatura, permite_decimal) VALUES
  ('Unidad',        'U',       false),
  ('Kilogramo',     'KG',      true),
  ('Metro',         'M',       true),
  ('Metro cuadrado','M2',      true),
  ('Litro',         'L',       true),
  ('Caja',          'CJA',     false),
  ('Rollo',         'ROLLO',   false),
  ('Plancha',       'PLANCHA', false);

-- Tabla de productos (catalogo maestro, Fase 2 seccion 5.4)
CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  categoria VARCHAR(100),
  unidad_medida_id INTEGER REFERENCES unidades_medida(id),
  codigo_interno VARCHAR(50),
  -- Metrica (Bloque 2, Fase 7): atributo FIJO del producto en el catalogo.
  -- ENTERO = comportamiento normal (se ingresa una cantidad). EN_PARTIDA =
  -- al ingresarlo en una guia se desglosa en partidas parciales
  -- (cantidad + referencia) que suman la cantidad total de la linea.
  metrica VARCHAR(10) NOT NULL DEFAULT 'ENTERO' CHECK (metrica IN ('ENTERO', 'EN_PARTIDA')),
  creado_en TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX productos_codigo_interno_unique
  ON productos (codigo_interno) WHERE codigo_interno IS NOT NULL;

-- El dedup de producto nuevo por nombre (guias.js) compara sin distinguir
-- mayusculas/minusculas; este indice hace que esa misma nocion de igualdad
-- sea la que realmente impide duplicados a nivel de base de datos.
CREATE UNIQUE INDEX productos_nombre_lower_unique ON productos (LOWER(nombre));

-- "Stock consolidado" (Bloque 3): forma canonica del nombre (minusculas, sin
-- tildes y sin nada que no sea letra/numero) para que variantes como
-- "Tornillo 1/2", "tornillo  1 - 2" y "Tornillo1/2" se traten como el mismo
-- producto y su stock no se parta.
CREATE OR REPLACE FUNCTION producto_canon(txt text) RETURNS text AS $func$
  SELECT regexp_replace(
    translate(lower(coalesce(txt, '')), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]', '', 'g')
$func$ LANGUAGE sql IMMUTABLE;

CREATE UNIQUE INDEX productos_canon_unique ON productos (producto_canon(nombre));

INSERT INTO productos (nombre) VALUES ('Producto General');

-- Tabla de inventario
CREATE TABLE inventario (
  id SERIAL PRIMARY KEY,
  almacen_id INTEGER REFERENCES almacenes(id),
  producto_id INTEGER REFERENCES productos(id),
  tipo VARCHAR(20) CHECK (tipo IN ('NUEVO', 'DEVOLUCION')),
  -- Fase 11 (R6): NUMERIC(12,3) para stock fraccionado por Kilo / Metro.
  cantidad NUMERIC(12,3) NOT NULL DEFAULT 0,
  descripcion TEXT,
  creado_en TIMESTAMP DEFAULT NOW()
);

INSERT INTO inventario (almacen_id, producto_id, tipo, cantidad) VALUES
  (1, 1, 'NUEVO',      1300),
  (1, 1, 'DEVOLUCION', 1200),
  (2, 1, 'NUEVO',      1400),
  (2, 1, 'DEVOLUCION',  600),
  (3, 1, 'NUEVO',       840),
  (3, 1, 'DEVOLUCION',  400);

-- Tabla de movimientos
CREATE TABLE movimientos (
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

-- Ingreso por guia (Fase 2 seccion 5.1-5.3)
CREATE SEQUENCE etiquetas_codigo_seq START 9001;

CREATE TABLE guias (
  id SERIAL PRIMARY KEY,
  numero_guia VARCHAR(50) NOT NULL,
  almacen_id INTEGER REFERENCES almacenes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  creado_en TIMESTAMP DEFAULT NOW(),
  -- Datos de proveedor/O.C. (Fase A): el proveedor es texto libre porque
  -- puede variar de una guia a otra, la O.C. puede no existir al momento
  -- del ingreso y agregarse despues via edicion.
  proveedor VARCHAR(150),
  numero_oc VARCHAR(50),
  direccion VARCHAR(200),
  -- El numero_guia puede ser una guia de remision, factura o boleta;
  -- tipo_documento lo aclara.
  tipo_documento VARCHAR(20) NOT NULL DEFAULT 'GUIA'
    CHECK (tipo_documento IN ('GUIA', 'FACTURA', 'BOLETA', 'OTRO')),
  estado VARCHAR(20) NOT NULL DEFAULT 'CARGADA' CHECK (estado IN ('CARGADA', 'CERRADA', 'ANULADA')),
  -- Anular guia: motivo obligatorio, revierte el stock y retira sus codigos.
  motivo_anulacion VARCHAR(200),
  anulada_en TIMESTAMP,
  anulada_por INTEGER REFERENCES usuarios(id),
  -- Datos del documento fisico del proveedor (Fase B, formato de impresion):
  -- el numero de guia interno de Sibarita no es el mismo que la guia de
  -- remision o factura que trae el proveedor, y el formato fisico "Nota de
  -- Ingresos de Activos" los pide como campos separados.
  guia_remision VARCHAR(50),
  factura VARCHAR(50),
  -- Fase 11 (R4): observacion general de la guia (se imprime en la Nota de
  -- Ingreso; antes se referenciaba sin que la columna existiera).
  observaciones TEXT
);

-- Unico solo entre guias vigentes: una guia ANULADA libera su numero para
-- volver a registrarlo (cambio de guia del proveedor / error de carga).
CREATE UNIQUE INDEX guias_numero_almacen_unique
  ON guias (numero_guia, almacen_id) WHERE estado <> 'ANULADA';

CREATE TABLE guia_items (
  id SERIAL PRIMARY KEY,
  guia_id INTEGER REFERENCES guias(id),
  -- NULL en lineas SERVICIO (Fase 8): un servicio no usa el catalogo de
  -- productos, se describe en texto libre en `descripcion`.
  producto_id INTEGER REFERENCES productos(id),
  -- Para lineas de producto EN_PARTIDA (Fase 7), esta cantidad es la suma
  -- de las filas de guia_item_partidas; para ENTERO se ingresa directo.
  -- Fase 11 (R6): NUMERIC(12,3) para cantidades por Kilo / Metro.
  cantidad NUMERIC(12,3) NOT NULL,
  -- Tipo de linea (Bloque 6, Fase 8): PRODUCTO = ingreso normal (puede generar
  -- etiqueta y mover inventario). SERVICIO = solo se registra e imprime
  -- (mantenimiento, limpieza, etc.), nunca genera etiqueta ni toca inventario.
  tipo VARCHAR(20) NOT NULL DEFAULT 'PRODUCTO' CHECK (tipo IN ('PRODUCTO', 'SERVICIO')),
  -- Texto libre del servicio; solo se usa cuando tipo = 'SERVICIO'.
  descripcion VARCHAR(200),
  -- destino es NULL en lineas SERVICIO (no van a ningun almacen fisico).
  -- Fase 12 (R5): OFICINA y LABORATORIO se unificaron en COMPRAS_DIARIAS.
  destino VARCHAR(20) CHECK (destino IS NULL OR destino IN ('ALMACEN', 'COMPRAS_DIARIAS', 'OTRO')),
  -- Solo aplica cuando destino es COMPRAS_DIARIAS/OTRO: si ya lo recogieron
  -- (true) sale automatico sin etiqueta; si no (false), se queda en almacen
  -- etiquetado hasta que lo recojan, igual que un item con destino ALMACEN.
  recogido BOOLEAN,
  -- Obligatorio cuando destino = 'OTRO' (Bloque 5, mismo patron que
  -- categoria/categoria_detalle de Solicitud de Materiales).
  destino_detalle VARCHAR(200),
  -- Fase 11 (R4): id_agrupador = codigo libre, se puede repetir en varias
  -- lineas para agruparlas en la impresion. observaciones por linea.
  -- codigo_impresion = etiqueta a imprimir en lugar del numero de secuencia
  -- (editable a mano antes de imprimir); NO toca etiquetas.codigo ni el
  -- codigo de barras.
  id_agrupador VARCHAR(30),
  observaciones VARCHAR(300),
  codigo_impresion VARCHAR(30),
  -- Fase 13 (R3): solo cuando tipo='SERVICIO'. EXTERNO = al guardar la guia
  -- genera su Nota de Salida automatica (sin etiqueta ni inventario). INTERNO
  -- = genera un codigo unico y queda retenido en almacen (tampoco mueve
  -- inventario).
  servicio_modo VARCHAR(10) CHECK (servicio_modo IS NULL OR servicio_modo IN ('EXTERNO', 'INTERNO')),
  -- Unidad de medida por linea: para SERVICIO (sin producto en el catalogo) y
  -- como override opcional de una linea PRODUCTO. NULL en PRODUCTO = se usa la
  -- del catalogo (productos.unidad_medida_id).
  unidad_medida_id INTEGER REFERENCES unidades_medida(id)
);

-- Desglose de una linea de guia cuyo producto se maneja EN_PARTIDA
-- (Bloque 2, Fase 7): p. ej. "3 cajas de 12" se cargan como 3 partidas.
-- La suma de cantidad de las partidas es la cantidad de la linea.
CREATE TABLE guia_item_partidas (
  id SERIAL PRIMARY KEY,
  guia_item_id INTEGER REFERENCES guia_items(id),
  cantidad NUMERIC(12,3) NOT NULL,
  referencia VARCHAR(200)
);

-- Codigo unico por producto que se queda en almacen (Fase 2 seccion 5.2)
CREATE TABLE etiquetas (
  id SERIAL PRIMARY KEY,
  codigo INTEGER NOT NULL UNIQUE,
  guia_item_id INTEGER REFERENCES guia_items(id),
  producto_id INTEGER REFERENCES productos(id),
  almacen_id INTEGER REFERENCES almacenes(id),
  -- REEMPLAZADA (Bloque 4): estado terminal del codigo viejo cuando el item
  -- vuelve "usado" y se le asigna un codigo nuevo.
  estado VARCHAR(20) NOT NULL DEFAULT 'EN_ALMACEN' CHECK (estado IN ('EN_ALMACEN', 'SALIO', 'REEMPLAZADA', 'ANULADA')),
  -- NUEVO / USADO (Bloque 4): un codigo generado por devolucion "usada"
  -- nace con condicion USADO y su stock va aparte del stock nuevo.
  condicion VARCHAR(10) NOT NULL DEFAULT 'NUEVO' CHECK (condicion IN ('NUEVO', 'USADO')),
  -- Cantidad propia del codigo: solo la usan los codigos USADO de una
  -- devolucion parcial. NULL = la cantidad es la del guia_item.
  -- Fase 11 (R6): NUMERIC(12,3).
  cantidad NUMERIC(12,3),
  -- Ubicacion fisica dentro del almacen (estante/rack/pasillo). Texto libre,
  -- se completa despues del ingreso.
  ubicacion VARCHAR(100),
  fecha_generacion TIMESTAMP DEFAULT NOW()
);

-- Bitacora de eventos de cada codigo (Fase 2 seccion 14 punto 3)
CREATE TABLE etiqueta_historial (
  id SERIAL PRIMARY KEY,
  etiqueta_id INTEGER REFERENCES etiquetas(id),
  evento VARCHAR(20) NOT NULL CHECK (evento IN ('GENERADA', 'IMPRESA', 'REIMPRESA', 'SALIO', 'DEVOLVIO', 'TRANSFERIDA', 'REEMPLAZADA', 'ANULADA', 'CORREGIDA')),
  almacen_origen_id INTEGER REFERENCES almacenes(id),
  almacen_destino_id INTEGER REFERENCES almacenes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha TIMESTAMP DEFAULT NOW(),
  detalle TEXT
);

-- Nota de salida multiple (Fase 2 seccion 5.5, CU-02, CU-03)
CREATE SEQUENCE notas_salida_numero_seq START 1;

CREATE TABLE notas_salida (
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

CREATE TABLE notas_salida_detalle (
  id SERIAL PRIMARY KEY,
  nota_salida_id INTEGER REFERENCES notas_salida(id),
  -- NULL en lineas de servicio EXTERNO (Fase 13): no hay etiqueta, la
  -- descripcion va en descripcion_servicio.
  etiqueta_id INTEGER REFERENCES etiquetas(id),
  cantidad NUMERIC(12,3) NOT NULL,
  p_unitario NUMERIC(12,2),
  total NUMERIC(12,2),
  observaciones TEXT,
  descripcion_servicio VARCHAR(200),
  -- Devolucion (Bloque 4): condicion en la que volvio la linea, cuando volvio,
  -- y el codigo nuevo generado si volvio "usada". NULL mientras la linea
  -- sigue afuera.
  devuelto_condicion VARCHAR(10) CHECK (devuelto_condicion IN ('NUEVO', 'USADO')),
  devuelto_en TIMESTAMP,
  etiqueta_devuelta_id INTEGER REFERENCES etiquetas(id),
  -- Devolucion USADA: datos reales de lo que volvio (puede ser menos que lo que
  -- salio). devuelto_peso es opcional. NULL si volvio NUEVA o sigue afuera.
  devuelto_cantidad NUMERIC(12,3),
  devuelto_peso NUMERIC(12,2),
  devuelto_obs TEXT,
  -- Unidad de la devolucion usada (Caja, Rollo, Kilogramo, etc del catalogo
  -- unidades_medida), en vez de asumir siempre peso.
  devuelto_unidad_medida_id INTEGER REFERENCES unidades_medida(id),
  -- Presentacion en la que vuelve fisicamente, aparte de la unidad de medida.
  -- Lista fija (no es un catalogo admin): CAJA / ROLLO / BOLSA / SACO.
  devuelto_presentacion VARCHAR(20) CHECK (devuelto_presentacion IN ('CAJA', 'ROLLO', 'BOLSA', 'SACO')),
  -- Fase 11 (R6): devolucion parcial cobra solo lo consumido.
  -- cantidad_consumida = lo que salio menos lo que volvio; total_consumido =
  -- ese consumo x p_unitario (NULL si la nota no maneja precios).
  cantidad_consumida NUMERIC(12,3),
  total_consumido NUMERIC(12,2)
);

ALTER TABLE notas_salida ADD COLUMN requiere_devolucion BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notas_salida ADD COLUMN fecha_salida TIMESTAMP;

-- Umbral para aprobacion previa de salidas de alto valor (Fase 2 seccion 14 punto 5, CU-05)
CREATE TABLE parametros_aprobacion (
  id SERIAL PRIMARY KEY,
  monto_minimo NUMERIC(12,2),
  activo BOOLEAN NOT NULL DEFAULT false
);

-- Fase 13 (R1): que mostrar en cada documento impreso y cuantas lineas por
-- hoja. Una fila por documento; lo edita solo admin desde /configuracion.
CREATE TABLE parametros_impresion (
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

INSERT INTO parametros_impresion (documento) VALUES ('INGRESO'), ('SALIDA'), ('DEVOLUCION');

-- Solicitud de Materiales (Fase B): registro independiente, no ligado a
-- inventario/etiquetas porque las lineas son texto libre (muestras,
-- herramientas, etc.) que no siempre estan en el catalogo de productos.
-- Atenderla solo cambia su estado, no genera movimientos de stock.
CREATE SEQUENCE solicitudes_materiales_numero_seq START 1;

CREATE TABLE solicitudes_materiales (
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

CREATE TABLE solicitudes_materiales_detalle (
  id SERIAL PRIMARY KEY,
  solicitud_id INTEGER REFERENCES solicitudes_materiales(id),
  producto VARCHAR(200) NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL
);

-- Compras diarias (Fase 10, Bloque 5): log de compras del dia, ligado
-- opcionalmente a una Solicitud de Materiales. Sin flujo de estados, no toca
-- inventario ni etiquetas.
CREATE SEQUENCE compras_diarias_numero_seq START 1;

CREATE TABLE compras_diarias (
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

CREATE TABLE compras_diarias_detalle (
  id SERIAL PRIMARY KEY,
  compra_id INTEGER REFERENCES compras_diarias(id),
  descripcion VARCHAR(200) NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL,
  monto_unitario NUMERIC(12,2) NOT NULL DEFAULT 0
);
