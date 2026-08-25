const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken } = require('../middlewares/authMiddleware')
const log = require('../middlewares/logMiddleware')

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

router.post('/', verificarToken,
  log('CREAR_MOVIMIENTO', req => `Producto ${req.body.producto_id}, cantidad ${req.body.cantidad}, almacen ${req.body.almacen_origen_id} -> ${req.body.almacen_destino_id}`),
  async (req, res) => {
  const { almacen_origen_id, almacen_destino_id, producto_id, tipo, cantidad, descripcion } = req.body

  if (!producto_id) {
    return res.status(400).json({ error: 'El producto es requerido' })
  }
  if (almacen_origen_id === almacen_destino_id) {
    return res.status(400).json({ error: 'El origen y destino no pueden ser el mismo almacen' })
  }
  const cantidadNum = Number(cantidad)
  if (!cantidadNum || cantidadNum <= 0) {
    return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const stockRows = await client.query(
      `SELECT id, cantidad FROM inventario
       WHERE almacen_id = $1 AND producto_id = $2
       ORDER BY creado_en ASC
       FOR UPDATE`,
      [almacen_origen_id, producto_id]
    )

    const disponible = stockRows.rows.reduce((s, r) => s + r.cantidad, 0)
    if (disponible < cantidadNum) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Stock insuficiente en el almacen origen (disponible: ${disponible})` })
    }

    let restante = cantidadNum
    for (const row of stockRows.rows) {
      if (restante <= 0) break
      const descuento = Math.min(row.cantidad, restante)
      await client.query('UPDATE inventario SET cantidad = cantidad - $1 WHERE id = $2', [descuento, row.id])
      restante -= descuento
    }

    const tipoDestino = tipo === 'DEVOLUCION' ? 'DEVOLUCION' : 'NUEVO'
    const destinoExistente = await client.query(
      `SELECT id FROM inventario WHERE almacen_id = $1 AND producto_id = $2 AND tipo = $3 LIMIT 1`,
      [almacen_destino_id, producto_id, tipoDestino]
    )
    if (destinoExistente.rows.length > 0) {
      await client.query('UPDATE inventario SET cantidad = cantidad + $1 WHERE id = $2', [cantidadNum, destinoExistente.rows[0].id])
    } else {
      await client.query(
        `INSERT INTO inventario (almacen_id, producto_id, tipo, cantidad, descripcion) VALUES ($1,$2,$3,$4,$5)`,
        [almacen_destino_id, producto_id, tipoDestino, cantidadNum, 'Recibido por movimiento']
      )
    }

    const result = await client.query(
      `INSERT INTO movimientos (almacen_origen_id, almacen_destino_id, producto_id, tipo, cantidad, descripcion, usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [almacen_origen_id, almacen_destino_id, producto_id, tipo, cantidadNum, descripcion, req.usuario.id]
    )

    await client.query('COMMIT')
    res.status(201).json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
