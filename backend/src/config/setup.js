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

    CREATE TABLE IF NOT EXISTS inventario (
      id SERIAL PRIMARY KEY,
      almacen_id INTEGER REFERENCES almacenes(id),
      producto_id INTEGER REFERENCES productos(id),
      tipo VARCHAR(20) CHECK (tipo IN ('NUEVO', 'DEVOLUCION')),
      cantidad INTEGER NOT NULL DEFAULT 0,
      descripcion TEXT,
      creado_en TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS movimientos (
      id SERIAL PRIMARY KEY,
      almacen_origen_id INTEGER REFERENCES almacenes(id),
      almacen_destino_id INTEGER REFERENCES almacenes(id),
      producto_id INTEGER REFERENCES productos(id),
      tipo VARCHAR(50),
      cantidad INTEGER,
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

    -- Datos de proveedor/O.C. y estado de la guia (Fase A del nuevo spec del cliente)
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS proveedor VARCHAR(150);
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS numero_oc VARCHAR(50);
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS direccion VARCHAR(200);
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'CARGADA'
      CHECK (estado IN ('CARGADA', 'CERRADA'));

    -- Guia de remision y factura del proveedor (Fase B, formato de impresion)
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS guia_remision VARCHAR(50);
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS factura VARCHAR(50);

    CREATE TABLE IF NOT EXISTS guia_items (
      id SERIAL PRIMARY KEY,
      guia_id INTEGER REFERENCES guias(id),
      producto_id INTEGER REFERENCES productos(id),
      cantidad INTEGER NOT NULL,
      tipo VARCHAR(20) NOT NULL DEFAULT 'PRODUCTO' CHECK (tipo IN ('PRODUCTO', 'SERVICIO')),
      descripcion VARCHAR(200),
      destino VARCHAR(20) CHECK (destino IS NULL OR destino IN ('ALMACEN', 'OFICINA', 'LABORATORIO', 'OTRO'))
    );

    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS recogido BOOLEAN;

    -- Desglose de partidas parciales de una linea EN_PARTIDA (Fase 7).
    CREATE TABLE IF NOT EXISTS guia_item_partidas (
      id SERIAL PRIMARY KEY,
      guia_item_id INTEGER REFERENCES guia_items(id),
      cantidad INTEGER NOT NULL,
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
    ALTER TABLE guia_items DROP CONSTRAINT IF EXISTS guia_items_destino_check;
    ALTER TABLE guia_items ADD CONSTRAINT guia_items_destino_check
      CHECK (destino IS NULL OR destino IN ('ALMACEN', 'OFICINA', 'LABORATORIO', 'OTRO'));

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
      CHECK (estado IN ('EN_ALMACEN', 'SALIO', 'REEMPLAZADA'));
    ALTER TABLE etiquetas DROP CONSTRAINT IF EXISTS etiquetas_condicion_check;
    ALTER TABLE etiquetas ADD CONSTRAINT etiquetas_condicion_check
      CHECK (condicion IN ('NUEVO', 'USADO'));
    ALTER TABLE etiqueta_historial DROP CONSTRAINT IF EXISTS etiqueta_historial_evento_check;
    ALTER TABLE etiqueta_historial ADD CONSTRAINT etiqueta_historial_evento_check
      CHECK (evento IN ('GENERADA', 'IMPRESA', 'REIMPRESA', 'SALIO', 'DEVOLVIO', 'TRANSFERIDA', 'REEMPLAZADA'));

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
      cantidad INTEGER NOT NULL,
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

    CREATE TABLE IF NOT EXISTS alertas (
      id SERIAL PRIMARY KEY,
      almacen_id INTEGER REFERENCES almacenes(id),
      tipo VARCHAR(50),
      mensaje TEXT,
      leida BOOLEAN DEFAULT false,
      fecha TIMESTAMP DEFAULT NOW()
    );
  `)

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

  console.log('Base de datos lista.')
}

module.exports = setup
