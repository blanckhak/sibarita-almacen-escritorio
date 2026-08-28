const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken } = require('../middlewares/authMiddleware')

const UMBRAL_BAJO = 500
// Plazo de devolucion: 1 a 2 semanas HABILES (lunes a viernes, sin contar
// sabados/domingos). Se usa el limite superior (10 dias habiles = 2 semanas)
// como el punto en que se marca vencida.
const DIAS_HABILES_LIMITE_DEVOLUCION = parseInt(process.env.DIAS_HABILES_LIMITE_DEVOLUCION) || 10
// Dias sin ningun movimiento tras los cuales una etiqueta EN_ALMACEN se
// considera "sin movimiento" (Bloque 3). Mismo default que reportes.js.
const DIAS_SIN_MOVIMIENTO = parseInt(process.env.DIAS_SIN_MOVIMIENTO) || 10

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

    // Alerta de stock sin movimiento (Bloque 3): etiquetas EN_ALMACEN que llevan
    // 10+ dias sin ninguna actividad. Se agrupa por producto+almacen para no
    // llenar el panel con una fila por cada codigo. La "ultima actividad" es lo
    // mas reciente entre la generacion de la etiqueta y su ultimo evento de
    // bitacora (SALIO, DEVOLVIO, TRANSFERIDA, IMPRESA, REIMPRESA...).
    const sinMovimientoResult = await pool.query(`
      SELECT p.nombre as producto, a.nombre as almacen,
             COUNT(*)::int as codigos,
             MAX(NOW()::date - ua.fecha::date) as dias_max
      FROM etiquetas e
      JOIN productos p ON e.producto_id = p.id
      JOIN almacenes a ON e.almacen_id = a.id
      JOIN LATERAL (
        SELECT GREATEST(
          e.fecha_generacion,
          COALESCE((SELECT MAX(h.fecha) FROM etiqueta_historial h WHERE h.etiqueta_id = e.id), e.fecha_generacion)
        ) as fecha
      ) ua ON true
      WHERE e.estado = 'EN_ALMACEN'
        AND (NOW()::date - ua.fecha::date) >= $1
      GROUP BY p.nombre, a.nombre
      ORDER BY dias_max DESC
    `, [DIAS_SIN_MOVIMIENTO])

    const alertasSinMovimiento = sinMovimientoResult.rows.map(r => ({
      categoria: 'STOCK_SIN_MOVIMIENTO',
      producto: r.producto,
      almacen: r.almacen,
      codigos: r.codigos,
      dias_max: Number(r.dias_max),
      mensaje: `${r.producto} en ${r.almacen}: ${r.codigos} codigo(s) llevan ${r.dias_max}+ dias sin movimiento`,
      nivel: Number(r.dias_max) >= DIAS_SIN_MOVIMIENTO * 3 ? 'critico' : 'advertencia',
    }))

    res.json({
      alertas: [...alertasStock, ...alertasDevolucion, ...alertasSinMovimiento],
      umbral: UMBRAL_BAJO,
      dias_habiles_limite_devolucion: DIAS_HABILES_LIMITE_DEVOLUCION,
      dias_sin_movimiento: DIAS_SIN_MOVIMIENTO,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
