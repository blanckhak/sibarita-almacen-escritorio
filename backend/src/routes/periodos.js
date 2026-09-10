const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { validarLargos } = require('../utils/texto')
const log = require('../middlewares/logMiddleware')

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
             u.nombre AS usuario_nombre, uc.nombre AS cerrado_por_nombre,
             (SELECT COUNT(*)::int FROM guias g        WHERE g.periodo_id = p.id) AS total_guias,
             (SELECT COUNT(*)::int FROM notas_salida n WHERE n.periodo_id = p.id) AS total_notas
      FROM periodos p
      JOIN almacenes a ON p.almacen_id = a.id
      LEFT JOIN usuarios u  ON p.usuario_id = u.id
      LEFT JOIN usuarios uc ON p.cerrado_por = uc.id
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
      SELECT p.*, a.nombre AS almacen_nombre, u.nombre AS usuario_nombre, uc.nombre AS cerrado_por_nombre
      FROM periodos p JOIN almacenes a ON p.almacen_id = a.id
      LEFT JOIN usuarios u  ON p.usuario_id = u.id
      LEFT JOIN usuarios uc ON p.cerrado_por = uc.id
      WHERE p.id = $1
    `, [req.params.id])
    if (r.rows.length === 0) return res.status(404).json({ error: 'Periodo no encontrado' })
    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/periodos  { almacen_id, nombre, fecha_inicio }
// Abre el PRIMER periodo de un almacen que todavia no tiene uno ACTIVO. Los
// periodos siguientes los crea el cierre (Fase 15), no este endpoint.
router.post('/', verificarToken, soloRoles('admin', 'almacen', 'almacenero3'),
  log('CREAR_PERIODO', req => `Almacen ${req.body.almacen_id}, ${req.body.nombre}`),
  async (req, res) => {
  const { almacen_id, nombre, fecha_inicio } = req.body
  if (!almacen_id) return res.status(400).json({ error: 'El almacen es requerido' })
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre del periodo es requerido' })
  if (!fecha_inicio) return res.status(400).json({ error: 'La fecha de inicio es requerida' })
  const errLargo = validarLargos({ 'nombre del periodo': [nombre, 60] })
  if (errLargo) return res.status(400).json({ error: errLargo })

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
    const per = await client.query(
      `INSERT INTO periodos (almacen_id, nombre, fecha_inicio, estado, usuario_id)
       VALUES ($1, $2, $3, 'ACTIVO', $4) RETURNING *`,
      [almacen_id, nombre.trim(), fecha_inicio, req.usuario.id]
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

module.exports = router
