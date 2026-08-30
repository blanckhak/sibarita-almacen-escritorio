const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken } = require('../middlewares/authMiddleware')

// Panel de la Fase 2: guias ingresadas, codigos generados, notas pendientes y productos que mas rotan (seccion 14 punto 6)
router.get('/fase2', verificarToken, async (req, res) => {
  try {
    const [guias, codigos, notasPendientes, topProductos] = await Promise.all([
      pool.query('SELECT COUNT(*)::int as total FROM guias'),
      pool.query('SELECT COUNT(*)::int as total FROM etiquetas'),
      pool.query(`SELECT COUNT(*)::int as total FROM notas_salida WHERE estado IN ('PENDIENTE', 'EN_APROBACION')`),
      pool.query(`
        SELECT p.nombre as producto_nombre, SUM(gi.cantidad)::int as total_movido
        FROM guia_items gi
        JOIN productos p ON gi.producto_id = p.id
        WHERE gi.tipo = 'PRODUCTO'
        GROUP BY p.nombre
        ORDER BY total_movido DESC
        LIMIT 5
      `),
    ])

    res.json({
      guias_ingresadas: guias.rows[0].total,
      codigos_generados: codigos.rows[0].total,
      notas_pendientes: notasPendientes.rows[0].total,
      top_productos: topProductos.rows,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
