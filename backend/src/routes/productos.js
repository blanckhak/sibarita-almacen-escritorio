const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { validarLargos } = require('../utils/texto')

const largosProducto = (b) => validarLargos({
  'nombre': [b.nombre, 150],
  'categoria': [b.categoria, 100],
  'codigo interno': [b.codigo_interno, 50],
})

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

// "Posibles duplicados" (complemento al Bloque 3 "stock consolidado"):
// producto_canon (setup.js) solo normaliza tildes/espacios/simbolos, no
// separa por palabra -- no agarra variantes de singular/plural ("CERDA" vs
// "CERDAS") ni palabras en otro orden ("BOLSAS EN ROLLO X 250 GR." vs
// "BOLSAS X 250 GR. EN ROLLO"). Esto es SOLO UN REPORTE de lectura: no
// fusiona ni cambia nada en la base. El admin decide a mano si renombrar dos
// productos para que caigan bajo el mismo producto_canon real.
// IMPORTANTE: definida antes de "/:id" en otras rutas de este archivo no
// aplica porque este router no tiene GET "/:id" -- si algun dia se agrega
// uno, esta ruta debe seguir yendo ANTES para que "posibles-duplicados" no
// se interprete como un id.
function quitarTildes(s) {
  return s
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
}

// Singulariza una palabra de forma naive: solo saca una "s" final si tiene
// 5+ letras, para no tocar palabras cortas donde la "s" no es plural (mas,
// gas, atras, dos, tres, seis...) ni codigos numericos.
function singularizar(palabra) {
  if (palabra.length >= 5 && palabra.endsWith('s') && !/^[0-9]+$/.test(palabra)) {
    return palabra.slice(0, -1)
  }
  return palabra
}

function claveAgresiva(nombre) {
  const limpio = quitarTildes((nombre || '').toLowerCase())
  return limpio
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularizar)
    .sort()
    .join('|')
}

router.get('/posibles-duplicados', verificarToken, soloRoles('admin'), async (req, res) => {
  try {
    const productos = await pool.query('SELECT id, nombre FROM productos ORDER BY id')
    const stock = await pool.query(`SELECT producto_id, SUM(cantidad) AS total FROM inventario GROUP BY producto_id`)
    const stockPorProducto = {}
    for (const r of stock.rows) stockPorProducto[r.producto_id] = Number(r.total)

    const grupos = {}
    for (const p of productos.rows) {
      const clave = claveAgresiva(p.nombre)
      if (!clave) continue
      if (!grupos[clave]) grupos[clave] = []
      grupos[clave].push({ id: p.id, nombre: p.nombre, stock_total: stockPorProducto[p.id] || 0 })
    }

    const candidatos = Object.values(grupos).filter(g => g.length > 1)
    res.json(candidatos)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin'), async (req, res) => {
  const { nombre, categoria, unidad_medida_id, codigo_interno, metrica } = req.body
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del producto es requerido' })
  }
  const errLargo = largosProducto(req.body)
  if (errLargo) return res.status(400).json({ error: errLargo })
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
  const errLargo = largosProducto(req.body)
  if (errLargo) return res.status(400).json({ error: errLargo })
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
