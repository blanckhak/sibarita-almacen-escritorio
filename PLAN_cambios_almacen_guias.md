# Plan de cambios — Almacén, Guías y Comprobantes

> Documento de trabajo. Origen: pedido del usuario (notas manuscritas transcritas) del 10/09/2026.
> Base de código analizada: `backend/` (Express 5 + PostgreSQL vía `pg`), `frontend/` (React + Vite + Tailwind),
> envoltorio Electron con instalador versionado (hoy **1.5.0**), migraciones idempotentes en
> `backend/src/config/setup.js` (corren en cada arranque del server).

---

## 0. Decisiones tomadas con el usuario

| Tema | Decisión |
|---|---|
| **R2 Forma de pago** | **ELIMINADO** — no se implementa (el usuario respondió "no va ver forma de pago"). |
| **R3 Servicios** | Externo → genera su Nota de Salida automática (cerrada, sin mover inventario). Interno → genera código único, queda listado y retenido en almacén, **no** ajusta inventario. |
| **R5 Rol Almacenero 3** | Copia completa de permisos del rol `almacen`. |
| **R7 Periodos** | "Periodo activo + arrastre de saldo": entidad `periodos` de primera clase, un periodo `ACTIVO` por almacén, cada guía/nota/etiqueta se graba con `periodo_id`; al cerrar, el stock final pasa como saldo de apertura del periodo siguiente. |
| **R7 Periodo cerrado** | Solo lectura; un **admin** puede reabrirlo y al recerrar se recalcula la foto y el arrastre. |
| **Alcance de periodo** | Por almacén (MALSA / JOPISA / INDELPAS), no global. *(Asunción; confirmar si se prefiere global.)* |

---

## 1. Estado actual relevante

| Área | Hoy | Implicancia |
|---|---|---|
| Cantidades | `INTEGER` en `guia_items`, `guia_item_partidas`, `etiquetas`, `notas_salida_detalle`, `inventario`, `movimientos`. Validadores `esEnteroPositivo` / `Number.isInteger` rechazan decimales a propósito. | R6 es transversal y **prerequisito** del resto. |
| Servicios | `guia_items.tipo IN ('PRODUCTO','SERVICIO')`. SERVICIO no genera etiqueta, no toca inventario, solo se imprime. | R3 agrega el eje interno/externo. |
| Destinos | `guia_items.destino IN ('ALMACEN','OFICINA','LABORATORIO','OTRO')`. `DESTINOS_SALIDA_AUTO=['OFICINA','LABORATORIO']` generan Nota de Salida automática (`utils/salida.js`). | R5 = colapsar OFICINA+LABORATORIO en `COMPRAS_DIARIAS`. |
| Devolución usada | `notas_salida_detalle.devuelto_*`; genera etiqueta `condicion='USADO'`, reingresa a bucket `inventario.tipo='DEVOLUCION'`. Ya soporta `devuelto_cantidad` parcial. | R6 (parte devolución) es extensión: falta el cobro de lo consumido y aceptar decimales. |
| Roles | `roles`: `admin`, `almacen`, `mantenimiento`, `compras`. `soloRoles(...)` backend; `RutaProtegida roles={[...]}`, `Navbar.enlaces[].roles`, checks `['admin','almacen'].includes(rol)` sueltos. | R5 (Almacenero 3) toca muchos call-sites. |
| Impresión | Componentes React con bloques `hidden print:block`, overlay `PreviewImpresion`, paginación `enPaginas()` a 6 filas/hoja (`FILAS_POR_PAGINA`). Impresora objetivo: Epson FX-890 II. | R1 = catálogo de parámetros + plantilla con wrap. |
| Excel | Sin librería `xlsx`; se arma XML/CSV a mano en `utils/kardexExcel.js` / `utils/exportar.js`. `jspdf` sí está. | R7 export reutiliza ese patrón. |
| Migraciones | `setup.js`: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT / ADD CONSTRAINT`, bloques `DO $mig$`. | Estilo obligatorio para toda migración nueva. |
| Backup | `scripts/backup-db.ps1` (pg_dump plano a `backups/` + OneDrive, retiene 30/90). | Correr antes de cada migración riesgosa. |

**Bug latente aprovechado:** `GuiaDetalle.jsx` imprime `{guia.observaciones}` pero `guias` no tiene esa columna → las observaciones de guía nunca se imprimen. R4 lo corrige.

---

## 2. Requerimientos → mapeo

### R1 — Impresión de contenido parametrizado (Ingreso y Salida) + ajuste a 2 líneas

**BD**
```sql
CREATE TABLE parametros_impresion (
  id SERIAL PRIMARY KEY,
  documento VARCHAR(20) CHECK (documento IN ('INGRESO','SALIDA','DEVOLUCION')),
  mostrar_precio        BOOLEAN NOT NULL DEFAULT true,
  mostrar_ubicacion     BOOLEAN NOT NULL DEFAULT true,
  mostrar_codigo_barras BOOLEAN NOT NULL DEFAULT true,
  mostrar_partidas      BOOLEAN NOT NULL DEFAULT true,
  mostrar_observaciones BOOLEAN NOT NULL DEFAULT true,
  lineas_por_pagina     SMALLINT NOT NULL DEFAULT 6 CHECK (lineas_por_pagina BETWEEN 4 AND 10),
  pie_texto             VARCHAR(300)
);
-- seed: una fila por documento (INGRESO, SALIDA, DEVOLUCION)
```
**Endpoints:** `GET /api/parametros-impresion` (todos) · `PUT /api/parametros-impresion/:documento` (solo `admin`).
**Frontend:** `enPaginas(lineas, params.lineas_por_pagina)`; celda DETALLE (columna B) con
`.desc-2l{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;overflow-wrap:anywhere}`;
`GuiaDetalle.jsx` y `NotaSalidaDetalle.jsx` leen y condicionan cada bloque; nueva pantalla `Configuracion.jsx` (`/configuracion`, `admin`).
**Riesgo:** bajo. Validar 5–6 filas altas en el talonario físico → `lineas_por_pagina` configurable.

### R2 — ELIMINADO
No se implementa. Sin columnas `forma_pago`, sin selector, sin cambio de plantilla.

### R3 — Servicio Externo → auto salida · Servicio Interno → genera código y queda en almacén

**BD**
```sql
ALTER TABLE guia_items
  ADD COLUMN servicio_modo VARCHAR(10)
    CHECK (servicio_modo IS NULL OR servicio_modo IN ('EXTERNO','INTERNO'));
