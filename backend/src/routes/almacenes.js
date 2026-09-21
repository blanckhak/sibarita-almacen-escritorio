const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { validarLargos } = require('../utils/texto')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const log = require('../middlewares/logMiddleware')

const largosAlmacen = (b) => validarLargos({ 'nombre': [b.nombre, 100], 'ubicacion': [b.ubicacion, 200] })

router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM almacenes ORDER BY nombre')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Crear/editar almacenes es admin-only en el frontend (Almacenes.jsx, esAdmin)
// pero no tenia NINGUNA verificacion en el backend -- ni siquiera login. Se
// cierra aca: encontrado al revisar todo el codigo buscando rutas de
// escritura sin verificarToken.
router.post('/', verificarToken, soloRoles('admin'),
  log('CREAR_ALMACEN', req => `${req.body.nombre}`),
  async (req, res) => {
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

router.put('/:id', verificarToken, soloRoles('admin'),
  log('EDITAR_ALMACEN', req => `Almacen id ${req.params.id}: ${req.body.nombre}`),
  async (req, res) => {
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
