const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { validarLargos } = require('../utils/texto')
const { mensajeConcurrencia } = require('../utils/dbErrores')
const { periodoCerrado } = require('../utils/periodo')
const log = require('../middlewares/logMiddleware')

const ERR_PERIODO_CERRADO = 'El periodo de esta nota esta CERRADO; pedile a un admin que lo reabra para poder modificarla.'

router.get('/', verificarToken, async (req, res) => {
  const { numero_nota, estado, periodo_id, almacen_id } = req.query
  const condiciones = []
  const valores = []

  if (numero_nota) {
    valores.push(`%${numero_nota}%`)
    condiciones.push(`n.numero_nota ILIKE $${valores.length}`)
  }
  if (estado) {
    valores.push(estado)
    condiciones.push(`n.estado = $${valores.length}`)
  }
  if (periodo_id) {
    valores.push(periodo_id)
    condiciones.push(`n.periodo_id = $${valores.length}`)
  }
  if (almacen_id) {
    valores.push(almacen_id)
    condiciones.push(`n.almacen_id = $${valores.length}`)
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : ''

  try {
    const result = await pool.query(`
      SELECT n.id, n.numero_nota, n.seccion, n.persona_responsable, n.nota_salida_ref,
             n.fecha, n.estado, n.periodo_id, n.almacen_id, a.nombre as almacen_nombre,
             u.nombre as usuario_nombre,
             COUNT(d.id)::int as total_lineas
      FROM notas_desuso n
      JOIN almacenes a ON n.almacen_id = a.id
      LEFT JOIN usuarios u ON n.usuario_id = u.id
      LEFT JOIN notas_desuso_detalle d ON d.nota_desuso_id = n.id
      ${where}
      GROUP BY n.id, a.nombre, u.nombre
      ORDER BY n.fecha DESC
    `, valores)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const nota = await pool.query(`
      SELECT n.*, a.nombre as almacen_nombre, u.nombre as usuario_nombre,
             ua.nombre as anulado_por_nombre,
             pe.estado as periodo_estado, pe.nombre as periodo_nombre
      FROM notas_desuso n
      JOIN almacenes a ON n.almacen_id = a.id
      LEFT JOIN usuarios u ON n.usuario_id = u.id
      LEFT JOIN usuarios ua ON n.anulado_por = ua.id
      LEFT JOIN periodos pe ON n.periodo_id = pe.id
      WHERE n.id = $1
    `, [req.params.id])
    if (nota.rows.length === 0) {
      return res.status(404).json({ error: 'Nota de desuso no encontrada' })
    }

    const detalle = await pool.query(`
      SELECT d.*, d.cantidad::float8 as cantidad,
             um.nombre as unidad_medida_nombre, um.abreviatura as unidad_medida_abreviatura
      FROM notas_desuso_detalle d
      LEFT JOIN unidades_medida um ON d.unidad_medida_id = um.id
      WHERE d.nota_desuso_id = $1
      ORDER BY d.id
    `, [req.params.id])

    res.json({ ...nota.rows[0], detalle: detalle.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin', 'almacen', 'almacenero'),
  log('CREAR_NOTA_DESUSO', req => `Responsable ${req.body.persona_responsable}, ${Array.isArray(req.body.lineas) ? req.body.lineas.length : 0} linea(s)`),
  async (req, res) => {
  const { seccion, persona_responsable, nota_salida_ref, almacen_id, observaciones, lineas } = req.body

  if (!persona_responsable || !persona_responsable.trim()) {
    return res.status(400).json({ error: 'La persona responsable es requerida' })
  }
  if (!almacen_id) {
    return res.status(400).json({ error: 'El almacen es requerido' })
  }
  const errLargo = validarLargos({
    'seccion': [seccion, 100],
    'persona responsable': [persona_responsable, 150],
    'nota de salida de referencia': [nota_salida_ref, 20],
  })
  if (errLargo) return res.status(400).json({ error: errLargo })
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return res.status(400).json({ error: 'La nota de desuso debe incluir al menos una linea' })
  }
  for (const l of lineas) {
    if (!l.descripcion || !l.descripcion.trim()) {
      return res.status(400).json({ error: 'Cada linea debe tener una descripcion' })
    }
    const cant = Number(l.cantidad)
    if (!Number.isFinite(cant) || cant <= 0) {
      return res.status(400).json({ error: `Cantidad invalida para "${l.descripcion}"` })
    }
  }
  const errLargoLineas = lineas.map((l, i) => validarLargos({
    [`descripcion linea ${i + 1}`]: [l.descripcion, 200],
    [`area/maquina linea ${i + 1}`]: [l.area_maquina, 150],
  })).find(Boolean)
  if (errLargoLineas) return res.status(400).json({ error: errLargoLineas })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const almacen = await client.query('SELECT id FROM almacenes WHERE id = $1', [almacen_id])
    if (almacen.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El almacen indicado no existe' })
    }

    const perActivo = await client.query(
      `SELECT id FROM periodos WHERE almacen_id = $1 AND estado = 'ACTIVO'`, [almacen_id]
    )
    const periodoId = perActivo.rows[0]?.id || null

    const numeroResult = await client.query(`SELECT nextval('notas_desuso_numero_seq') as n`)
    const numeroNota = String(numeroResult.rows[0].n).padStart(6, '0')

    const notaResult = await client.query(
      `INSERT INTO notas_desuso (numero_nota, seccion, persona_responsable, nota_salida_ref, almacen_id, usuario_id, observaciones, periodo_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        numeroNota,
        seccion?.trim() || null,
        persona_responsable.trim(),
        nota_salida_ref?.trim() || null,
        almacen_id,
        req.usuario.id,
        observaciones?.trim() || null,
        periodoId,
      ]
    )
    const nota = notaResult.rows[0]

    for (const l of lineas) {
      await client.query(
        `INSERT INTO notas_desuso_detalle (nota_desuso_id, descripcion, cantidad, unidad_medida_id, area_maquina)
         VALUES ($1, $2, $3, $4, $5)`,
        [nota.id, l.descripcion.trim(), Number(l.cantidad), l.unidad_medida_id || null, l.area_maquina?.trim() || null]
      )
    }

    await client.query('COMMIT')
    res.status(201).json(nota)
  } catch (err) {
    await client.query('ROLLBACK')
    const msgConcurrencia = mensajeConcurrencia(err)
    if (msgConcurrencia) return res.status(503).json({ error: msgConcurrencia })
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

router.put('/:id', verificarToken, soloRoles('admin', 'almacen', 'almacenero'),
  log('EDITAR_NOTA_DESUSO', req => `Nota de desuso id ${req.params.id}, responsable ${req.body.persona_responsable}`),
  async (req, res) => {
  const persona_responsable = (req.body.persona_responsable || '').trim()
  const seccion = (req.body.seccion || '').trim()
  const nota_salida_ref = (req.body.nota_salida_ref || '').trim()
  const observaciones = (req.body.observaciones || '').trim()

  if (!persona_responsable) {
    return res.status(400).json({ error: 'La persona responsable es requerida' })
  }
  const errLargo = validarLargos({
    'seccion': [seccion, 100],
    'persona responsable': [persona_responsable, 150],
    'nota de salida de referencia': [nota_salida_ref, 20],
  })
  if (errLargo) return res.status(400).json({ error: errLargo })

  try {
    const nota = await pool.query('SELECT estado, periodo_id FROM notas_desuso WHERE id = $1', [req.params.id])
    if (nota.rows.length === 0) {
      return res.status(404).json({ error: 'Nota de desuso no encontrada' })
    }
    if (nota.rows[0].estado === 'ANULADA') {
      return res.status(400).json({ error: 'Esta nota esta anulada' })
    }
    if (await periodoCerrado(null, nota.rows[0].periodo_id)) {
      return res.status(409).json({ error: ERR_PERIODO_CERRADO })
    }

    const actualizada = await pool.query(
      `UPDATE notas_desuso
          SET persona_responsable = $1, seccion = $2, nota_salida_ref = $3, observaciones = $4
        WHERE id = $5
      RETURNING *`,
      [persona_responsable, seccion || null, nota_salida_ref || null, observaciones || null, req.params.id]
    )
    res.json(actualizada.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/anular', verificarToken, soloRoles('admin', 'almacen', 'almacenero'),
  log('ANULAR_NOTA_DESUSO', req => `Nota de desuso id ${req.params.id}, motivo: ${(req.body.motivo || '').trim() || 'sin indicar'}`),
  async (req, res) => {
  const motivo = (req.body.motivo || '').trim()
  if (!motivo) {
    return res.status(400).json({ error: 'El motivo de anulacion es requerido' })
  }
  const errLargo = validarLargos({ 'motivo': [motivo, 200] })
  if (errLargo) return res.status(400).json({ error: errLargo })

  try {
    const nota = await pool.query('SELECT estado, periodo_id FROM notas_desuso WHERE id = $1', [req.params.id])
    if (nota.rows.length === 0) {
      return res.status(404).json({ error: 'Nota de desuso no encontrada' })
    }
    if (nota.rows[0].estado === 'ANULADA') {
      return res.status(400).json({ error: 'La nota ya esta anulada' })
    }
    if (await periodoCerrado(null, nota.rows[0].periodo_id)) {
      return res.status(409).json({ error: ERR_PERIODO_CERRADO })
    }

    const actualizada = await pool.query(
      `UPDATE notas_desuso
          SET estado = 'ANULADA', motivo_anulacion = $1, anulado_por = $2, anulado_en = NOW()
        WHERE id = $3
      RETURNING *`,
      [motivo, req.usuario.id, req.params.id]
    )
    res.json(actualizada.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