ALTER TABLE notas_salida_detalle ALTER COLUMN etiqueta_id DROP NOT NULL;
ALTER TABLE notas_salida_detalle ADD COLUMN descripcion_servicio VARCHAR(200);
```
**Comportamiento**
- **EXTERNO:** al guardar la guía se crea su Nota de Salida automática (`crearNotaSalidaAutomatica`, `USO_INTERNO`, `CERRADO`, `requiere_devolucion=false`), con detalle `descripcion_servicio` (sin `etiqueta_id`), **sin** mover `inventario`.
- **INTERNO:** genera etiqueta (`nextval('etiquetas_codigo_seq')`, `EN_ALMACEN`, `producto_id` NULL), aparece en el detalle y en consultas, **no** ajusta `inventario`. Sale después por Nota de Salida manual.
**Backend:** `guias.js POST /` ramifica el bloque `if (it.tipo === 'SERVICIO')` por `servicio_modo`; `GET /:id`, `/consulta/productos` y `notasSalida.js GET /:id` → `LEFT JOIN productos` + `COALESCE(p.nombre, gi.descripcion, d.descripcion_servicio)`.
**Frontend:** `Guias.jsx` radio Externo/Interno; `GuiaDetalle.jsx` badge del modo + "Imprimir etiqueta" para INTERNO.
**Riesgo:** medio (toca `notas_salida_detalle` y varias queries con JOIN).

### R4 — ID agrupador, mismo ID para varios productos, observaciones, edición manual de ID/Código antes de imprimir

**BD**
```sql
ALTER TABLE guias      ADD COLUMN observaciones TEXT;               -- corrige el bug de impresión
ALTER TABLE guia_items ADD COLUMN id_agrupador     VARCHAR(30);     -- libre, se repite entre líneas
ALTER TABLE guia_items ADD COLUMN observaciones    VARCHAR(300);
ALTER TABLE guia_items ADD COLUMN codigo_impresion VARCHAR(30);     -- etiqueta a imprimir; NO altera etiquetas.codigo ni el código de barras
```
**Endpoints:** extender `PUT /api/guias/:id` — `items:[{id, cantidad, id_agrupador, observaciones, codigo_impresion}]` + `observaciones` de cabecera. `validarLargos` para los nuevos campos.
**Frontend:** `Guias.jsx` columnas "ID" y "Observación" + botón "misma ID"; `GuiaDetalle.jsx` edición inline (patrón del input `ubicacion`) + diálogo "Revisar antes de imprimir" → `PUT` → `PreviewImpresion`. Impresión: agrupar filas por `id_agrupador`, usar `codigo_impresion ?? codigoAlmacen(codigo)`.
**Riesgo:** bajo-medio (el agrupado en la plantilla paginada requiere cuidado con `enPaginas`).

### R5 — "Laboratorio" + "Oficina" → **Compras Diarias** · nuevo rol **Almacenero 3** (copia de `almacen`)

**BD — destinos**
```sql
UPDATE guia_items SET destino='COMPRAS_DIARIAS' WHERE destino IN ('OFICINA','LABORATORIO');
ALTER TABLE guia_items DROP CONSTRAINT IF EXISTS guia_items_destino_check;
ALTER TABLE guia_items ADD  CONSTRAINT guia_items_destino_check
  CHECK (destino IS NULL OR destino IN ('ALMACEN','COMPRAS_DIARIAS','OTRO'));
