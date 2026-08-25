const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')

router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM unidades_medida ORDER BY nombre')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin'), async (req, res) => {
  const { nombre, abreviatura } = req.body
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre de la unidad de medida es requerido' })
  }
  try {
    const result = await pool.query(
      'INSERT INTO unidades_medida (nombre, abreviatura) VALUES ($1, $2) RETURNING *',
      [nombre.trim(), abreviatura?.trim() || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una unidad de medida con ese nombre' })
    }
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
