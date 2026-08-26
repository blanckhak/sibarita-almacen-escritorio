-- Base de datos Sibarita
CREATE DATABASE sibarita_db;

\c sibarita_db;

-- Tabla de roles
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO roles (nombre) VALUES
  ('admin'),
  ('supervisor'),
  ('operador'),
  ('auditor'),
  ('transportista');

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

INSERT INTO unidades_medida (nombre, abreviatura) VALUES
  ('Unidad',        'U'),
  ('Kilogramo',     'KG'),
  ('Metro',         'M'),
  ('Metro cuadrado','M2'),
  ('Litro',         'L'),
  ('Caja',          'CJA'),
  ('Rollo',         'ROLLO'),
  ('Plancha',       'PLANCHA');

-- Tabla de productos (catalogo maestro, Fase 2 seccion 5.4)
CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  categoria VARCHAR(100),
  unidad_medida_id INTEGER REFERENCES unidades_medida(id),
  codigo_interno VARCHAR(50),
  creado_en TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX productos_codigo_interno_unique
  ON productos (codigo_interno) WHERE codigo_interno IS NOT NULL;

-- El dedup de producto nuevo por nombre (guias.js) compara sin distinguir
-- mayusculas/minusculas; este indice hace que esa misma nocion de igualdad
-- sea la que realmente impide duplicados a nivel de base de datos.
CREATE UNIQUE INDEX productos_nombre_lower_unique ON productos (LOWER(nombre));

INSERT INTO productos (nombre) VALUES ('Producto General');

-- Tabla de inventario
CREATE TABLE inventario (
  id SERIAL PRIMARY KEY,
  almacen_id INTEGER REFERENCES almacenes(id),
  producto_id INTEGER REFERENCES productos(id),
  tipo VARCHAR(20) CHECK (tipo IN ('NUEVO', 'DEVOLUCION')),
  cantidad INTEGER NOT NULL DEFAULT 0,
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
  cantidad INTEGER,
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
  estado VARCHAR(20) NOT NULL DEFAULT 'CARGADA' CHECK (estado IN ('CARGADA', 'CERRADA')),
  -- Datos del documento fisico del proveedor (Fase B, formato de impresion):
  -- el numero de guia interno de Sibarita no es el mismo que la guia de
  -- remision o factura que trae el proveedor, y el formato fisico "Nota de
  -- Ingresos de Activos" los pide como campos separados.
  guia_remision VARCHAR(50),
  factura VARCHAR(50)
);

CREATE UNIQUE INDEX guias_numero_almacen_unique ON guias (numero_guia, almacen_id);

CREATE TABLE guia_items (
  id SERIAL PRIMARY KEY,
  guia_id INTEGER REFERENCES guias(id),
  producto_id INTEGER REFERENCES productos(id),
  cantidad INTEGER NOT NULL,
  destino VARCHAR(20) NOT NULL CHECK (destino IN ('ALMACEN', 'OFICINA', 'LABORATORIO')),
  -- Solo aplica cuando destino es OFICINA/LABORATORIO: si ya lo recogieron (true)
  -- sale automatico sin etiqueta; si no (false), se queda en almacen etiquetado
  -- hasta que lo recojan, igual que un item con destino ALMACEN.
  recogido BOOLEAN
);

-- Codigo unico por producto que se queda en almacen (Fase 2 seccion 5.2)
CREATE TABLE etiquetas (
  id SERIAL PRIMARY KEY,
  codigo INTEGER NOT NULL UNIQUE,
  guia_item_id INTEGER REFERENCES guia_items(id),
  producto_id INTEGER REFERENCES productos(id),
  almacen_id INTEGER REFERENCES almacenes(id),
  estado VARCHAR(20) NOT NULL DEFAULT 'EN_ALMACEN' CHECK (estado IN ('EN_ALMACEN', 'SALIO')),
  fecha_generacion TIMESTAMP DEFAULT NOW()
);

-- Bitacora de eventos de cada codigo (Fase 2 seccion 14 punto 3)
CREATE TABLE etiqueta_historial (
  id SERIAL PRIMARY KEY,
  etiqueta_id INTEGER REFERENCES etiquetas(id),
  evento VARCHAR(20) NOT NULL CHECK (evento IN ('GENERADA', 'IMPRESA', 'REIMPRESA', 'SALIO', 'DEVOLVIO', 'TRANSFERIDA')),
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
  etiqueta_id INTEGER REFERENCES etiquetas(id),
  cantidad INTEGER NOT NULL,
  p_unitario NUMERIC(12,2),
  total NUMERIC(12,2),
  observaciones TEXT
);

ALTER TABLE notas_salida ADD COLUMN requiere_devolucion BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notas_salida ADD COLUMN fecha_salida TIMESTAMP;

-- Umbral para aprobacion previa de salidas de alto valor (Fase 2 seccion 14 punto 5, CU-05)
CREATE TABLE parametros_aprobacion (
  id SERIAL PRIMARY KEY,
  monto_minimo NUMERIC(12,2),
  activo BOOLEAN NOT NULL DEFAULT false
);

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
