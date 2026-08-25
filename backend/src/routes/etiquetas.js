const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { ajustarInventario } = require('../utils/inventario')
const log = require('../middlewares/logMiddleware')

// Busqueda de etiquetas, usada para armar la nota de salida (seccion 5.5)
router.get('/', verificarToken, async (req, res) => {
  const { codigo, almacen_id, estado } = req.query
  const condiciones = []
  const valores = []
  let codigoIndex = null

  if (codigo) {
    valores.push(codigo)
    codigoIndex = valores.length
    condiciones.push(`e.codigo::text LIKE '%' || $${codigoIndex} || '%'`)
  }
  if (almacen_id) {
    valores.push(almacen_id)
    condiciones.push(`e.almacen_id = $${valores.length}`)
  }
  if (estado) {
    valores.push(estado)
    condiciones.push(`e.estado = $${valores.length}`)
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : ''
  // Una coincidencia exacta de codigo siempre debe quedar primera, para que el
  // LIMIT nunca la excluya cuando hay muchas etiquetas con el mismo sufijo.
  const orderBy = codigoIndex
    ? `ORDER BY (e.codigo::text = $${codigoIndex}) DESC, e.codigo DESC`
    : `ORDER BY e.codigo DESC`

  try {
    const result = await pool.query(`
      SELECT e.id, e.codigo, e.estado, e.almacen_id, e.producto_id,
             p.nombre as producto_nombre, a.nombre as almacen_nombre,
             gi.cantidad, g.numero_guia,
             um.nombre as unidad_medida_nombre, um.abreviatura as unidad_medida_abreviatura
      FROM etiquetas e
      JOIN productos p ON e.producto_id = p.id
      JOIN almacenes a ON e.almacen_id = a.id
      JOIN guia_items gi ON e.guia_item_id = gi.id
      JOIN guias g ON gi.guia_id = g.id
      LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
      ${where}
      ${orderBy}
      LIMIT 50
    `, valores)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Reporte de reimpresiones: quien y cuando reimprimio cada etiqueta (seccion 14 punto 4)
router.get('/reportes/reimpresiones', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT h.id, h.fecha, e.codigo as etiqueta_codigo, p.nombre as producto_nombre,
             a.nombre as almacen_nombre, u.nombre as usuario_nombre
      FROM etiqueta_historial h
      JOIN etiquetas e ON h.etiqueta_id = e.id
      JOIN productos p ON e.producto_id = p.id
      JOIN almacenes a ON e.almacen_id = a.id
      LEFT JOIN usuarios u ON h.usuario_id = u.id
      WHERE h.evento = 'REIMPRESA'
      ORDER BY h.fecha DESC
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, p.nombre as producto_nombre,
             um.nombre as unidad_medida_nombre, um.abreviatura as unidad_medida_abreviatura,
             a.nombre as almacen_nombre, gi.cantidad, g.numero_guia
      FROM etiquetas e
      JOIN productos p ON e.producto_id = p.id
      LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
      JOIN almacenes a ON e.almacen_id = a.id
      JOIN guia_items gi ON e.guia_item_id = gi.id
      JOIN guias g ON gi.guia_id = g.id
      WHERE e.id = $1
    `, [req.params.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada' })
    }
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Registra la impresion de una etiqueta: la primera vez queda como IMPRESA,
// las siguientes como REIMPRESA (seccion 5.2 y seccion 14 punto 3-4)
router.post('/:id/imprimir', verificarToken, soloRoles('admin', 'supervisor', 'operador'), async (req, res) => {
  try {
    const etiqueta = await pool.query('SELECT id FROM etiquetas WHERE id = $1', [req.params.id])
    if (etiqueta.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada' })
    }

    const previo = await pool.query(
      `SELECT id FROM etiqueta_historial WHERE etiqueta_id = $1 AND evento IN ('IMPRESA', 'REIMPRESA') LIMIT 1`,
      [req.params.id]
    )
    const evento = previo.rows.length > 0 ? 'REIMPRESA' : 'IMPRESA'

    await pool.query(
      `INSERT INTO etiqueta_historial (etiqueta_id, evento, usuario_id) VALUES ($1, $2, $3)`,
      [req.params.id, evento, req.usuario.id]
    )
    res.json({ evento })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Historial de vida del codigo: generado, impreso, salio, devolvio, transferido (seccion 14 punto 3)
router.get('/:id/historial', verificarToken, async (req, res) => {
  try {
    const etiqueta = await pool.query('SELECT id FROM etiquetas WHERE id = $1', [req.params.id])
    if (etiqueta.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada' })
    }
    const result = await pool.query(`
      SELECT h.*, u.nombre as usuario_nombre,
             ao.nombre as almacen_origen_nombre, ad.nombre as almacen_destino_nombre
      FROM etiqueta_historial h
      LEFT JOIN usuarios u ON h.usuario_id = u.id
      LEFT JOIN almacenes ao ON h.almacen_origen_id = ao.id
      LEFT JOIN almacenes ad ON h.almacen_destino_id = ad.id
      WHERE h.etiqueta_id = $1
      ORDER BY h.fecha ASC
    `, [req.params.id])
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Transferencia de un codigo entre almacenes, sin perder su identidad ni su historial (seccion 14 punto 7)
router.post('/:id/transferir', verificarToken, soloRoles('admin', 'supervisor', 'operador'),
  log('TRANSFERIR_ETIQUETA', req => `Codigo id ${req.params.id} a almacen ${req.body.almacen_destino_id}`),
  async (req, res) => {
  const { almacen_destino_id } = req.body
  if (!almacen_destino_id) {
    return res.status(400).json({ error: 'El almacen destino es requerido' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const etiquetaResult = await client.query(`
      SELECT e.*, gi.cantidad
      FROM etiquetas e
      JOIN guia_items gi ON e.guia_item_id = gi.id
      WHERE e.id = $1
      FOR UPDATE
    `, [req.params.id])
    if (etiquetaResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Etiqueta no encontrada' })
    }
    const etiqueta = etiquetaResult.rows[0]

    if (etiqueta.estado !== 'EN_ALMACEN') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Solo se pueden transferir codigos que esten en almacen' })
    }
    if (Number(almacen_destino_id) === etiqueta.almacen_id) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El almacen destino debe ser distinto al actual' })
    }

    const origenId = etiqueta.almacen_id

    await ajustarInventario(client, {
      almacenId: origenId,
      productoId: etiqueta.producto_id,
      delta: -etiqueta.cantidad,
    })
    await ajustarInventario(client, {
      almacenId: almacen_destino_id,
      productoId: etiqueta.producto_id,
      delta: etiqueta.cantidad,
      descripcion: 'Transferencia de codigo entre almacenes',
    })

    const actualizada = await client.query(
      'UPDATE etiquetas SET almacen_id = $1 WHERE id = $2 RETURNING *',
      [almacen_destino_id, req.params.id]
    )

    await client.query(
      `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_origen_id, almacen_destino_id, usuario_id)
       VALUES ($1, 'TRANSFERIDA', $2, $3, $4)`,
      [req.params.id, origenId, almacen_destino_id, req.usuario.id]
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