UPDATE notas_salida SET seccion='Compras Diarias' WHERE seccion IN ('Oficina','Laboratorio');  -- cosmético
```
Backend: `guias.js` `DESTINOS=['ALMACEN','COMPRAS_DIARIAS','OTRO']`, `DESTINOS_SALIDA_AUTO=['COMPRAS_DIARIAS']`, `DESTINO_LABEL={COMPRAS_DIARIAS:'Compras Diarias'}`; `utils/salida.js`.
Frontend: `Guias.jsx`, `GuiaDetalle.jsx` (`colorDestino`), `NotaSalidaDetalle.jsx`.
> ⚠️ Choque de nombres con el **módulo** `compras_diarias` (Fase 10). En UI etiquetar "Compras Diarias (retiro)" si genera confusión.

**BD — rol**
```sql
INSERT INTO roles (nombre) VALUES ('almacenero3') ON CONFLICT (nombre) DO NOTHING;
-- seed usuario almacenero3@sibarita.com (rol almacenero3, almacén MALSA, ON CONFLICT DO NOTHING)
```
Backend: `soloRoles('admin','almacen')` → `soloRoles('admin','almacen','almacenero3')` en todos los call-sites (`guias.js`, `notasSalida.js`, `movimientos.js`, `comprasDiarias.js`, `solicitudesMateriales.js`, `etiquetas.js`, `parametrosAprobacion.js`).
Frontend: agregar `'almacenero3'` a cada lista donde está `'almacen'` (`App.jsx` `RutaProtegida`, `Navbar.jsx` `enlaces[].roles` + `colorRol`, checks sueltos). `Login.jsx`: botón de acceso rápido "Almacenero 3".
`permisos.js` centralizado: recomendado, no bloqueante (con copia completa alcanza el find/replace).
**Riesgo:** medio (muchos archivos, mecánico). La migración de `destino` es irreversible → backup + bump instalador.

### R6 — Kilo / Metro con decimales · devolución cobra solo lo consumido

**BD — ampliar a NUMERIC (widening seguro)**
```sql
ALTER TABLE guia_items            ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::numeric;
ALTER TABLE guia_item_partidas    ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::numeric;
ALTER TABLE etiquetas             ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::numeric;
ALTER TABLE notas_salida_detalle  ALTER COLUMN cantidad          TYPE NUMERIC(12,3) USING cantidad::numeric;
ALTER TABLE notas_salida_detalle  ALTER COLUMN devuelto_cantidad TYPE NUMERIC(12,3) USING devuelto_cantidad::numeric;
ALTER TABLE inventario            ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::numeric;
ALTER TABLE movimientos           ALTER COLUMN cantidad TYPE NUMERIC(12,3) USING cantidad::numeric;

