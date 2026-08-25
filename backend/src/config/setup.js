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

    CREATE TABLE IF NOT EXISTS guia_items (
      id SERIAL PRIMARY KEY,
      guia_id INTEGER REFERENCES guias(id),
      producto_id INTEGER REFERENCES productos(id),
      cantidad INTEGER NOT NULL,
      destino VARCHAR(20) NOT NULL CHECK (destino IN ('ALMACEN', 'OFICINA', 'LABORATORIO'))
    );

    ALTER TABLE guia_items ADD COLUMN IF NOT EXISTS recogido BOOLEAN;

    CREATE TABLE IF NOT EXISTS etiquetas (
      id SERIAL PRIMARY KEY,
      codigo INTEGER NOT NULL UNIQUE,
      guia_item_id INTEGER REFERENCES guia_items(id),
      producto_id INTEGER REFERENCES productos(id),
      almacen_id INTEGER REFERENCES almacenes(id),
      estado VARCHAR(20) NOT NULL DEFAULT 'EN_ALMACEN' CHECK (estado IN ('EN_ALMACEN', 'SALIO')),
      fecha_generacion TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS etiqueta_historial (
      id SERIAL PRIMARY KEY,
      etiqueta_id INTEGER REFERENCES etiquetas(id),
      evento VARCHAR(20) NOT NULL CHECK (evento IN ('GENERADA', 'IMPRESA', 'REIMPRESA', 'SALIO', 'DEVOLVIO', 'TRANSFERIDA')),
      almacen_origen_id INTEGER REFERENCES almacenes(id),
      almacen_destino_id INTEGER REFERENCES almacenes(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      fecha TIMESTAMP DEFAULT NOW(),
      detalle TEXT
    );

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

    CREATE TABLE IF NOT EXISTS parametros_aprobacion (
      id SERIAL PRIMARY KEY,
      monto_minimo NUMERIC(12,2),
      activo BOOLEAN NOT NULL DEFAULT false
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
        ('admin'),('supervisor'),('operador'),('auditor'),('transportista')
    `)
    console.log('Roles creados')
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
      { nombre: 'Administrador',      email: 'admin@sibarita.com',      pass: 'admin123', rol: 1, almacen: null },
      { nombre: 'Supervisor MALSA',   email: 'supervisor@sibarita.com', pass: 'super123', rol: 2, almacen: 1   },
      { nombre: 'Operador JOPISA',    email: 'operador@sibarita.com',   pass: 'oper123',  rol: 3, almacen: 2   },
      { nombre: 'Auditor General',    email: 'auditor@sibarita.com',    pass: 'audit123', rol: 4, almacen: null },
      { nombre: 'Transportista Juan', email: 'transporte@sibarita.com', pass: 'trans123', rol: 5, almacen: null },
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
