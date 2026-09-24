const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { ajustarInventario } = require('../utils/inventario')
const { validarLargos } = require('../utils/texto')
const { periodoCerrado } = require('../utils/periodo')
const { lineasAfuera } = require('../utils/salida')
const log = require('../middlewares/logMiddleware')
const { perfilSql } = require('../utils/perfil')

const ERR_PERIODO_CERRADO = 'El periodo de este codigo esta CERRADO; pedile a un admin que lo reabra para poder transferirlo.'

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
      SELECT e.id, e.codigo, e.estado, e.condicion, e.almacen_id, e.producto_id,
             e.ubicacion,
             COALESCE(p.nombre, gi.descripcion) as producto_nombre, a.nombre as almacen_nombre,
             COALESCE(e.cantidad, gi.cantidad)::float8 as cantidad, g.numero_guia,
             gi.tipo as guia_item_tipo, gi.servicio_modo,
             COALESCE(um.nombre, umgi.nombre) as unidad_medida_nombre,
             COALESCE(um.abreviatura, umgi.abreviatura) as unidad_medida_abreviatura,
             COALESCE(um.permite_decimal, umgi.permite_decimal, false) as permite_decimal,
             -- Stock del producto en ese almacen (Fase 9, Bloque 7): total
             -- agregado (tabla inventario, NUEVO + DEVOLUCION) y conteo de
             -- codigos individuales que siguen EN_ALMACEN. Se calcula una vez
             -- por par (almacen, producto) via LEFT JOIN a subconsultas
             -- agrupadas, no una subconsulta por fila.
             COALESCE(inv.total, 0)::float8 as stock_agregado,
             COALESCE(disp.n, 0)::int as codigos_disponibles
      FROM etiquetas e
      LEFT JOIN productos p ON e.producto_id = p.id
      JOIN almacenes a ON e.almacen_id = a.id
      JOIN guia_items gi ON e.guia_item_id = gi.id
      JOIN guias g ON gi.guia_id = g.id
      LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
      LEFT JOIN unidades_medida umgi ON gi.unidad_medida_id = umgi.id
      LEFT JOIN (
        SELECT almacen_id, producto_id, SUM(cantidad) as total
        FROM inventario GROUP BY almacen_id, producto_id
      ) inv ON inv.almacen_id = e.almacen_id AND inv.producto_id = e.producto_id
      LEFT JOIN (
        SELECT almacen_id, producto_id, COUNT(*) as n
        FROM etiquetas WHERE estado = 'EN_ALMACEN'
        GROUP BY almacen_id, producto_id
      ) disp ON disp.almacen_id = e.almacen_id AND disp.producto_id = e.producto_id
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
             a.nombre as almacen_nombre, ${perfilSql('u', 'ru')} as usuario_nombre
      FROM etiqueta_historial h
      JOIN etiquetas e ON h.etiqueta_id = e.id
      JOIN productos p ON e.producto_id = p.id
      JOIN almacenes a ON e.almacen_id = a.id
      LEFT JOIN usuarios u ON h.usuario_id = u.id
      LEFT JOIN roles ru ON ru.id = u.rol_id
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
      SELECT e.*, COALESCE(p.nombre, gi.descripcion) as producto_nombre,
             gi.tipo as guia_item_tipo, gi.servicio_modo,
             COALESCE(um.nombre, umgi.nombre) as unidad_medida_nombre,
             COALESCE(um.abreviatura, umgi.abreviatura) as unidad_medida_abreviatura,
             a.nombre as almacen_nombre, gi.cantidad::float8 as gi_cantidad, g.numero_guia,
             e.cantidad::float8 as cantidad
      FROM etiquetas e
      LEFT JOIN productos p ON e.producto_id = p.id
      LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
      LEFT JOIN unidades_medida umgi ON gi.unidad_medida_id = umgi.id
      JOIN almacenes a ON e.almacen_id = a.id
      JOIN guia_items gi ON e.guia_item_id = gi.id
      JOIN guias g ON gi.guia_id = g.id
      WHERE e.id = $1
    `, [req.params.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada' })
    }
    const row = result.rows[0]
    // Cantidad efectiva: override propio del codigo (USADO parcial) o la del guia_item.
    res.json({ ...row, cantidad: row.cantidad != null ? row.cantidad : row.gi_cantidad })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Ubicacion fisica del codigo dentro del almacen (estante/rack/pasillo). Se
// completa despues del ingreso; texto libre; vaciarla la deja en NULL.
router.put('/:id/ubicacion', verificarToken, soloRoles('admin', 'almacen', 'almacenero'),
  log('EDITAR_UBICACION', req => `Codigo id ${req.params.id} -> "${(req.body.ubicacion || '').trim()}"`),
  async (req, res) => {
  const errLargo = validarLargos({ 'ubicacion': [req.body.ubicacion, 100] })
  if (errLargo) return res.status(400).json({ error: errLargo })
  try {
    const ubic = (req.body.ubicacion || '').trim() || null
    const result = await pool.query(
      'UPDATE etiquetas SET ubicacion = $1 WHERE id = $2 RETURNING id, ubicacion',
      [ubic, req.params.id]
    )
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
router.post('/:id/imprimir', verificarToken, soloRoles('admin', 'almacen', 'almacenero'), async (req, res) => {
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
      SELECT h.*, ${perfilSql('u', 'ru')} as usuario_nombre,
             ao.nombre as almacen_origen_nombre, ad.nombre as almacen_destino_nombre
      FROM etiqueta_historial h
      LEFT JOIN usuarios u ON h.usuario_id = u.id
      LEFT JOIN roles ru ON ru.id = u.rol_id
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
router.post('/:id/transferir', verificarToken, soloRoles('admin', 'almacen', 'almacenero'),
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
      SELECT e.*, gi.cantidad::float8 as gi_cantidad, e.cantidad::float8 as cantidad
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
    // Mismo candado que guias/notas de salida/notas de desuso (Fase 15):
    // transferir mueve stock de verdad (ajustarInventario en origen y
    // destino), asi que no puede quedar afuera del bloqueo de periodo
    // cerrado. Encontrado al revisar todo el codigo buscando el mismo check
    // en los demas endpoints que tocan inventario.
    if (await periodoCerrado(client, etiqueta.periodo_id)) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: ERR_PERIODO_CERRADO })
    }
    // Cantidad efectiva del codigo: su override propio (codigos USADO de una
    // devolucion parcial) o la del guia_item.
    const cantidad = etiqueta.cantidad != null ? etiqueta.cantidad : etiqueta.gi_cantidad
    // Un codigo USADO tiene su stock en el bucket DEVOLUCION.
    const bucket = etiqueta.condicion === 'USADO' ? 'DEVOLUCION' : 'NUEVO'

    if (etiqueta.estado !== 'EN_ALMACEN') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Solo se pueden transferir codigos que esten en almacen' })
    }
    // Salida parcial (24/09): si parte de este codigo sigue afuera en una nota
    // de salida, su devolucion volveria al almacen de origen. Se transfiere
    // cuando todo haya vuelto.
    if ((await lineasAfuera(client, etiqueta.id)) > 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Parte de este codigo esta afuera en una nota de salida pendiente de devolucion; transferilo cuando vuelva' })
    }
    if (Number(almacen_destino_id) === etiqueta.almacen_id) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El almacen destino debe ser distinto al actual' })
    }

    const origenId = etiqueta.almacen_id

    await ajustarInventario(client, {
      almacenId: origenId,
      productoId: etiqueta.producto_id,
      delta: -cantidad,
      tipo: bucket,
    })
    await ajustarInventario(client, {
      almacenId: almacen_destino_id,
      productoId: etiqueta.producto_id,
      delta: cantidad,
      descripcion: 'Transferencia de codigo entre almacenes',
      tipo: bucket,
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