ALTER TABLE unidades_medida ADD COLUMN permite_decimal BOOLEAN NOT NULL DEFAULT false;
UPDATE unidades_medida SET permite_decimal = true WHERE abreviatura IN ('KG','M','M2','L');

ALTER TABLE notas_salida_detalle ADD COLUMN cantidad_consumida NUMERIC(12,3);
ALTER TABLE notas_salida_detalle ADD COLUMN total_consumido    NUMERIC(12,2);
ALTER TABLE etiquetas DROP CONSTRAINT IF EXISTS etiquetas_condicion_check;
ALTER TABLE etiquetas ADD  CONSTRAINT etiquetas_condicion_check
  CHECK (condicion IN ('NUEVO','USADO','PARCIAL'));
```
**Backend**
- `guias.js`: `esEnteroPositivo` → `esCantidadPositiva(v) = Number.isFinite(Number(v)) && Number(v) > 0` (+ tope 3 decimales). Reemplazar en líneas ~183, ~205, ~209, ~370, ~597. `Number.isInteger` solo para IDs.
- `notasSalida.js`: quitar `Number.isInteger` en cantidades devueltas (~367, ~603); mantener para IDs de unidad (~375, ~612). Calcular `cantidad_consumida = cantidad - devuelto_cantidad`, `total_consumido = cantidad_consumida * p_unitario`; `condicion='PARCIAL'` en el código reingresado cuando `devuelto_cantidad < cantidad`.
- Casts `::int` → `::numeric` y redondeo: `reportes.js:39`, `notasSalida.js:72`, `dashboard.js:14`, `etiquetas.js:49-50`.
- `utils/inventario.js`: `GREATEST(cantidad + $1, 0)` ya es numérico-safe; verificar que `delta` llegue como número.
**Frontend**
- Inputs `step="1"` → `step="0.001"` donde la unidad `permite_decimal` (`Guias.jsx` ~449, ~526; modales de devolución `NotaSalidaDetalle.jsx`; `GuiaDetalle.jsx`).
- Helper `frontend/src/utils/fmt.js` → `fmtCantidad(n)` (recorta ceros: `3.500 → 3.5`).
- Modal devolución: "Salió 3.5 · Vuelve [__] · Consumido 1.0 → cobra S/ X". "Nota de Devolución" impresa: columnas **Consumido** y **A cobrar**.
**Riesgo:** **alto** (migración más ancha + concurrencia LAN). Mitigación: fase propia, backup previo, prueba de estrés.

### R7 — Periodo activo por almacén + arrastre de saldo + export + purga

**Concepto:** un periodo `ACTIVO` por almacén (índice único parcial). Toda guía / nota / etiqueta nueva se graba con el `periodo_id` activo. Al cerrar: se congela la foto `CIERRE`, se crea el periodo siguiente `ACTIVO` y su `APERTURA` = `CIERRE` del anterior (**arrastre**). `inventario` **no** se migra: sigue siendo el stock vivo; el saldo del periodo = `CIERRE − APERTURA` + detalle de guías/notas por `periodo_id`. Periodo `CERRADO` = solo lectura; admin reabre y recerra.

**BD**
```sql
CREATE TABLE periodos (
  id SERIAL PRIMARY KEY,
  almacen_id   INTEGER NOT NULL REFERENCES almacenes(id),
  nombre       VARCHAR(60) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE,
  estado       VARCHAR(10) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','CERRADO')),
  periodo_anterior_id INTEGER REFERENCES periodos(id),
  cerrado_por  INTEGER REFERENCES usuarios(id),
  cerrado_en   TIMESTAMP,
  reabierto_en TIMESTAMP,
  usuario_id   INTEGER REFERENCES usuarios(id),
  creado_en    TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX periodos_activo_por_almacen ON periodos (almacen_id) WHERE estado='ACTIVO';

CREATE TABLE periodos_saldos (
  id SERIAL PRIMARY KEY,
  periodo_id  INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('APERTURA','CIERRE')),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  stock_nuevo      NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_devolucion NUMERIC(12,3) NOT NULL DEFAULT 0,
  UNIQUE (periodo_id, tipo, producto_id)
);

