const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const log = require('../middlewares/logMiddleware')
const { ajustarInventario } = require('../utils/inventario')
const { esCantidadPositiva, aMilesimas, unidadPermiteDecimal } = require('../utils/cantidad')
const { mensajeConcurrencia } = require('../utils/dbErrores')

const TIPOS = ['TRASLADO', 'ENTRADA', 'SALIDA', 'DEVOLUCION']

router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        m.id, m.tipo, m.cantidad, m.descripcion, m.fecha,
        o.nombre as origen,
        d.nombre as destino,
        p.nombre as producto_nombre
      FROM movimientos m
      LEFT JOIN almacenes o ON m.almacen_origen_id = o.id
      LEFT JOIN almacenes d ON m.almacen_destino_id = d.id
      LEFT JOIN productos p ON m.producto_id = p.id
      ORDER BY m.fecha DESC
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin', 'almacen', 'almacenero3'),
  log('CREAR_MOVIMIENTO', req => `Producto ${req.body.producto_id}, cantidad ${req.body.cantidad}, almacen ${req.body.almacen_origen_id} -> ${req.body.almacen_destino_id}`),
  async (req, res) => {
  const { almacen_origen_id, almacen_destino_id, producto_id, tipo, cantidad, descripcion } = req.body

  if (!producto_id) {
    return res.status(400).json({ error: 'El producto es requerido' })
  }
  if (!almacen_origen_id || !almacen_destino_id) {
    return res.status(400).json({ error: 'El almacen de origen y el de destino son requeridos' })
  }
  if (Number(almacen_origen_id) === Number(almacen_destino_id)) {
    return res.status(400).json({ error: 'El origen y destino no pueden ser el mismo almacen' })
  }
  if (!TIPOS.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de movimiento invalido' })
  }
  if (!esCantidadPositiva(cantidad)) {
    return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 (hasta 3 decimales)' })
  }
  // Todo el calculo de stock va en milesimas enteras: pg devuelve NUMERIC como
  // string ("5.000") y antes se sumaba con + -> "05.0003.000", el chequeo
  // "disponible < cantidad" nunca se cumplia con 2 filas (NUEVO + DEVOLUCION)
  // y el traslado sumaba en destino la cantidad PEDIDA aunque en origen no
  // hubiera tanto (stock creado de la nada).
  const pedido = aMilesimas(cantidad)
  const cantidadNum = pedido / 1000

  const client = await pool.connect()
  try {
    if (!Number.isInteger(cantidadNum) && !(await unidadPermiteDecimal(client, producto_id))) {
      return res.status(400).json({ error: 'La unidad de este producto no admite decimales' })
    }

    await client.query('BEGIN')

    const stockRows = await client.query(
      `SELECT id, cantidad FROM inventario
       WHERE almacen_id = $1 AND producto_id = $2
       ORDER BY creado_en ASC
       FOR UPDATE`,
      [almacen_origen_id, producto_id]
    )

    const disponible = stockRows.rows.reduce((s, r) => s + aMilesimas(r.cantidad), 0)
    if (disponible < pedido) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Stock insuficiente en el almacen origen (disponible: ${disponible / 1000})` })
    }

    let restante = pedido
    for (const row of stockRows.rows) {
      if (restante <= 0) break
      const descuento = Math.min(aMilesimas(row.cantidad), restante)
      if (descuento <= 0) continue
      await client.query('UPDATE inventario SET cantidad = cantidad - $1 WHERE id = $2', [descuento / 1000, row.id])
      restante -= descuento
    }

    // Destino con el mismo upsert atomico que guias/notas de salida (antes era
    // SELECT + INSERT/UPDATE, la misma carrera que corrigio 3cbc1ad).
    await ajustarInventario(client, {
      almacenId: almacen_destino_id,
      productoId: producto_id,
      delta: cantidadNum,
      descripcion: 'Recibido por movimiento',
      tipo: tipo === 'DEVOLUCION' ? 'DEVOLUCION' : 'NUEVO',
    })

    const result = await client.query(
      `INSERT INTO movimientos (almacen_origen_id, almacen_destino_id, producto_id, tipo, cantidad, descripcion, usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [almacen_origen_id, almacen_destino_id, producto_id, tipo, cantidadNum, descripcion, req.usuario.id]
    )

    await client.query('COMMIT')
    res.status(201).json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === '23503') {
      return res.status(400).json({ error: 'El almacen o el producto no existe' })
    }
    const msg = mensajeConcurrencia(err)
    if (msg) return res.status(409).json({ error: msg })
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
