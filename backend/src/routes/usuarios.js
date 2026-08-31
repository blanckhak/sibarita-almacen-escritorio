const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const bcrypt = require('bcryptjs')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { validarLargos } = require('../utils/texto')
const log = require('../middlewares/logMiddleware')

router.get('/roles', verificarToken, soloRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre FROM roles ORDER BY id')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', verificarToken, soloRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.activo, u.creado_en,
              r.nombre as rol, a.nombre as almacen
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       LEFT JOIN almacenes a ON u.almacen_id = a.id
       ORDER BY u.nombre`
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin'),
  log('CREAR_USUARIO', req => `Usuario ${req.body.nombre} (${req.body.email}), rol ${req.body.rol_id}`),
  async (req, res) => {
  const { nombre, email, password, rol_id, almacen_id } = req.body
  const errLargo = validarLargos({ 'nombre': [nombre, 100], 'email': [email, 100] })
  if (errLargo) return res.status(400).json({ error: errLargo })
  try {
    const hash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password, rol_id, almacen_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, email`,
      [nombre, email, hash, rol_id, almacen_id || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id/estado', verificarToken, soloRoles('admin'),
  log('CAMBIAR_ESTADO_USUARIO', req => `Usuario id ${req.params.id}, activo=${req.body.activo}`),
  async (req, res) => {
  const { activo } = req.body
  try {
    await pool.query('UPDATE usuarios SET activo = $1 WHERE id = $2', [activo, req.params.id])
    res.json({ mensaje: 'Estado actualizado' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