ALTER TABLE guias        ADD COLUMN periodo_id INTEGER REFERENCES periodos(id);
ALTER TABLE notas_salida ADD COLUMN periodo_id INTEGER REFERENCES periodos(id);
ALTER TABLE etiquetas    ADD COLUMN periodo_id INTEGER REFERENCES periodos(id);
```

**Endpoints**
| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/api/periodos` · `/api/periodos/:id` · `/api/periodos/activo?almacen_id=` | admin, almacen, almacenero3, compras |
| `POST` | `/api/periodos` (abrir el primero de un almacén) | admin, almacen, almacenero3 |
| `POST` | `/api/periodos/:id/cerrar` | admin, almacen, almacenero3 |
| `POST` | `/api/periodos/:id/reabrir` | **solo admin** |
| `POST` | `/api/periodos/cierre-general` | **solo admin** |
| `POST` | `/api/periodos/purga` (`{dry_run}`) | **solo admin** |
| `GET` | `/api/reportes/periodo?periodo_id=` | admin, almacen, almacenero3, compras |

**Cierre (transacción):** valida `ACTIVO`; inserta `periodos_saldos` `CIERRE` = foto de `inventario`; `estado='CERRADO'` + `fecha_fin` + `cerrado_*`; crea periodo siguiente `ACTIVO` (`periodo_anterior_id`, `fecha_inicio = fecha_fin+1`); inserta `APERTURA` del nuevo = copia del `CIERRE`.
**Reabrir (admin):** valida que el periodo siguiente no tenga movimiento (`guias`/`notas_salida` con ese `periodo_id`); borra el periodo siguiente, el `CIERRE` de `:id` y el `APERTURA` del siguiente; `estado='ACTIVO'`, `reabierto_en`.
**Bloqueo de escritura:** si el `periodo_id` del recurso está `CERRADO` → 409 en `guias.js` (`POST`, `PUT /:id`, `/anular`, `/items/.../retirar`) y `notasSalida.js` (`POST`, `/devolucion`, `/aprobar`, `PUT /:id`).
**Purga:** solo sobre periodos `CERRADO` anteriores a una fecha; `dry_run:true` devuelve conteo por tabla (`actividad_log`, notas `CERRADO/DEVUELTO` conciliadas, guías `ANULADA` sin refs, `etiqueta_historial` huérfano); `dry_run:false` genera respaldo `.xlsx`, borra y registra en `actividad_log`. Nunca toca `inventario` ni `periodos_saldos`.
**Frontend:** `PeriodoContext.jsx` (periodo seleccionado para ver, por almacén) + selector en `Navbar.jsx`; filtro `?periodo_id=` en `Guias`, `NotasSalida`, `Inventario`, `Movimientos`; pantalla `Periodos.jsx` (`/periodos`); `utils/periodoExcel.js` (patrón `Blob` de `kardexExcel.js`, hojas Apertura / Cierre / Movimiento / Ingresos / Salidas).
**Migración de datos:** por almacén, "Periodo inicial" `ACTIVO` (`fecha_inicio` = guía más antigua o `CURRENT_DATE`); backfill `guias/notas_salida/etiquetas.periodo_id` por almacén; `APERTURA` del inicial = foto actual de `inventario`.
**Riesgo:** alto (módulo nuevo, FK en tablas núcleo, purga destructiva). Purga tras `dry_run` + respaldo obligatorio.

---

## 3. Migraciones consolidadas (orden en `setup.js`)

1. `parametros_impresion` (+seed 3 filas)
2. `guia_items.servicio_modo`; `notas_salida_detalle.etiqueta_id` → nullable + `descripcion_servicio`
3. `guias.observaciones`; `guia_items.id_agrupador / observaciones / codigo_impresion`
4. `roles += 'almacenero3'`; datos `destino` OFICINA/LABORATORIO → `COMPRAS_DIARIAS` + `DROP/ADD CONSTRAINT`
5. `NUMERIC(12,3)` en las 7 columnas de cantidad; `unidades_medida.permite_decimal`; `notas_salida_detalle.cantidad_consumida / total_consumido`; `etiquetas.condicion += 'PARCIAL'`
6. `periodos`, `periodos_saldos`, índice único parcial, `periodo_id` en `guias / notas_salida / etiquetas`

