const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const log = require('../middlewares/logMiddleware')
const { ajustarInventario } = require('../utils/inventario')
const { esCantidadPositiva, unidadPermiteDecimal } = require('../utils/cantidad')
const { mensajeConcurrencia } = require('../utils/dbErrores')

const TIPOS = ['NUEVO', 'DEVOLUCION']

router.get('/', verificarToken, async (req, res) => {
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

router.get('/resumen', verificarToken, async (req, res) => {
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
router.get('/disponible', verificarToken, async (req, res) => {
  const { almacen_id } = req.query
  if (!almacen_id) {
    return res.status(400).json({ error: 'almacen_id es requerido' })
  }
  try {
    const result = await pool.query(`
      SELECT p.id as producto_id, p.nombre as producto_nombre, SUM(i.cantidad) as cantidad,
             COALESCE(um.permite_decimal, false) as permite_decimal
      FROM inventario i
      JOIN productos p ON i.producto_id = p.id
      LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
      WHERE i.almacen_id = $1
      GROUP BY p.id, p.nombre, um.permite_decimal
      HAVING SUM(i.cantidad) > 0
      ORDER BY p.nombre
    `, [almacen_id])
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Ajuste manual de inventario: en el frontend (Inventario.jsx, puedeAgregar)
// solo admin/almacen/almacenero3 ven el formulario, pero el backend no tenia
// NINGUNA verificacion -- ni siquiera login. Cualquiera con acceso a la API
// podia insertar stock arbitrario en cualquier almacen. Encontrado al
// revisar todo el codigo buscando rutas de escritura sin verificarToken.
router.post('/', verificarToken, soloRoles('admin', 'almacen', 'almacenero3'),
  log('AJUSTE_MANUAL_INVENTARIO', req => `Almacen ${req.body.almacen_id}, producto ${req.body.producto_id}, tipo ${req.body.tipo}, cantidad ${req.body.cantidad}`),
  async (req, res) => {
  const { almacen_id, producto_id, tipo = 'NUEVO', cantidad, descripcion } = req.body
  if (!almacen_id) {
    return res.status(400).json({ error: 'El almacen es requerido' })
  }
  if (!producto_id) {
    return res.status(400).json({ error: 'El producto es requerido' })
  }
  if (!TIPOS.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo invalido (NUEVO o DEVOLUCION)' })
  }
  if (!esCantidadPositiva(cantidad)) {
    return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 (hasta 3 decimales)' })
  }
  try {
    if (!Number.isInteger(Number(cantidad)) && !(await unidadPermiteDecimal(pool, producto_id))) {
      return res.status(400).json({ error: 'La unidad de este producto no admite decimales' })
    }
    // Antes era un INSERT directo: desde el UNIQUE (almacen, producto, tipo)
    // del fix de concurrencia 3cbc1ad, un segundo ajuste sobre un producto que
    // ya tenia stock fallaba con "llave duplicada". El ajuste manual SUMA al
    // stock existente con el mismo upsert que usan guias y notas de salida.
    await ajustarInventario(null, {
      almacenId: almacen_id, productoId: producto_id, delta: Number(cantidad), descripcion, tipo,
    })
    const result = await pool.query(
      'SELECT * FROM inventario WHERE almacen_id = $1 AND producto_id = $2 AND tipo = $3',
      [almacen_id, producto_id, tipo]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'El almacen o el producto no existe' })
    }
    const msg = mensajeConcurrencia(err)
    if (msg) return res.status(409).json({ error: msg })
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
