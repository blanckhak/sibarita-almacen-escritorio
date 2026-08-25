const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { ajustarInventario } = require('../utils/inventario')
const log = require('../middlewares/logMiddleware')

const MOTIVOS = ['USO_INTERNO', 'PRESTAMO', 'REPARACION', 'DESECHO', 'OTRO']

// Marca una etiqueta como salida del almacen: cambia estado, registra historial y descuenta inventario
async function marcarSalida(client, etiqueta, numeroNota, usuarioId) {
  await client.query(`UPDATE etiquetas SET estado = 'SALIO' WHERE id = $1`, [etiqueta.id])

  await client.query(
    `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_origen_id, usuario_id, detalle)
     VALUES ($1, 'SALIO', $2, $3, $4)`,
    [etiqueta.id, etiqueta.almacen_id, usuarioId, `Nota de salida ${numeroNota}`]
  )

  await ajustarInventario(client, {
    almacenId: etiqueta.almacen_id,
    productoId: etiqueta.producto_id,
    delta: -etiqueta.cantidad,
  })
}

router.get('/', verificarToken, async (req, res) => {
  const { numero_nota, estado } = req.query
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
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : ''

  try {
    const result = await pool.query(`
      SELECT n.id, n.numero_nota, n.seccion, n.persona_responsable, n.motivo,
             n.fecha, n.estado, g.numero_guia,
             u.nombre as usuario_nombre,
             COUNT(d.id)::int as total_lineas
      FROM notas_salida n
      LEFT JOIN guias g ON n.guia_id = g.id
      LEFT JOIN usuarios u ON n.usuario_id = u.id
      LEFT JOIN notas_salida_detalle d ON d.nota_salida_id = n.id
      ${where}
      GROUP BY n.id, g.numero_guia, u.nombre
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
      SELECT n.*, g.numero_guia, u.nombre as usuario_nombre
      FROM notas_salida n
      LEFT JOIN guias g ON n.guia_id = g.id
      LEFT JOIN usuarios u ON n.usuario_id = u.id
      WHERE n.id = $1
    `, [req.params.id])
    if (nota.rows.length === 0) {
      return res.status(404).json({ error: 'Nota de salida no encontrada' })
    }

    const detalle = await pool.query(`
      SELECT d.*, e.codigo as etiqueta_codigo, e.estado as etiqueta_estado, e.almacen_id,
             p.nombre as producto_nombre, a.nombre as almacen_nombre
      FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      JOIN productos p ON e.producto_id = p.id
      JOIN almacenes a ON e.almacen_id = a.id
      WHERE d.nota_salida_id = $1
      ORDER BY d.id
    `, [req.params.id])

    res.json({ ...nota.rows[0], detalle: detalle.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin', 'supervisor', 'operador'),
  log('CREAR_NOTA_SALIDA', req => `Responsable ${req.body.persona_responsable}, motivo ${req.body.motivo}, ${Array.isArray(req.body.lineas) ? req.body.lineas.length : 0} codigo(s)`),
  async (req, res) => {
  const { seccion, persona_responsable, motivo, requiere_devolucion, observaciones, lineas } = req.body

  if (!persona_responsable || !persona_responsable.trim()) {
    return res.status(400).json({ error: 'La persona responsable es requerida' })
  }
  if (!MOTIVOS.includes(motivo)) {
    return res.status(400).json({ error: 'Motivo invalido' })
  }
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return res.status(400).json({ error: 'La nota de salida debe incluir al menos un codigo' })
  }
  const etiquetaIds = lineas.map(l => l.etiqueta_id)
  if (new Set(etiquetaIds).size !== etiquetaIds.length) {
    return res.status(400).json({ error: 'Hay codigos repetidos en la nota de salida' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const etiquetas = await client.query(`
      SELECT e.id, e.estado, e.almacen_id, e.producto_id, e.codigo, gi.cantidad, gi.guia_id
      FROM etiquetas e
      JOIN guia_items gi ON e.guia_item_id = gi.id
      WHERE e.id = ANY($1::int[])
      FOR UPDATE
    `, [etiquetaIds])

    if (etiquetas.rows.length !== etiquetaIds.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Uno o mas codigos no existen' })
    }
    const noDisponible = etiquetas.rows.find(e => e.estado !== 'EN_ALMACEN')
    if (noDisponible) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: `El codigo ${noDisponible.codigo} ya no esta disponible en almacen` })
    }

    const guiaIds = new Set(etiquetas.rows.map(e => e.guia_id))
    const guiaRelacionada = guiaIds.size === 1 ? [...guiaIds][0] : null

    const numeroResult = await client.query(`SELECT nextval('notas_salida_numero_seq') as n`)
    const numeroNota = String(numeroResult.rows[0].n).padStart(6, '0')

    const etiquetasPorId = Object.fromEntries(etiquetas.rows.map(e => [e.id, e]))
    const detallesCalculados = lineas.map(linea => {
      const et = etiquetasPorId[linea.etiqueta_id]
      const pUnitario = linea.p_unitario !== null && linea.p_unitario !== undefined && linea.p_unitario !== ''
        ? Number(linea.p_unitario) : null
      const total = pUnitario !== null ? pUnitario * et.cantidad : null
      return { etiqueta: et, pUnitario, total, observaciones: linea.observaciones?.trim() || null }
    })
    const montoTotal = detallesCalculados.reduce((s, d) => s + (d.total || 0), 0)

    // Aprobacion previa para salidas de alto valor (seccion 14 punto 5, CU-05)
    const parametro = await client.query('SELECT * FROM parametros_aprobacion WHERE activo = true ORDER BY id DESC LIMIT 1')
    const requiereAprobacion = parametro.rows.length > 0 && parametro.rows[0].monto_minimo != null && montoTotal >= Number(parametro.rows[0].monto_minimo)

    const estadoInicial = requiereAprobacion
      ? 'EN_APROBACION'
      : (requiere_devolucion === false ? 'CERRADO' : 'PENDIENTE')

    const notaResult = await client.query(
      `INSERT INTO notas_salida (numero_nota, seccion, persona_responsable, motivo, guia_id, usuario_id, estado, observaciones, requiere_devolucion, fecha_salida)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        numeroNota,
        seccion?.trim() || null,
        persona_responsable.trim(),
        motivo,
        guiaRelacionada,
        req.usuario.id,
        estadoInicial,
        observaciones?.trim() || null,
        requiere_devolucion !== false,
        requiereAprobacion ? null : new Date(),
      ]
    )
    const nota = notaResult.rows[0]

    for (const d of detallesCalculados) {
      await client.query(
        `INSERT INTO notas_salida_detalle (nota_salida_id, etiqueta_id, cantidad, p_unitario, total, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [nota.id, d.etiqueta.id, d.etiqueta.cantidad, d.pUnitario, d.total, d.observaciones]
      )

      // Si queda en aprobacion, el producto todavia no sale fisicamente del almacen (CU-05)
      if (!requiereAprobacion) {
        await marcarSalida(client, d.etiqueta, numeroNota, req.usuario.id)
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ ...nota, numero_guia: null, detalle_generado: lineas.length, monto_total: montoTotal })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// CU-05: el supervisor/admin aprueba una nota que quedo retenida por superar el umbral configurado
router.post('/:id/aprobar', verificarToken, soloRoles('admin', 'supervisor'),
  log('APROBAR_NOTA_SALIDA', req => `Nota de salida id ${req.params.id}`),
  async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const nota = await client.query('SELECT * FROM notas_salida WHERE id = $1 FOR UPDATE', [req.params.id])
    if (nota.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Nota de salida no encontrada' })
    }
    if (nota.rows[0].estado !== 'EN_APROBACION') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Esta nota no esta pendiente de aprobacion' })
    }

    const detalle = await client.query(`
      SELECT d.etiqueta_id, e.estado, e.almacen_id, e.producto_id, e.codigo, d.cantidad
      FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      WHERE d.nota_salida_id = $1
      FOR UPDATE OF e
    `, [req.params.id])

    for (const linea of detalle.rows) {
      if (linea.estado !== 'EN_ALMACEN') {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: `El codigo ${linea.codigo} ya no esta disponible en almacen` })
      }
    }

    for (const linea of detalle.rows) {
      await marcarSalida(client, { id: linea.etiqueta_id, almacen_id: linea.almacen_id, producto_id: linea.producto_id, cantidad: linea.cantidad }, nota.rows[0].numero_nota, req.usuario.id)
    }

    const nuevoEstado = nota.rows[0].requiere_devolucion ? 'PENDIENTE' : 'CERRADO'
    const actualizada = await client.query(
      'UPDATE notas_salida SET estado = $1, fecha_salida = NOW() WHERE id = $2 RETURNING *',
      [nuevoEstado, req.params.id]
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

// CU-05 (rechazo): el producto nunca salio, la nota queda cerrada con el motivo del rechazo
router.post('/:id/rechazar', verificarToken, soloRoles('admin', 'supervisor'),
  log('RECHAZAR_NOTA_SALIDA', req => `Nota de salida id ${req.params.id}, motivo: ${req.body.motivo || 'sin indicar'}`),
  async (req, res) => {
  const { motivo } = req.body
  try {
    const nota = await pool.query('SELECT * FROM notas_salida WHERE id = $1', [req.params.id])
    if (nota.rows.length === 0) {
      return res.status(404).json({ error: 'Nota de salida no encontrada' })
    }
    if (nota.rows[0].estado !== 'EN_APROBACION') {
      return res.status(400).json({ error: 'Esta nota no esta pendiente de aprobacion' })
    }

    const observacionesFinal = [nota.rows[0].observaciones, `[Rechazada] ${motivo || 'Sin motivo indicado'}`]
      .filter(Boolean).join(' — ')

    const actualizada = await pool.query(
      `UPDATE notas_salida SET estado = 'CERRADO', observaciones = $1 WHERE id = $2 RETURNING *`,
      [observacionesFinal, req.params.id]
    )
    res.json(actualizada.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// CU-03: la devolucion solo puede registrarse contra una nota de salida valida y vigente
router.post('/:id/devolucion', verificarToken, soloRoles('admin', 'supervisor', 'operador'),
  log('REGISTRAR_DEVOLUCION', req => `Nota de salida id ${req.params.id}, ${Array.isArray(req.body.etiqueta_ids) ? req.body.etiqueta_ids.length : 0} codigo(s)`),
  async (req, res) => {
  const { etiqueta_ids } = req.body
  if (!Array.isArray(etiqueta_ids) || etiqueta_ids.length === 0) {
    return res.status(400).json({ error: 'Selecciona al menos un codigo para devolver' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const nota = await client.query('SELECT * FROM notas_salida WHERE id = $1 FOR UPDATE', [req.params.id])
    if (nota.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Nota de salida no encontrada' })
    }
    if (nota.rows[0].estado === 'CERRADO') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Esta nota de salida no requiere devolucion' })
    }
    if (nota.rows[0].estado === 'DEVUELTO') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Todos los codigos de esta nota ya fueron devueltos' })
    }
    if (nota.rows[0].estado === 'EN_APROBACION') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Esta nota esta pendiente de aprobacion; el producto todavia no ha salido del almacen' })
    }

    const detalle = await client.query(`
      SELECT d.etiqueta_id, e.estado, e.almacen_id, e.producto_id, e.codigo, d.cantidad
      FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      WHERE d.nota_salida_id = $1
      FOR UPDATE OF e
    `, [req.params.id])

    const detallePorId = Object.fromEntries(detalle.rows.map(d => [d.etiqueta_id, d]))
    for (const eid of etiqueta_ids) {
      const linea = detallePorId[eid]
      if (!linea) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `El codigo ${eid} no pertenece a esta nota de salida` })
      }
      if (linea.estado !== 'SALIO') {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `El codigo ${linea.codigo} ya fue devuelto` })
      }
    }

    for (const eid of etiqueta_ids) {
      const linea = detallePorId[eid]

      await client.query(`UPDATE etiquetas SET estado = 'EN_ALMACEN' WHERE id = $1`, [eid])

      await client.query(
        `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_destino_id, usuario_id, detalle)
         VALUES ($1, 'DEVOLVIO', $2, $3, $4)`,
        [eid, linea.almacen_id, req.usuario.id, `Devolucion nota ${nota.rows[0].numero_nota}`]
      )

      await ajustarInventario(client, {
        almacenId: linea.almacen_id,
        productoId: linea.producto_id,
        delta: linea.cantidad,
        descripcion: 'Devolucion nota de salida',
      })
    }

    const pendientes = await client.query(`
      SELECT COUNT(*) FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      WHERE d.nota_salida_id = $1 AND e.estado = 'SALIO'
    `, [req.params.id])
    const nuevoEstado = parseInt(pendientes.rows[0].count) === 0 ? 'DEVUELTO' : 'PENDIENTE'

    const actualizada = await client.query(
      'UPDATE notas_salida SET estado = $1 WHERE id = $2 RETURNING *',
      [nuevoEstado, req.params.id]
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

// Registra que se reviso un codigo y todavia NO lo han devuelto: no cambia
// ningun estado (la etiqueta sigue SALIO, la nota sigue PENDIENTE), solo
// queda anotado en la auditoria para seguimiento.
router.post('/:id/lineas/:etiquetaId/no-devuelto', verificarToken, soloRoles('admin', 'supervisor', 'operador'),
  log('MARCAR_NO_DEVUELTO', req => `Nota de salida id ${req.params.id}, etiqueta id ${req.params.etiquetaId}`),
  async (req, res) => {
  try {
    const linea = await pool.query(`
      SELECT d.id, e.estado
      FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      WHERE d.nota_salida_id = $1 AND d.etiqueta_id = $2
    `, [req.params.id, req.params.etiquetaId])
    if (linea.rows.length === 0) {
      return res.status(404).json({ error: 'Ese codigo no pertenece a esta nota de salida' })
    }
    if (linea.rows[0].estado !== 'SALIO') {
      return res.status(400).json({ error: 'Ese codigo no esta pendiente de devolucion' })
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