Cada paso con el patrón idempotente ya usado (`IF NOT EXISTS`, `DROP/ADD CONSTRAINT`, `DO $mig$`).

---

## 4. Plan de ejecución por fases (instalador hoy 1.5.0)

| Fase | Versión | Contenido | Est. (1 dev) |
|---|---|---|---|
| **11** | **1.6.0** | R6 decimales (BD `NUMERIC` + validadores + casts + inputs) · R4 ID/observaciones/código de impresión manual + diálogo "revisar antes de imprimir" | 3–4 d |
| **12** | **1.7.0** | R5 rol `almacenero3` (copia de `almacen`) + acceso rápido en login · rename destinos OFICINA/LABORATORIO → `COMPRAS_DIARIAS` | 2–3 d |
| **13** | **1.8.0** | R3 `servicio_modo` externo/interno · R1 `parametros_impresion` + `Configuracion.jsx` + celda DETALLE `-webkit-line-clamp:2` + `enPaginas(lineas, lineas_por_pagina)` | 4–5 d |
| **14** | **1.9.0** | R7-a Periodos: entidad + periodo activo por almacén + `periodo_id` en operaciones + selector y filtro de vistas | 4–5 d |
| **15** | **1.10.0** | R7-b Cierre + arrastre de saldo + bloqueo de escritura + reabrir + cierre general + export Excel + purga | 5–6 d |

**Orden:** R6 primero (base común de columnas y validadores); R7 último (consume decimales, destino nuevo y rol nuevo).
Por fase: migración en `setup.js` → backend → frontend → prueba LAN 2 PCs → `NOTAS_PROYECTO_SIBARITA.txt` → bump instalador → `.md` de sesión → merge.

---

## 5. Desglose paso a paso

### FASE 11 — v1.6.0 · Decimales (R6) + ID/Observaciones/Código manual (R4)

| Paso | Acción | Archivos | Checkpoint de revisión |
|---|---|---|---|
| 11.1 | Rama `fase-11-decimales` + dump de BD a `backups/` | `scripts/backup-db.ps1` | dump nuevo en `backups/`; server arranca |
| 11.2 | Migración `NUMERIC(12,3)` (7 columnas) + `unidades_medida.permite_decimal` | `backend/src/config/setup.js` | 2 arranques sin error; `\d guia_items` → `numeric(12,3)`; datos viejos intactos |
| 11.3 | `esEnteroPositivo` → `esCantidadPositiva` | `backend/src/routes/guias.js` (~183, 205, 209, 370, 597) | POST guía `cantidad:3.5` → 201; `0` / `-1` / `1.2345` → 400 |
| 11.4 | Casts `::int` → `::numeric` | `notasSalida.js:72`, `reportes.js:39`, `dashboard.js:14`, `etiquetas.js:49-50` | dashboard y "salidas por motivo" muestran `3.5` |
| 11.5 | Devolución decimal + cobro de lo consumido | `setup.js` (`cantidad_consumida`, `total_consumido`, `condicion+='PARCIAL'`), `notasSalida.js` (~367, 603) | salida 3.5 → devolver 2.5 → `consumido 1.0`, `total_consumido` ok, código nuevo `PARCIAL`, bucket DEVOLUCION +2.5 |
| 11.6 | Inputs decimales + `fmtCantidad` | `Guias.jsx` (~449, 526), `NotaSalidaDetalle.jsx`, `GuiaDetalle.jsx`, nuevo `utils/fmt.js` | alta con `1.2` / `0.3`; detalle muestra `1.2` no `1.200`; unidad "Unidad" fuerza entero |
| 11.7 | Migración R4 (columnas) | `backend/src/config/setup.js` | idempotencia; columnas presentes |
| 11.8 | Backend R4 (crear + editar) | `backend/src/routes/guias.js` | 2 líneas mismo `id_agrupador` → 201; `PUT` cambia `codigo_impresion` → `GET /:id` lo refleja |
| 11.9 | Frontend R4 (alta + detalle + diálogo pre-impresión) | `Guias.jsx`, `GuiaDetalle.jsx` | alta → editar ID/código → imprimir usa `codigo_impresion` y agrupa por ID |
| 11.10 | Plantilla de impresión R4 | `GuiaDetalle.jsx` (bloque `vistaImpresion==='nota'`) | 4 líneas / 2 IDs → 2 grupos; `guia.observaciones` sale |
| 11.11 | Cierre de fase | notas + bump `1.6.0` + `.md` + merge | prueba LAN 2 PCs con decimales; sin `500` crudos; stock consolidado cuadra |

