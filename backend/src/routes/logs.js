const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')

router.get('/', verificarToken, soloRoles('admin', 'auditor'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100
    const result = await pool.query(
      `SELECT * FROM actividad_log ORDER BY fecha DESC LIMIT $1`,
      [limit]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
