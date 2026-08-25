const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken } = require('../middlewares/authMiddleware')

const UMBRAL_BAJO = 500
// Plazo de devolucion: 1 a 2 semanas HABILES (lunes a viernes, sin contar
// sabados/domingos). Se usa el limite superior (10 dias habiles = 2 semanas)
// como el punto en que se marca vencida.
const DIAS_HABILES_LIMITE_DEVOLUCION = parseInt(process.env.DIAS_HABILES_LIMITE_DEVOLUCION) || 10

router.get('/', verificarToken, async (req, res) => {
  try {
    const stockResult = await pool.query(`
      SELECT
        a.nombre as almacen,
        i.tipo,
        SUM(i.cantidad) as total
      FROM inventario i
      JOIN almacenes a ON i.almacen_id = a.id
      GROUP BY a.nombre, i.tipo
      HAVING SUM(i.cantidad) < $1
      ORDER BY total ASC
    `, [UMBRAL_BAJO])

    const alertasStock = stockResult.rows.map(r => ({
      categoria: 'STOCK_BAJO',
      almacen:  r.almacen,
      tipo:     r.tipo,
      total:    Number(r.total),
      mensaje:  `${r.almacen} tiene solo ${r.total} items de tipo ${r.tipo}`,
      nivel:    r.total < 200 ? 'critico' : 'advertencia',
    }))

    // Alertas de devolucion vencida, reutilizando esta misma tabla/endpoint sin cambios estructurales en "alertas" (seccion 13 y 14 punto 1).
    // Se cuenta desde fecha_salida (cuando el producto realmente salio del almacen), no desde la creacion de la nota,
    // para no marcar como vencida una nota que recien salio de "En aprobacion" (CU-05).
    // El plazo se cuenta en DIAS HABILES (lunes a viernes, ISODOW 1-5), no dias calendario.
    const devolucionResult = await pool.query(`
      SELECT numero_nota, persona_responsable,
             (SELECT COUNT(*) FROM generate_series(fecha_salida::date, NOW()::date, '1 day') d
              WHERE EXTRACT(ISODOW FROM d) < 6) - 1 as dias_habiles_pendiente
      FROM notas_salida
      WHERE estado = 'PENDIENTE'
        AND (SELECT COUNT(*) FROM generate_series(fecha_salida::date, NOW()::date, '1 day') d
             WHERE EXTRACT(ISODOW FROM d) < 6) - 1 > $1
      ORDER BY fecha_salida ASC
    `, [DIAS_HABILES_LIMITE_DEVOLUCION])

    const alertasDevolucion = devolucionResult.rows.map(r => ({
      categoria: 'DEVOLUCION_VENCIDA',
      numero_nota: r.numero_nota,
      persona_responsable: r.persona_responsable,
      dias_habiles_pendiente: r.dias_habiles_pendiente,
      mensaje: `Nota ${r.numero_nota} (${r.persona_responsable}) lleva ${r.dias_habiles_pendiente} dias habiles pendiente de devolucion`,
      nivel: r.dias_habiles_pendiente >= DIAS_HABILES_LIMITE_DEVOLUCION * 2 ? 'critico' : 'advertencia',
    }))

    res.json({
      alertas: [...alertasStock, ...alertasDevolucion],
      umbral: UMBRAL_BAJO,
      dias_habiles_limite_devolucion: DIAS_HABILES_LIMITE_DEVOLUCION,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
