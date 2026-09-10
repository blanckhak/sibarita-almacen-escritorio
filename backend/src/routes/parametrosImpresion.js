const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { validarLargos } = require('../utils/texto')
const log = require('../middlewares/logMiddleware')

// Fase 13 (R1): parametros de que mostrar en cada documento impreso. Cualquier
// usuario autenticado los LEE (las pantallas de impresion los necesitan);
// solo admin los EDITA desde /configuracion.

const DOCUMENTOS = ['INGRESO', 'SALIDA', 'DEVOLUCION']
const BOOLEANOS = ['mostrar_precio', 'mostrar_ubicacion', 'mostrar_motivo', 'mostrar_observaciones', 'mostrar_partidas']

router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM parametros_impresion ORDER BY documento')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:documento', verificarToken, soloRoles('admin'),
  log('EDITAR_PARAMETROS_IMPRESION', req => `Documento ${req.params.documento}`),
  async (req, res) => {
  const documento = String(req.params.documento || '').toUpperCase()
  if (!DOCUMENTOS.includes(documento)) {
    return res.status(400).json({ error: 'Documento invalido (INGRESO / SALIDA / DEVOLUCION)' })
  }

  const cambios = []
  const valores = []
  const push = (campo, valor) => { valores.push(valor); cambios.push(`${campo} = $${valores.length}`) }

  for (const campo of BOOLEANOS) {
    if (req.body[campo] !== undefined) push(campo, !!req.body[campo])
  }
  if (req.body.lineas_por_pagina !== undefined) {
    const n = Number(req.body.lineas_por_pagina)
    if (!Number.isInteger(n) || n < 4 || n > 12) {
      return res.status(400).json({ error: 'Las lineas por pagina deben ser un entero entre 4 y 12' })
    }
    push('lineas_por_pagina', n)
  }
  if (req.body.pie_texto !== undefined) {
    const errLargo = validarLargos({ 'pie de pagina': [req.body.pie_texto, 300] })
    if (errLargo) return res.status(400).json({ error: errLargo })
    push('pie_texto', (req.body.pie_texto || '').trim() || null)
  }

  if (cambios.length === 0) {
    return res.status(400).json({ error: 'No se envio ningun campo para editar' })
  }

  try {
    valores.push(documento)
    const result = await pool.query(
      `UPDATE parametros_impresion SET ${cambios.join(', ')} WHERE documento = $${valores.length} RETURNING *`,
      valores
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No hay parametros para ese documento' })
    }
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
