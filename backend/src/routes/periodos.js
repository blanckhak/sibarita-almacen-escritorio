const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { validarLargos } = require('../utils/texto')
const log = require('../middlewares/logMiddleware')
const { perfilSql } = require('../utils/perfil')

// Fase 14 (R7-a): periodos por almacen. Un periodo ACTIVO por almacen; toda
// guia / nota de salida / etiqueta nueva se graba con ese periodo_id. El
// cierre, arrastre de saldo, export y purga son Fase 15.

// GET /api/periodos?almacen_id=&estado=
router.get('/', verificarToken, async (req, res) => {
  const { almacen_id, estado } = req.query
  const cond = []
  const val = []
  if (almacen_id) { val.push(almacen_id); cond.push(`p.almacen_id = $${val.length}`) }
  if (estado)     { val.push(estado);     cond.push(`p.estado = $${val.length}`) }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  try {
    const r = await pool.query(`
      SELECT p.*, a.nombre AS almacen_nombre,
             ${perfilSql('u', 'ru')} AS usuario_nombre, ${perfilSql('uc', 'ruc')} AS cerrado_por_nombre,
             (SELECT COUNT(*)::int FROM guias g        WHERE g.periodo_id = p.id) AS total_guias,
             (SELECT COUNT(*)::int FROM notas_salida n WHERE n.periodo_id = p.id) AS total_notas
      FROM periodos p
      JOIN almacenes a ON p.almacen_id = a.id
      LEFT JOIN usuarios u  ON p.usuario_id = u.id
      LEFT JOIN roles ru ON ru.id = u.rol_id
      LEFT JOIN usuarios uc ON p.cerrado_por = uc.id
      LEFT JOIN roles ruc ON ruc.id = uc.rol_id
      ${where}
      ORDER BY p.almacen_id, p.fecha_inicio DESC, p.id DESC
    `, val)
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/periodos/activo?almacen_id=  -> el periodo ACTIVO de ese almacen (o null)
router.get('/activo', verificarToken, async (req, res) => {
  const { almacen_id } = req.query
  if (!almacen_id) return res.status(400).json({ error: 'almacen_id requerido' })
  try {
    const r = await pool.query(
      `SELECT p.*, a.nombre AS almacen_nombre
       FROM periodos p JOIN almacenes a ON p.almacen_id = a.id
       WHERE p.almacen_id = $1 AND p.estado = 'ACTIVO'`,
      [almacen_id]
    )
    res.json(r.rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/periodos/:id
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*, a.nombre AS almacen_nombre, ${perfilSql('u', 'ru')} AS usuario_nombre, ${perfilSql('uc', 'ruc')} AS cerrado_por_nombre
      FROM periodos p JOIN almacenes a ON p.almacen_id = a.id
      LEFT JOIN usuarios u  ON p.usuario_id = u.id
      LEFT JOIN roles ru ON ru.id = u.rol_id
      LEFT JOIN usuarios uc ON p.cerrado_por = uc.id
      LEFT JOIN roles ruc ON ruc.id = uc.rol_id
      WHERE p.id = $1
    `, [req.params.id])
    if (r.rows.length === 0) return res.status(404).json({ error: 'Periodo no encontrado' })
    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/periodos  { almacen_id, nombre?, fecha_inicio? }
// Abre el PRIMER periodo de un almacen que todavia no tiene uno ACTIVO. Los
// periodos siguientes los crea el cierre (Fase 15), no este endpoint.
// Fase 16: nombre y fecha_inicio son opcionales. Sin nombre -> "Periodo N"
// (N = cantidad de periodos del almacen + 1). Sin fecha -> hoy.
router.post('/', verificarToken, soloRoles('admin', 'almacen'),
  log('CREAR_PERIODO', req => `Almacen ${req.body.almacen_id}`),
  async (req, res) => {
  const { almacen_id, nombre, fecha_inicio } = req.body
  if (!almacen_id) return res.status(400).json({ error: 'El almacen es requerido' })
  if (nombre && nombre.trim()) {
    const errLargo = validarLargos({ 'nombre del periodo': [nombre, 60] })
    if (errLargo) return res.status(400).json({ error: errLargo })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const activo = await client.query(
      `SELECT id FROM periodos WHERE almacen_id = $1 AND estado = 'ACTIVO' FOR UPDATE`,
      [almacen_id]
    )
    if (activo.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Ese almacen ya tiene un periodo activo' })
    }
    let nombreFinal = (nombre || '').trim()
    if (!nombreFinal) {
      const cuenta = await client.query('SELECT COUNT(*)::int n FROM periodos WHERE almacen_id = $1', [almacen_id])
      nombreFinal = `Periodo ${cuenta.rows[0].n + 1}`
    }
    const per = await client.query(
      `INSERT INTO periodos (almacen_id, nombre, fecha_inicio, estado, usuario_id)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), 'ACTIVO', $4) RETURNING *`,
      [almacen_id, nombreFinal, fecha_inicio || null, req.usuario.id]
    )
    // APERTURA = foto actual del inventario del almacen.
    await client.query(
      `INSERT INTO periodos_saldos (periodo_id, tipo, producto_id, stock_nuevo, stock_devolucion)
       SELECT $1, 'APERTURA', producto_id,
              COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'NUEVO'), 0),
              COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'DEVOLUCION'), 0)
       FROM inventario WHERE almacen_id = $2 AND producto_id IS NOT NULL
       GROUP BY producto_id`,
      [per.rows[0].id, almacen_id]
    )
    await client.query('COMMIT')
    res.status(201).json(per.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ error: 'Ese almacen ya tiene un periodo activo' })
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Snapshot de stock del almacen (por producto) -> se guarda como APERTURA o
// CIERRE de un periodo.
async function guardarSnapshot(client, periodoId, tipo, almacenId) {
  await client.query(
    `INSERT INTO periodos_saldos (periodo_id, tipo, producto_id, stock_nuevo, stock_devolucion)
     SELECT $1, $2, producto_id,
            COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'NUEVO'), 0),
            COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'DEVOLUCION'), 0)
     FROM inventario WHERE almacen_id = $3 AND producto_id IS NOT NULL
     GROUP BY producto_id
     ON CONFLICT (periodo_id, tipo, producto_id) DO NOTHING`,
    [periodoId, tipo, almacenId]
  )
}

// POST /api/periodos/:id/cerrar  { fecha_fin?, nombre_siguiente? }
// Congela la foto de CIERRE, cierra el periodo y abre el siguiente con
// APERTURA = ese CIERRE (arrastre de saldo).
router.post('/:id/cerrar', verificarToken, soloRoles('admin', 'almacen'),
  log('CERRAR_PERIODO', req => `Periodo id ${req.params.id}`),
  async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const per = await client.query('SELECT * FROM periodos WHERE id = $1 FOR UPDATE', [req.params.id])
    if (per.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Periodo no encontrado' })
    }
    const p = per.rows[0]
    if (p.estado !== 'ACTIVO') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Ese periodo no esta activo' })
    }

    // Valida la fecha de fin en SQL (default hoy; no puede ser anterior al inicio).
    if (req.body.fecha_fin) {
      const chk = await client.query(`SELECT $1::date < $2::date AS invalida`, [req.body.fecha_fin, p.fecha_inicio])
      if (chk.rows[0].invalida) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'La fecha de fin no puede ser anterior al inicio del periodo' })
      }
    }
    const errLargo = validarLargos({ 'nombre del periodo siguiente': [req.body.nombre_siguiente, 60] })
    if (errLargo) { await client.query('ROLLBACK'); return res.status(400).json({ error: errLargo }) }

    const r = await cerrarEnTx(client, p, {
      fechaFin: req.body.fecha_fin || null,
      nombreSiguiente: req.body.nombre_siguiente,
      usuarioId: req.usuario.id,
    })

    await client.query('COMMIT')
    res.json(r)
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ error: 'Ese almacen ya tiene un periodo activo' })
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// POST /api/periodos/:id/reabrir  (solo admin)
// Vuelve el periodo a ACTIVO. Solo si el periodo siguiente NO tuvo movimiento
// (ninguna guia ni nota). Borra ese periodo siguiente, su APERTURA y el CIERRE
// del que se reabre.
router.post('/:id/reabrir', verificarToken, soloRoles('admin'),
  log('REABRIR_PERIODO', req => `Periodo id ${req.params.id}`),
  async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const per = await client.query('SELECT * FROM periodos WHERE id = $1 FOR UPDATE', [req.params.id])
    if (per.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Periodo no encontrado' })
    }
    const p = per.rows[0]
    if (p.estado !== 'CERRADO') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Ese periodo no esta cerrado' })
    }

    const sig = await client.query(
      `SELECT * FROM periodos WHERE periodo_anterior_id = $1 FOR UPDATE`, [p.id]
    )
    if (sig.rows.length > 0) {
      const s = sig.rows[0]
      const mov = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM guias WHERE periodo_id = $1) AS guias,
           (SELECT COUNT(*)::int FROM notas_salida WHERE periodo_id = $1) AS notas,
           (SELECT COUNT(*)::int FROM notas_desuso WHERE periodo_id = $1) AS notas_desuso,
           (SELECT COUNT(*)::int FROM etiquetas WHERE periodo_id = $1) AS etiquetas`,
        [s.id]
      )
      const m = mov.rows[0]
      if (m.guias > 0 || m.notas > 0 || m.notas_desuso > 0 || m.etiquetas > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: `El periodo siguiente "${s.nombre}" ya tiene movimiento (${m.guias} guias, ${m.notas} notas, ${m.notas_desuso} notas de desuso). No se puede reabrir.` })
      }
      if (s.estado !== 'ACTIVO') {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'El periodo siguiente no esta activo; hay mas de un periodo posterior. Reabrí primero el ultimo.' })
      }
      // periodos_saldos del siguiente se borra por ON DELETE CASCADE.
      await client.query('DELETE FROM periodos WHERE id = $1', [s.id])
    }

    await client.query(`DELETE FROM periodos_saldos WHERE periodo_id = $1 AND tipo = 'CIERRE'`, [p.id])
    await client.query(
      `UPDATE periodos SET estado = 'ACTIVO', fecha_fin = NULL, cerrado_por = NULL, cerrado_en = NULL, reabierto_en = NOW()
       WHERE id = $1`,
      [p.id]
    )

    await client.query('COMMIT')
    res.json({ ok: true, reabierto: p.id })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ error: 'Ese almacen ya tiene un periodo activo' })
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Cierra un periodo ACTIVO dentro de una transaccion ya abierta y abre el
// siguiente con arrastre. Devuelve { cerrado, siguiente }. Lo usan
// /:id/cerrar y /cierre-general.
async function cerrarEnTx(client, periodo, { fechaFin = null, nombreSiguiente, usuarioId }) {
  await guardarSnapshot(client, periodo.id, 'CIERRE', periodo.almacen_id)
  // fechaFin NULL -> hoy. Se resuelve en SQL para no pelear con Date/zonas.
  const upd = await client.query(
    `UPDATE periodos SET estado = 'CERRADO', fecha_fin = COALESCE($1::date, CURRENT_DATE),
            cerrado_por = $2, cerrado_en = NOW()
     WHERE id = $3 RETURNING fecha_fin`,
    [fechaFin, usuarioId, periodo.id]
  )
  const fin = upd.rows[0].fecha_fin
  const cuenta = await client.query('SELECT COUNT(*)::int n FROM periodos WHERE almacen_id = $1', [periodo.almacen_id])
  const nombreSig = (nombreSiguiente || '').trim() || `Periodo ${cuenta.rows[0].n + 1}`
  const sig = await client.query(
    `INSERT INTO periodos (almacen_id, nombre, fecha_inicio, estado, periodo_anterior_id, usuario_id)
     VALUES ($1, $2, ($3::date + 1), 'ACTIVO', $4, $5) RETURNING *`,
    [periodo.almacen_id, nombreSig, fin, periodo.id, usuarioId]
  )
  await client.query(
    `INSERT INTO periodos_saldos (periodo_id, tipo, producto_id, stock_nuevo, stock_devolucion)
     SELECT $1, 'APERTURA', producto_id, stock_nuevo, stock_devolucion
     FROM periodos_saldos WHERE periodo_id = $2 AND tipo = 'CIERRE'`,
    [sig.rows[0].id, periodo.id]
  )
  return { cerrado: { ...periodo, estado: 'CERRADO', fecha_fin: fin }, siguiente: sig.rows[0] }
}

