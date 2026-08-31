const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { validarLargos } = require('../utils/texto')
const log = require('../middlewares/logMiddleware')

// Compras diarias (Fase 10, Bloque 5): modulo nuevo aparte. Cabecera
// (fecha/oficina/proveedor + link opcional a una Solicitud de Materiales) mas
// lineas con monto. Es solo un registro: no tiene estados, no toca inventario.
// Lo cargan admin y compras.

// NUMERIC(12,2): hasta 10 digitos enteros. Se rechaza fuera de rango, NaN,
// Infinity y strings vacios/solo-espacios ANTES de llegar al INSERT, para
// devolver 400 en vez de un 500 con el error crudo de Postgres.
const LIMITE_NUMERIC = 1e10
const aNumero = (v) => {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') return Number(v)
  return NaN
}
const esMontoValido = (v) => {
  const n = aNumero(v)
  return Number.isFinite(n) && n >= 0 && n < LIMITE_NUMERIC
}
const esCantidadValida = (v) => {
  const n = aNumero(v)
  return Number.isFinite(n) && n > 0 && n < LIMITE_NUMERIC
}

router.get('/', verificarToken, async (req, res) => {
  const { desde, hasta } = req.query
  const condiciones = []
  const valores = []

  if (desde) {
    valores.push(desde)
    condiciones.push(`c.fecha >= $${valores.length}`)
  }
  if (hasta) {
    valores.push(hasta)
    condiciones.push(`c.fecha <= $${valores.length}`)
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : ''

  try {
    const result = await pool.query(`
      SELECT c.id, c.numero_compra, c.fecha, c.oficina, c.proveedor,
             c.solicitud_id, s.numero_solicitud,
             u.nombre as usuario_nombre,
             COUNT(d.id)::int as total_lineas,
             COALESCE(SUM(d.cantidad * d.monto_unitario), 0) as monto_total
      FROM compras_diarias c
      LEFT JOIN solicitudes_materiales s ON c.solicitud_id = s.id
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN compras_diarias_detalle d ON d.compra_id = c.id
      ${where}
      GROUP BY c.id, s.numero_solicitud, u.nombre
      ORDER BY c.fecha DESC, c.id DESC
    `, valores)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const compra = await pool.query(`
      SELECT c.*, s.numero_solicitud, u.nombre as usuario_nombre
      FROM compras_diarias c
      LEFT JOIN solicitudes_materiales s ON c.solicitud_id = s.id
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      WHERE c.id = $1
    `, [req.params.id])
    if (compra.rows.length === 0) {
      return res.status(404).json({ error: 'Compra diaria no encontrada' })
    }

    const detalle = await pool.query(
      'SELECT * FROM compras_diarias_detalle WHERE compra_id = $1 ORDER BY id',
      [req.params.id]
    )

    res.json({ ...compra.rows[0], detalle: detalle.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin', 'compras'),
  log('CREAR_COMPRA_DIARIA', req => `Oficina ${req.body.oficina}, ${Array.isArray(req.body.lineas) ? req.body.lineas.length : 0} linea(s)`),
  async (req, res) => {
  const { fecha, oficina, proveedor, solicitud_id, observaciones, lineas } = req.body

  if (!oficina || !oficina.trim()) {
    return res.status(400).json({ error: 'La oficina es requerida' })
  }
  const errLargo = validarLargos({
    'oficina': [oficina, 150],
    'proveedor': [proveedor, 150],
  })
  if (errLargo) return res.status(400).json({ error: errLargo })
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return res.status(400).json({ error: 'La compra debe incluir al menos una linea' })
  }
  for (const l of lineas) {
    if (typeof l.descripcion !== 'string' || !l.descripcion.trim()) {
      return res.status(400).json({ error: 'Cada linea debe tener una descripcion' })
    }
    const errLinea = validarLargos({ 'descripcion': [l.descripcion, 200] })
    if (errLinea) return res.status(400).json({ error: errLinea })
    if (!esCantidadValida(l.cantidad)) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 en todas las lineas' })
    }
    if (!esMontoValido(l.monto_unitario)) {
      return res.status(400).json({ error: 'El monto unitario debe ser un numero mayor o igual a 0 en todas las lineas' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let solicitudId = null
    if (solicitud_id !== null && solicitud_id !== undefined && solicitud_id !== '') {
      const existe = await client.query('SELECT id FROM solicitudes_materiales WHERE id = $1', [solicitud_id])
      if (existe.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'La solicitud de materiales indicada no existe' })
      }
      solicitudId = existe.rows[0].id
    }

    const numeroResult = await client.query(`SELECT nextval('compras_diarias_numero_seq') as n`)
    const numeroCompra = String(numeroResult.rows[0].n).padStart(6, '0')

    const compraResult = await client.query(
      `INSERT INTO compras_diarias (numero_compra, fecha, oficina, proveedor, solicitud_id, usuario_id, observaciones)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6, $7) RETURNING *`,
      [
        numeroCompra,
        fecha || null,
        oficina.trim(),
        (proveedor || '').trim() || null,
        solicitudId,
        req.usuario.id,
        (observaciones || '').trim() || null,
      ]
    )
    const compra = compraResult.rows[0]

    for (const l of lineas) {
      await client.query(
        'INSERT INTO compras_diarias_detalle (compra_id, descripcion, cantidad, monto_unitario) VALUES ($1, $2, $3, $4)',
        [compra.id, l.descripcion.trim(), l.cantidad, l.monto_unitario]
      )
    }

    await client.query('COMMIT')
    res.status(201).json(compra)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
