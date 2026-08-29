const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')

const SELECT_BASE = `
  SELECT p.*, um.nombre as unidad_medida_nombre, um.abreviatura as unidad_medida_abreviatura
  FROM productos p
  LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
`

const METRICAS = ['ENTERO', 'EN_PARTIDA']

router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(`${SELECT_BASE} ORDER BY p.nombre`)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin'), async (req, res) => {
  const { nombre, categoria, unidad_medida_id, codigo_interno, metrica } = req.body
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del producto es requerido' })
  }
  if (metrica !== undefined && metrica !== null && !METRICAS.includes(metrica)) {
    return res.status(400).json({ error: 'Metrica invalida' })
  }
  try {
    const result = await pool.query(
      `INSERT INTO productos (nombre, categoria, unidad_medida_id, codigo_interno, metrica)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [nombre.trim(), categoria?.trim() || null, unidad_medida_id || null, codigo_interno?.trim() || null, metrica || 'ENTERO']
    )
    const creado = await pool.query(`${SELECT_BASE} WHERE p.id = $1`, [result.rows[0].id])
    res.status(201).json(creado.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre o codigo interno' })
    }
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', verificarToken, soloRoles('admin'), async (req, res) => {
  const { nombre, categoria, unidad_medida_id, codigo_interno, metrica } = req.body
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del producto es requerido' })
  }
  if (metrica !== undefined && metrica !== null && !METRICAS.includes(metrica)) {
    return res.status(400).json({ error: 'Metrica invalida' })
  }
  try {
    const result = await pool.query(
      `UPDATE productos SET nombre=$1, categoria=$2, unidad_medida_id=$3, codigo_interno=$4, metrica=$5
       WHERE id=$6 RETURNING id`,
      [nombre.trim(), categoria?.trim() || null, unidad_medida_id || null, codigo_interno?.trim() || null, metrica || 'ENTERO', req.params.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' })
    }
    const actualizado = await pool.query(`${SELECT_BASE} WHERE p.id = $1`, [req.params.id])
    res.json(actualizado.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre o codigo interno' })
    }
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
