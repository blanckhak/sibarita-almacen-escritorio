const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken } = require('../middlewares/authMiddleware')

// Dias sin ningun movimiento tras los cuales una etiqueta EN_ALMACEN se
// considera "sin movimiento" (Bloque 3: parametros de stock a 10 dias).
const DIAS_SIN_MOVIMIENTO = parseInt(process.env.DIAS_SIN_MOVIMIENTO) || 10

// La ultima actividad de una etiqueta es la mas reciente entre su generacion y
// cualquier evento de su bitacora (SALIO, DEVOLVIO, TRANSFERIDA, IMPRESA...).
// Se calcula una sola vez por fila con JOIN LATERAL (mismo patron que alertas.js).
const ULTIMA_ACTIVIDAD_LATERAL = `
  JOIN LATERAL (
    SELECT GREATEST(
      e.fecha_generacion,
      COALESCE((SELECT MAX(h.fecha) FROM etiqueta_historial h WHERE h.etiqueta_id = e.id), e.fecha_generacion)
    ) as fecha
  ) ua ON true
`

// Bloque 3: "stock consolidado en el campo Motivo" = reporte de salidas
// agrupadas por motivo (y almacen), en un rango de fechas. Solo cuenta notas
// que ya salieron fisicamente del almacen (fecha_salida NOT NULL); una nota
// EN_APROBACION todavia no movio stock.
router.get('/salidas-por-motivo', verificarToken, async (req, res) => {
  const { desde, hasta, almacen_id } = req.query
  const cond = ['n.fecha_salida IS NOT NULL']
  const val = []
  if (desde)      { val.push(desde);      cond.push(`n.fecha_salida >= $${val.length}`) }
  if (hasta)      { val.push(hasta);      cond.push(`n.fecha_salida < ($${val.length}::date + 1)`) }
  if (almacen_id) { val.push(almacen_id); cond.push(`e.almacen_id = $${val.length}`) }

  try {
    const result = await pool.query(`
      SELECT n.motivo,
             a.nombre as almacen,
             COUNT(DISTINCT n.id)::int as notas,
             SUM(d.cantidad)::int as unidades
      FROM notas_salida n
      JOIN notas_salida_detalle d ON d.nota_salida_id = n.id
      JOIN etiquetas e ON d.etiqueta_id = e.id
      JOIN almacenes a ON e.almacen_id = a.id
      WHERE ${cond.join(' AND ')}
      GROUP BY n.motivo, a.nombre
      ORDER BY unidades DESC
    `, val)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Bloque 3: alerta de stock sin movimiento (version detallada, exportable).
// Lista cada etiqueta EN_ALMACEN que lleva N+ dias sin ninguna actividad.
router.get('/stock-sin-movimiento', verificarToken, async (req, res) => {
  const parsed = parseInt(req.query.dias, 10)
  const dias = Number.isFinite(parsed) && parsed >= 0 ? parsed : DIAS_SIN_MOVIMIENTO

  try {
    const result = await pool.query(`
      SELECT e.codigo as etiqueta_codigo,
             p.nombre as producto_nombre,
             a.nombre as almacen_nombre,
             ua.fecha as ultimo_movimiento,
             (NOW()::date - ua.fecha::date) as dias_inmovil
      FROM etiquetas e
      JOIN productos p ON e.producto_id = p.id
      JOIN almacenes a ON e.almacen_id = a.id
      ${ULTIMA_ACTIVIDAD_LATERAL}
      WHERE e.estado = 'EN_ALMACEN'
        AND (NOW()::date - ua.fecha::date) >= $1
      ORDER BY dias_inmovil DESC
    `, [dias])
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
