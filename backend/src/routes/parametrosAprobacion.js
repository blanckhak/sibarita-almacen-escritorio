const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')

router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM parametros_aprobacion ORDER BY id DESC LIMIT 1')
    res.json(result.rows[0] || { monto_minimo: null, activo: false })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/', verificarToken, soloRoles('admin'), async (req, res) => {
  const { monto_minimo, activo } = req.body
  try {
    const existente = await pool.query('SELECT id FROM parametros_aprobacion ORDER BY id DESC LIMIT 1')
    let result
    if (existente.rows.length > 0) {
      result = await pool.query(
        'UPDATE parametros_aprobacion SET monto_minimo = $1, activo = $2 WHERE id = $3 RETURNING *',
        [monto_minimo || null, !!activo, existente.rows[0].id]
      )
    } else {
      result = await pool.query(
        'INSERT INTO parametros_aprobacion (monto_minimo, activo) VALUES ($1, $2) RETURNING *',
        [monto_minimo || null, !!activo]
      )
    }
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
