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
             SUM(d.cantidad)::float8 as unidades
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

// Kardex tipo MALSA.xlsx: una fila por codigo (etiqueta) con su ingreso y sus
// salidas por nota. El front arma el .xls con dos hojas: INGRESOS (codigos
// NUEVO) y DEVOLUCIONES (codigos nacidos de una devolucion usada, condicion
// USADO). Solo cuenta salidas que ya salieron fisicamente (fecha_salida).
router.get('/kardex', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.codigo::text                         AS item,
             e.ubicacion                            AS ubicac,
             e.condicion                            AS condicion,
             e.estado                               AS estado_etiqueta,
             g.fecha                                AS fecha,
             g.numero_guia                          AS ni,
             g.numero_oc                            AS oc_externa,
             g.tipo_documento                       AS doc,
             COALESCE(g.guia_remision, g.factura)   AS nro_doc,
             g.proveedor                            AS proveedor,
             g.estado                               AS estado_guia,
             COALESCE(p.nombre, gi.descripcion)     AS detalle,
             a.nombre                               AS almacen,
             COALESCE(gi.destino_detalle, gi.destino) AS motivo,
             COALESCE(um.abreviatura, umgi.abreviatura) AS unid_med,
             COALESCE(e.cantidad, gi.cantidad)::float8 AS cantidad,
             COALESCE((
               SELECT json_agg(json_build_object(
                        'cant', d.cantidad::float8,
                        'guia', n.numero_nota,
                        'fecha', n.fecha_salida
                      ) ORDER BY n.fecha_salida, n.id)
               FROM notas_salida_detalle d
               JOIN notas_salida n ON n.id = d.nota_salida_id
               WHERE d.etiqueta_id = e.id AND n.fecha_salida IS NOT NULL
             ), '[]'::json)                         AS salidas
      FROM etiquetas e
      JOIN guia_items gi ON e.guia_item_id = gi.id
      JOIN guias g       ON gi.guia_id = g.id
      LEFT JOIN productos p ON e.producto_id = p.id
      JOIN almacenes a   ON e.almacen_id = a.id
      LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
      LEFT JOIN unidades_medida umgi ON gi.unidad_medida_id = umgi.id
      ORDER BY a.nombre, g.fecha, e.codigo
    `)

    const ingresos = result.rows.filter(r => r.condicion === 'NUEVO')
    const devoluciones = result.rows.filter(r => r.condicion === 'USADO')
    res.json({ ingresos, devoluciones, generado_en: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Fase 14/15: productos de un periodo. Por producto: apertura (foto del inicio),
// ingresos (guias del periodo), salidas (notas del periodo que ya salieron) y
// stock actual -> el vivo si el periodo esta ACTIVO, o la foto de CIERRE si ya
// esta CERRADO. Alimenta la tabla y el export a Excel de la pantalla Periodos.
router.get('/periodo', verificarToken, async (req, res) => {
  const { periodo_id } = req.query
  if (!periodo_id) return res.status(400).json({ error: 'periodo_id requerido' })
  try {
    const per = await pool.query('SELECT * FROM periodos WHERE id = $1', [periodo_id])
    if (per.rows.length === 0) return res.status(404).json({ error: 'Periodo no encontrado' })
    const p = per.rows[0]
    const cerrado = p.estado === 'CERRADO'

    const r = await pool.query(`
      WITH apertura AS (
        SELECT producto_id, stock_nuevo, stock_devolucion
        FROM periodos_saldos WHERE periodo_id = $1 AND tipo = 'APERTURA'
      ),
      cierre AS (
        SELECT producto_id, stock_nuevo, stock_devolucion
        FROM periodos_saldos WHERE periodo_id = $1 AND tipo = 'CIERRE'
      ),
      ingresos AS (
        SELECT gi.producto_id, SUM(gi.cantidad)::float8 AS cant
        FROM guia_items gi JOIN guias g ON gi.guia_id = g.id
        WHERE g.periodo_id = $1 AND gi.tipo = 'PRODUCTO' AND g.estado <> 'ANULADA'
        GROUP BY gi.producto_id
      ),
      salidas AS (
        SELECT e.producto_id, SUM(d.cantidad)::float8 AS cant
        FROM notas_salida_detalle d
        JOIN notas_salida n ON d.nota_salida_id = n.id
        JOIN etiquetas e ON d.etiqueta_id = e.id
        WHERE n.periodo_id = $1 AND n.fecha_salida IS NOT NULL
        GROUP BY e.producto_id
      ),
      stock_vivo AS (
        SELECT producto_id,
               COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'NUEVO'), 0)::float8 AS nuevo,
               COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'DEVOLUCION'), 0)::float8 AS devol
        FROM inventario WHERE almacen_id = $2 AND producto_id IS NOT NULL
        GROUP BY producto_id
      ),
      productos_periodo AS (
        SELECT producto_id FROM apertura
        UNION SELECT producto_id FROM cierre
        UNION SELECT producto_id FROM ingresos
        UNION SELECT producto_id FROM salidas
        UNION SELECT producto_id FROM stock_vivo
      )
      SELECT pp.producto_id, pr.nombre AS producto_nombre, um.abreviatura AS unidad,
             COALESCE(a.stock_nuevo, 0)::float8       AS apertura_nuevo,
             COALESCE(a.stock_devolucion, 0)::float8  AS apertura_devolucion,
             COALESCE(i.cant, 0)                      AS ingresos,
             COALESCE(s.cant, 0)                      AS salidas,
             (CASE WHEN $3::boolean THEN COALESCE(c.stock_nuevo, 0)      ELSE COALESCE(sv.nuevo, 0) END)::float8 AS stock_nuevo,
             (CASE WHEN $3::boolean THEN COALESCE(c.stock_devolucion, 0) ELSE COALESCE(sv.devol, 0) END)::float8 AS stock_devolucion
      FROM productos_periodo pp
      JOIN productos pr ON pr.id = pp.producto_id
      LEFT JOIN unidades_medida um ON pr.unidad_medida_id = um.id
      LEFT JOIN apertura   a  ON a.producto_id  = pp.producto_id
      LEFT JOIN cierre     c  ON c.producto_id  = pp.producto_id
      LEFT JOIN ingresos   i  ON i.producto_id  = pp.producto_id
      LEFT JOIN salidas    s  ON s.producto_id  = pp.producto_id
      LEFT JOIN stock_vivo sv ON sv.producto_id = pp.producto_id
      ORDER BY pr.nombre
    `, [periodo_id, p.almacen_id, cerrado])

    res.json({ periodo: p, cerrado, productos: r.rows, generado_en: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