// POST /api/periodos/cierre-general  (solo admin)
// Cierra el periodo ACTIVO de TODOS los almacenes con fecha de hoy.
router.post('/cierre-general', verificarToken, soloRoles('admin'),
  log('CIERRE_GENERAL_PERIODOS', () => 'Todos los almacenes'),
  async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Solo los periodos que YA arrancaron (fecha_inicio <= hoy). Uno recien
    // abierto por otro cierre que empieza mañana se deja como esta.
    const activos = await client.query(
      `SELECT * FROM periodos WHERE estado = 'ACTIVO' AND fecha_inicio <= CURRENT_DATE ORDER BY almacen_id FOR UPDATE`
    )
    if (activos.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'No hay periodos activos (ya iniciados) para cerrar' })
    }
    const resultados = []
    for (const p of activos.rows) {
      const r = await cerrarEnTx(client, p, { fechaFin: null, usuarioId: req.usuario.id })
      resultados.push({ almacen_id: p.almacen_id, cerrado: p.nombre, siguiente: r.siguiente.nombre })
    }
    await client.query('COMMIT')
    res.json({ cerrados: resultados.length, detalle: resultados })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// POST /api/periodos/purga  (solo admin)  { dias?, dry_run, confirmar? }
// Purga registros temporales obsoletos: por ahora, la auditoria
// (actividad_log) mas vieja que `dias` (default 365). dry_run:true solo
// cuenta; dry_run:false + confirmar:true borra y deja constancia en el log.
// Nunca toca inventario, periodos, guias ni notas.
router.post('/purga', verificarToken, soloRoles('admin'),
  log('PURGA_TEMPORALES', req => `dry_run=${req.body.dry_run !== false}, dias=${req.body.dias || 365}`),
  async (req, res) => {
  const dias = Number.isInteger(Number(req.body.dias)) && Number(req.body.dias) >= 30 ? Number(req.body.dias) : 365
  const dryRun = req.body.dry_run !== false

  try {
    const cnt = await pool.query(
      `SELECT COUNT(*)::int n FROM actividad_log WHERE fecha < (CURRENT_DATE - $1::int)`, [dias]
    )
    const aBorrar = { actividad_log: cnt.rows[0].n }

    if (dryRun) {
      return res.json({ dry_run: true, criterio: { dias, corte: `anterior a hoy - ${dias} dias` }, a_borrar: aBorrar })
    }
    if (req.body.confirmar !== true) {
      return res.status(400).json({ error: 'Para ejecutar la purga hay que enviar confirmar: true' })
    }
    const del = await pool.query(
      `DELETE FROM actividad_log WHERE fecha < (CURRENT_DATE - $1::int)`, [dias]
    )
    res.json({ dry_run: false, borrado: { actividad_log: del.rowCount } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
