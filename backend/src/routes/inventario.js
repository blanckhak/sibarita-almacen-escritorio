const express = require('express')
const router = express.Router()
const pool = require('../config/db')

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, a.nombre as almacen_nombre, p.nombre as producto_nombre
      FROM inventario i
      JOIN almacenes a ON i.almacen_id = a.id
      LEFT JOIN productos p ON i.producto_id = p.id
      ORDER BY a.nombre
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/resumen', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.nombre as almacen,
        SUM(CASE WHEN i.tipo = 'NUEVO' THEN i.cantidad ELSE 0 END) as nuevos,
        SUM(CASE WHEN i.tipo = 'DEVOLUCION' THEN i.cantidad ELSE 0 END) as devoluciones,
        SUM(i.cantidad) as total
      FROM inventario i
      JOIN almacenes a ON i.almacen_id = a.id
      GROUP BY a.nombre
      ORDER BY a.nombre
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Productos con stock disponible en un almacen (usado por el selector de origen en Movimientos)
router.get('/disponible', async (req, res) => {
  const { almacen_id } = req.query
  if (!almacen_id) {
    return res.status(400).json({ error: 'almacen_id es requerido' })
  }
  try {
    const result = await pool.query(`
      SELECT p.id as producto_id, p.nombre as producto_nombre, SUM(i.cantidad) as cantidad
      FROM inventario i
      JOIN productos p ON i.producto_id = p.id
      WHERE i.almacen_id = $1
      GROUP BY p.id, p.nombre
      HAVING SUM(i.cantidad) > 0
      ORDER BY p.nombre
    `, [almacen_id])
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  const { almacen_id, producto_id, tipo, cantidad, descripcion } = req.body
  if (!producto_id) {
    return res.status(400).json({ error: 'El producto es requerido' })
  }
  try {
    const result = await pool.query(
      'INSERT INTO inventario (almacen_id, producto_id, tipo, cantidad, descripcion) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [almacen_id, producto_id, tipo, cantidad, descripcion]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