### FASE 12 — v1.7.0 · Rol Almacenero 3 + rename destinos (R5)

| Paso | Acción | Archivos | Checkpoint |
|---|---|---|---|
| 12.1 | Rama + migración rol + seed usuario | `backend/src/config/setup.js` | `roles` tiene 5; login `almacenero3@sibarita.com` funciona |
| 12.2 | Backend: incluir `almacenero3` en `soloRoles` | `guias.js`, `notasSalida.js`, `movimientos.js`, `comprasDiarias.js`, `solicitudesMateriales.js`, `etiquetas.js`, `parametrosAprobacion.js` | token `almacenero3`: crear guía / nota / devolución OK |
| 12.3 | Frontend: incluir `almacenero3` | `App.jsx`, `Navbar.jsx`, checks sueltos en `GuiaDetalle.jsx`, `NotaSalidaDetalle.jsx`, `Guias.jsx` | navbar de `almacenero3` = navbar de `almacen`; botones visibles |
| 12.4 | Migración datos: destinos → `COMPRAS_DIARIAS` + constraint | `backend/src/config/setup.js` | guías viejas muestran `COMPRAS_DIARIAS`; no quedan valores viejos |
| 12.5 | Backend: constantes de destino | `guias.js`, `utils/salida.js` | alta destino `COMPRAS_DIARIAS` + persona → Nota de Salida automática `seccion='Compras Diarias'` |
| 12.6 | Frontend: opciones de destino | `Guias.jsx`, `GuiaDetalle.jsx` (`colorDestino`), `NotaSalidaDetalle.jsx` | selector sin Oficina/Laboratorio; flujo "pendiente de recoger" → "asignar responsable" OK |
| 12.7 | Cierre de fase | notas + bump `1.7.0` + `.md` + merge | login rápido de los 3 almaceneros; todo lo de `almacen` para `almacenero3` |

### FASE 13 — v1.8.0 · Servicios interno/externo (R3) + Impresión parametrizada (R1)

| Paso | Acción | Archivos | Checkpoint |
|---|---|---|---|
| 13.1 | Rama + migración R3 | `backend/src/config/setup.js` | idempotencia; `etiqueta_id` nullable |
| 13.2 | Backend R3: alta de guía | `backend/src/routes/guias.js` | servicio EXTERNO → Nota de Salida cerrada; INTERNO → código en detalle, `inventario` sin cambios |
| 13.3 | Backend R3: queries con `LEFT JOIN productos` | `guias.js` (`GET /:id`, `/consulta/productos`), `notasSalida.js` (`GET /:id`) | detalle con servicio interno/externo no rompe |
| 13.4 | Frontend R3 | `Guias.jsx`, `GuiaDetalle.jsx`, `NotaSalidaDetalle.jsx` | los 2 flujos de punta a punta; reimpresión de etiqueta del servicio interno |
| 13.5 | Migración R1 (`parametros_impresion` + seed) | `backend/src/config/setup.js` | `SELECT` → 3 filas con defaults |
| 13.6 | Backend R1 | nuevo `backend/src/routes/parametrosImpresion.js` + `server.js` | `PUT` con `admin` cambia `lineas_por_pagina`; otro rol → 403 |
| 13.7 | Frontend R1: pantalla de configuración | nuevo `Configuracion.jsx` + ruta `/configuracion` (`App.jsx`) + link `Navbar.jsx` | toggles persisten al recargar |
| 13.8 | Frontend R1: aplicar parámetros + wrap 2 líneas | `paginarImpresion.js`, `GuiaDetalle.jsx`, `NotaSalidaDetalle.jsx` | descripción larga → 2 líneas; `mostrar_precio=false` oculta P.UNIT/TOTAL; `lineas_por_pagina=5` pagina cada 5 |
| 13.9 | Cierre de fase | impresión de prueba (Epson / PDF) + notas + bump `1.8.0` + `.md` + merge | las 3 plantillas respetan toggles y corte de página |

