const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { validarLargos } = require('../utils/texto')

const largosAlmacen = (b) => validarLargos({ 'nombre': [b.nombre, 100], 'ubicacion': [b.ubicacion, 200] })

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM almacenes ORDER BY nombre')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  const { nombre, ubicacion } = req.body
  const errLargo = largosAlmacen(req.body)
  if (errLargo) return res.status(400).json({ error: errLargo })
  try {
    const result = await pool.query(
      'INSERT INTO almacenes (nombre, ubicacion) VALUES ($1, $2) RETURNING *',
      [nombre, ubicacion]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  const { nombre, ubicacion } = req.body
  const errLargo = largosAlmacen(req.body)
  if (errLargo) return res.status(400).json({ error: errLargo })
  try {
    const result = await pool.query(
      'UPDATE almacenes SET nombre=$1, ubicacion=$2 WHERE id=$3 RETURNING *',
      [nombre, ubicacion, req.params.id]
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
