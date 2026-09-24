const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { validarLargos } = require('../utils/texto')
const log = require('../middlewares/logMiddleware')
const { perfilSql } = require('../utils/perfil')

const CATEGORIAS = ['MUESTRAS', 'INSUMOS', 'MATERIA_PRIMA', 'REPUESTOS', 'HERRAMIENTAS', 'OTROS']

router.get('/', verificarToken, async (req, res) => {
  const { estado } = req.query
  const condiciones = []
  const valores = []

  if (estado) {
    valores.push(estado)
    condiciones.push(`s.estado = $${valores.length}`)
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : ''

  try {
    const result = await pool.query(`
      SELECT s.id, s.numero_solicitud, s.seccion, s.persona_responsable, s.categoria,
             s.periodo, s.fecha, s.estado, a.nombre as almacen_nombre,
             ${perfilSql('u', 'ru')} as usuario_nombre,
             COUNT(d.id)::int as total_lineas
      FROM solicitudes_materiales s
      JOIN almacenes a ON s.almacen_id = a.id
      LEFT JOIN usuarios u ON s.usuario_id = u.id
      LEFT JOIN roles ru ON ru.id = u.rol_id
      LEFT JOIN solicitudes_materiales_detalle d ON d.solicitud_id = s.id
      ${where}
      GROUP BY s.id, a.nombre, u.nombre, ru.nombre
      ORDER BY s.fecha DESC
    `, valores)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const solicitud = await pool.query(`
      SELECT s.*, a.nombre as almacen_nombre, ${perfilSql('u', 'ru')} as usuario_nombre
      FROM solicitudes_materiales s
      JOIN almacenes a ON s.almacen_id = a.id
      LEFT JOIN usuarios u ON s.usuario_id = u.id
      LEFT JOIN roles ru ON ru.id = u.rol_id
      WHERE s.id = $1
    `, [req.params.id])
    if (solicitud.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' })
    }

    const detalle = await pool.query(
      'SELECT * FROM solicitudes_materiales_detalle WHERE solicitud_id = $1 ORDER BY id',
      [req.params.id]
    )

    res.json({ ...solicitud.rows[0], detalle: detalle.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin', 'mantenimiento'),
  log('CREAR_SOLICITUD_MATERIALES', req => `Responsable ${req.body.persona_responsable}, categoria ${req.body.categoria}, ${Array.isArray(req.body.lineas) ? req.body.lineas.length : 0} linea(s)`),
  async (req, res) => {
  const { almacen_id, seccion, persona_responsable, categoria, categoria_detalle, periodo, observaciones, lineas } = req.body

  if (!almacen_id) {
    return res.status(400).json({ error: 'El almacen es requerido' })
  }
  if (!persona_responsable || !persona_responsable.trim()) {
    return res.status(400).json({ error: 'La persona responsable es requerida' })
  }
  if (!CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: 'Categoria invalida' })
  }
  if (categoria === 'OTROS' && (!categoria_detalle || !categoria_detalle.trim())) {
    return res.status(400).json({ error: 'Debes especificar la categoria cuando eliges "Otros"' })
  }
  const errLargo = validarLargos({
    'seccion': [seccion, 100],
    'persona responsable': [persona_responsable, 150],
    'detalle de categoria': [categoria_detalle, 200],
  })
  if (errLargo) return res.status(400).json({ error: errLargo })
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return res.status(400).json({ error: 'La solicitud debe incluir al menos un producto' })
  }
  for (const l of lineas) {
    const errLinea = validarLargos({ 'producto': [l.producto, 200] })
    if (errLinea) return res.status(400).json({ error: errLinea })
    if (typeof l.producto !== 'string' || !l.producto.trim()) {
      return res.status(400).json({ error: 'Cada linea debe tener un producto' })
    }
    if (!Number(l.cantidad) || Number(l.cantidad) <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 en todas las lineas' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const numeroResult = await client.query(`SELECT nextval('solicitudes_materiales_numero_seq') as n`)
    const numeroSolicitud = String(numeroResult.rows[0].n).padStart(6, '0')

    const solicitudResult = await client.query(
      `INSERT INTO solicitudes_materiales (numero_solicitud, almacen_id, seccion, persona_responsable, categoria, categoria_detalle, periodo, usuario_id, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        numeroSolicitud, almacen_id,
        (seccion || '').trim() || null,
        persona_responsable.trim(),
        categoria,
        (categoria_detalle || '').trim() || null,
        periodo || null,
        req.usuario.id,
        (observaciones || '').trim() || null,
      ]
    )
    const solicitud = solicitudResult.rows[0]

    for (const l of lineas) {
      await client.query(
        'INSERT INTO solicitudes_materiales_detalle (solicitud_id, producto, cantidad) VALUES ($1, $2, $3)',
        [solicitud.id, l.producto.trim(), l.cantidad]
      )
    }

    await client.query('COMMIT')
    res.status(201).json(solicitud)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Editar una solicitud: solo mientras sigue PENDIENTE (una vez atendida o
// rechazada, ya no tiene sentido corregirla). Mismas validaciones que el
// alta; reemplaza el detalle entero (borra e inserta de nuevo) en vez de
// diffear linea por linea, igual que hace el alta.
router.put('/:id', verificarToken, soloRoles('admin', 'mantenimiento'),
  log('EDITAR_SOLICITUD_MATERIALES', req => `Solicitud id ${req.params.id}: ${JSON.stringify(req.body)}`),
  async (req, res) => {
  const { seccion, persona_responsable, categoria, categoria_detalle, periodo, observaciones, lineas } = req.body

  if (!persona_responsable || !persona_responsable.trim()) {
    return res.status(400).json({ error: 'La persona responsable es requerida' })
  }
  if (!CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ error: 'Categoria invalida' })
  }
  if (categoria === 'OTROS' && (!categoria_detalle || !categoria_detalle.trim())) {
    return res.status(400).json({ error: 'Debes especificar la categoria cuando eliges "Otros"' })
  }
  const errLargo = validarLargos({
    'seccion': [seccion, 100],
    'persona responsable': [persona_responsable, 150],
    'detalle de categoria': [categoria_detalle, 200],
  })
  if (errLargo) return res.status(400).json({ error: errLargo })
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return res.status(400).json({ error: 'La solicitud debe incluir al menos un producto' })
  }
  for (const l of lineas) {
    const errLinea = validarLargos({ 'producto': [l.producto, 200] })
    if (errLinea) return res.status(400).json({ error: errLinea })
    if (typeof l.producto !== 'string' || !l.producto.trim()) {
      return res.status(400).json({ error: 'Cada linea debe tener un producto' })
    }
    if (!Number(l.cantidad) || Number(l.cantidad) <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 en todas las lineas' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const actual = await client.query('SELECT * FROM solicitudes_materiales WHERE id = $1 FOR UPDATE', [req.params.id])
    if (actual.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Solicitud no encontrada' })
    }
    if (actual.rows[0].estado !== 'PENDIENTE') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Esta solicitud ya fue procesada, no se puede editar' })
    }

    const actualizada = await client.query(
      `UPDATE solicitudes_materiales
       SET seccion = $1, persona_responsable = $2, categoria = $3, categoria_detalle = $4, periodo = $5, observaciones = $6
       WHERE id = $7 RETURNING *`,
      [
        (seccion || '').trim() || null,
        persona_responsable.trim(),
        categoria,
        (categoria_detalle || '').trim() || null,
        periodo || null,
        (observaciones || '').trim() || null,
        req.params.id,
      ]
    )

    await client.query('DELETE FROM solicitudes_materiales_detalle WHERE solicitud_id = $1', [req.params.id])
    for (const l of lineas) {
      await client.query(
        'INSERT INTO solicitudes_materiales_detalle (solicitud_id, producto, cantidad) VALUES ($1, $2, $3)',
        [req.params.id, l.producto.trim(), l.cantidad]
      )
    }

    await client.query('COMMIT')

    const detalle = await pool.query(
      'SELECT * FROM solicitudes_materiales_detalle WHERE solicitud_id = $1 ORDER BY id',
      [req.params.id]
    )
    res.json({ ...actualizada.rows[0], detalle: detalle.rows })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

router.post('/:id/atender', verificarToken, soloRoles('admin', 'almacen', 'almacenero'),
  log('ATENDER_SOLICITUD_MATERIALES', req => `Solicitud id ${req.params.id}`),
  async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const solicitud = await client.query('SELECT * FROM solicitudes_materiales WHERE id = $1 FOR UPDATE', [req.params.id])
    if (solicitud.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Solicitud no encontrada' })
    }
    if (solicitud.rows[0].estado !== 'PENDIENTE') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Esta solicitud ya fue procesada' })
    }
    const actualizada = await client.query(
      `UPDATE solicitudes_materiales SET estado = 'ATENDIDA' WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    await client.query('COMMIT')
    res.json(actualizada.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

router.post('/:id/rechazar', verificarToken, soloRoles('admin', 'almacen', 'almacenero'),
  log('RECHAZAR_SOLICITUD_MATERIALES', req => `Solicitud id ${req.params.id}, motivo: ${req.body.motivo || 'sin indicar'}`),
  async (req, res) => {
  const { motivo } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const solicitud = await client.query('SELECT * FROM solicitudes_materiales WHERE id = $1 FOR UPDATE', [req.params.id])
    if (solicitud.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Solicitud no encontrada' })
    }
    if (solicitud.rows[0].estado !== 'PENDIENTE') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Esta solicitud ya fue procesada' })
    }

    const observacionesFinal = [solicitud.rows[0].observaciones, `[Rechazada] ${motivo || 'Sin motivo indicado'}`]
      .filter(Boolean).join(' — ')

    const actualizada = await client.query(
      `UPDATE solicitudes_materiales SET estado = 'RECHAZADA', observaciones = $1 WHERE id = $2 RETURNING *`,
      [observacionesFinal, req.params.id]
    )
    await client.query('COMMIT')
    res.json(actualizada.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