### FASE 14 — v1.9.0 · Periodos: entidad + periodo activo

| Paso | Acción | Archivos | Checkpoint |
|---|---|---|---|
| 14.1 | Rama + migración base (`periodos`, `periodos_saldos`, índice, `periodo_id` x3) | `backend/src/config/setup.js` | idempotencia; índice parcial creado |
| 14.2 | Migración de datos (backfill) | `backend/src/config/setup.js` (`DO $mig$` con guarda) | sin `guias.periodo_id IS NULL`; 1 activo por almacén; `APERTURA` cuadra con `inventario` |
| 14.3 | Backend: CRUD de periodos (sin cerrar) | nuevo `backend/src/routes/periodos.js` + `server.js` | `GET /activo` OK; 2º activo mismo almacén → 409 |
| 14.4 | Backend: asignar `periodo_id` en operaciones | `guias.js` (`POST`), `notasSalida.js` (`POST`), `utils/salida.js` | nueva guía/nota trae `periodo_id`; sin periodo activo → 400 |
| 14.5 | Frontend: selector de periodo + filtro de vistas | nuevo `PeriodoContext.jsx`, `Navbar.jsx`, `Guias.jsx`, `NotasSalida.jsx`, `Inventario.jsx`, `Movimientos.jsx` | cambiar periodo recarga listados filtrados; default = activo |
| 14.6 | Frontend: pantalla Periodos | nuevo `Periodos.jsx` + ruta `/periodos` (`App.jsx`) + link `Navbar.jsx` | 1 periodo activo por almacén; sin acciones de cierre aún |
| 14.7 | Cierre de fase | notas + bump `1.9.0` + `.md` + merge | operar normal con periodos activos; todo etiquetado; nada bloqueado |

### FASE 15 — v1.10.0 · Cierre + arrastre + export + purga

| Paso | Acción | Archivos | Checkpoint |
|---|---|---|---|
| 15.1 | Rama + backup BD | `scripts/backup-db.ps1` | dump nuevo |
| 15.2 | Backend: cerrar periodo (con arrastre) | `backend/src/routes/periodos.js` | cerrar → periodo siguiente activo; `APERTURA(n+1) == CIERRE(n)`; `inventario` vivo sin cambios |
| 15.3 | Backend: bloquear escritura en periodo CERRADO | `guias.js`, `notasSalida.js` | editar guía de periodo cerrado → 409; alta nueva entra al activo |
| 15.4 | Backend: reabrir (admin) | `backend/src/routes/periodos.js` | reabrir → ACTIVO, desaparece el siguiente; si el siguiente tenía guías → 409 |
| 15.5 | Backend: reporte y export por periodo | `backend/src/routes/reportes.js` | `movimiento = ingresos − salidas` cuadra |
| 15.6 | Frontend: acciones de cierre + Excel | `Periodos.jsx`, nuevo `utils/periodoExcel.js` | cerrar desde UI; `.xls` con 5 hojas |
| 15.7 | Backend: cierre general + purga | `backend/src/routes/periodos.js` | `cierre-general` deja 1 activo por almacén; `purga` `dry_run` no borra; real deja stock/saldos intactos |
| 15.8 | Frontend: cierre general + purga | `Periodos.jsx` | flujo admin de punta a punta con doble confirmación |
| 15.9 | Cierre de fase | notas + bump `1.10.0` + `.md` + merge | ciclo cerrar→reabrir→recerrar sin descuadres |

---

## 6. Checkpoints de revisión global (por fase, antes del merge)

1. `setup.js` corre 2× sin error (idempotencia).
2. Datos históricos legibles.
3. Prueba de concurrencia LAN con 2 PCs.
4. Sin `500` crudos en el log del server.
5. El instalador construye (`npm run build`).

---

## 7. Pendiente de confirmar

- Alcance de `periodos`: por almacén (asumido) vs. global único.
- Nombre visible del destino unificado: "Compras Diarias" vs. "Compras Diarias (retiro)" para no confundir con el módulo `compras_diarias`.
- Reglas exactas de la purga (qué antigüedad, qué tablas) — hoy propuesto conservador.
