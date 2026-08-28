const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { ajustarInventario } = require('../utils/inventario')
const log = require('../middlewares/logMiddleware')

const DESTINOS = ['ALMACEN', 'OFICINA', 'LABORATORIO', 'OTRO']

// Consulta por almacen, producto o guia, de forma independiente o combinada (seccion 5.6, CU-04)
router.get('/consulta/productos', verificarToken, async (req, res) => {
  const { almacen_id, producto_id, numero_guia } = req.query
  const condiciones = []
  const valores = []

  if (almacen_id) {
    valores.push(almacen_id)
    condiciones.push(`g.almacen_id = $${valores.length}`)
  }
  if (producto_id) {
    valores.push(producto_id)
    condiciones.push(`gi.producto_id = $${valores.length}`)
  }
  if (numero_guia) {
    valores.push(`%${numero_guia}%`)
    condiciones.push(`g.numero_guia ILIKE $${valores.length}`)
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : ''

  try {
    const result = await pool.query(`
      SELECT g.numero_guia, g.fecha, a.nombre as almacen_nombre,
             gi.id as guia_item_id, p.nombre as producto_nombre, p.categoria,
             gi.cantidad, gi.destino,
             e.id as etiqueta_id, e.codigo as etiqueta_codigo, e.estado as etiqueta_estado,
             e.condicion as etiqueta_condicion
      FROM guia_items gi
      JOIN guias g ON gi.guia_id = g.id
      JOIN almacenes a ON g.almacen_id = a.id
      JOIN productos p ON gi.producto_id = p.id
      -- Una devolucion "usada" deja el codigo viejo como REEMPLAZADA y crea uno
      -- nuevo para el mismo guia_item; se muestra el vigente, no el retirado.
      LEFT JOIN etiquetas e ON e.guia_item_id = gi.id AND e.estado <> 'REEMPLAZADA'
      ${where}
      ORDER BY g.fecha DESC, gi.id DESC
      LIMIT 300
    `, valores)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.id, g.numero_guia, g.fecha, g.creado_en,
             g.proveedor, g.numero_oc, g.direccion, g.estado,
             a.nombre as almacen_nombre, u.nombre as usuario_nombre,
             COUNT(gi.id)::int as total_items,
             COUNT(e.id)::int as total_etiquetas
      FROM guias g
      JOIN almacenes a ON g.almacen_id = a.id
      LEFT JOIN usuarios u ON g.usuario_id = u.id
      LEFT JOIN guia_items gi ON gi.guia_id = g.id
      LEFT JOIN etiquetas e ON e.guia_item_id = gi.id
      GROUP BY g.id, a.nombre, u.nombre
      ORDER BY g.creado_en DESC
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const guia = await pool.query(`
      SELECT g.*, a.nombre as almacen_nombre, u.nombre as usuario_nombre
      FROM guias g
      JOIN almacenes a ON g.almacen_id = a.id
      LEFT JOIN usuarios u ON g.usuario_id = u.id
      WHERE g.id = $1
    `, [req.params.id])
    if (guia.rows.length === 0) {
      return res.status(404).json({ error: 'Guia no encontrada' })
    }

    const items = await pool.query(`
      SELECT gi.id, gi.producto_id, gi.cantidad, gi.destino, gi.destino_detalle, gi.recogido,
             p.nombre as producto_nombre,
             um.nombre as unidad_medida_nombre, um.abreviatura as unidad_medida_abreviatura,
             e.id as etiqueta_id, e.codigo as etiqueta_codigo, e.estado as etiqueta_estado,
             e.condicion as etiqueta_condicion
      FROM guia_items gi
      JOIN productos p ON gi.producto_id = p.id
      LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
      LEFT JOIN etiquetas e ON e.guia_item_id = gi.id AND e.estado <> 'REEMPLAZADA'
      WHERE gi.guia_id = $1
      ORDER BY gi.id
    `, [req.params.id])

    res.json({ ...guia.rows[0], items: items.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin', 'almacen'),
  log('CREAR_GUIA', req => `Guia ${req.body.numero_guia}, almacen ${req.body.almacen_id}, ${Array.isArray(req.body.items) ? req.body.items.length : 0} linea(s)`),
  async (req, res) => {
  const { numero_guia, almacen_id, fecha, items, proveedor, numero_oc, direccion, guia_remision, factura } = req.body

  if (!numero_guia || !numero_guia.trim()) {
    return res.status(400).json({ error: 'El numero de guia es requerido' })
  }
  if (!almacen_id) {
    return res.status(400).json({ error: 'El almacen es requerido' })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La guia debe tener al menos una linea de producto' })
  }
  for (const it of items) {
    if (!it.producto_id && !(it.producto_nombre && it.producto_nombre.trim())) {
      return res.status(400).json({ error: 'Cada linea debe tener un producto' })
    }
    if (!DESTINOS.includes(it.destino)) {
      return res.status(400).json({ error: 'Destino invalido en una de las lineas' })
    }
    if (it.destino === 'OTRO' && !(it.destino_detalle && it.destino_detalle.trim())) {
      return res.status(400).json({ error: 'Debes especificar el destino cuando eliges "Otro"' })
    }
    if (!Number(it.cantidad) || Number(it.cantidad) <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 en todas las lineas' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const dup = await client.query(
      'SELECT id FROM guias WHERE numero_guia = $1 AND almacen_id = $2',
      [numero_guia.trim(), almacen_id]
    )
    if (dup.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Ya existe una guia con ese numero en este almacen' })
    }

    const guiaResult = await client.query(
      `INSERT INTO guias (numero_guia, almacen_id, usuario_id, fecha, proveedor, numero_oc, direccion, guia_remision, factura)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, $9) RETURNING *`,
      [
        numero_guia.trim(), almacen_id, req.usuario.id, fecha || null,
        (proveedor || '').trim() || null,
        (numero_oc || '').trim() || null,
        (direccion || '').trim() || null,
        (guia_remision || '').trim() || null,
        (factura || '').trim() || null,
      ]
    )
    const guia = guiaResult.rows[0]

    const etiquetasGeneradas = []

    for (const it of items) {
      let productoId = it.producto_id
      if (!productoId) {
        const nombre = it.producto_nombre.trim()
        const existente = await client.query(
          'SELECT id FROM productos WHERE LOWER(nombre) = LOWER($1)',
          [nombre]
        )
        if (existente.rows.length > 0) {
          productoId = existente.rows[0].id
        } else {
          // Upsert atomico: si dos guias concurrentes registran el mismo
          // producto nuevo al mismo tiempo, el check de arriba puede pasar
          // en ambas antes de que cualquiera comitee (TOCTOU). El indice
          // UNIQUE sobre LOWER(nombre) resuelve la carrera aqui sin
          // necesidad de locking manual: la segunda transaccion recibe el
          // id ya creado por la primera en vez de fallar con 23505. Tiene
          // que ser sobre LOWER(nombre) y no sobre nombre a secas porque el
          // chequeo de arriba (linea 162) tambien es case-insensitive -
          // un indice case-sensitive no habria evitado que "Tornillo" y
          // "TORNILLO" creados al mismo tiempo generen dos productos.
          const creado = await client.query(
            `INSERT INTO productos (nombre, unidad_medida_id) VALUES ($1, $2)
             ON CONFLICT ((LOWER(nombre))) DO UPDATE SET nombre = productos.nombre
             RETURNING id`,
            [nombre, it.unidad_medida_id || null]
          )
          productoId = creado.rows[0].id
        }
      }

      if (it.unidad_medida_id) {
        await client.query(
          `UPDATE productos SET unidad_medida_id = $1 WHERE id = $2 AND unidad_medida_id IS NULL`,
          [it.unidad_medida_id, productoId]
        )
      }

      // Solo aplica a OFICINA/LABORATORIO: si aun no lo recogen (recogido=false),
      // se trata igual que ALMACEN (genera etiqueta y queda en inventario) hasta
      // que lo retiren. Si ya lo recogieron (recogido=true o no enviado), sale
      // automatico sin etiqueta, como antes.
      const pendienteDeRecoger = it.destino !== 'ALMACEN' && it.recogido === false
      const recogidoValor = it.destino === 'ALMACEN' ? null : (it.recogido !== false)

      const itemResult = await client.query(
        `INSERT INTO guia_items (guia_id, producto_id, cantidad, destino, destino_detalle, recogido) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [guia.id, productoId, it.cantidad, it.destino, it.destino === 'OTRO' ? it.destino_detalle.trim() : null, recogidoValor]
      )
      const guiaItemId = itemResult.rows[0].id

      if (it.destino === 'ALMACEN' || pendienteDeRecoger) {
        const codigoResult = await client.query(`SELECT nextval('etiquetas_codigo_seq') as codigo`)
        const codigo = codigoResult.rows[0].codigo

        const etiquetaResult = await client.query(
          `INSERT INTO etiquetas (codigo, guia_item_id, producto_id, almacen_id, estado)
           VALUES ($1, $2, $3, $4, 'EN_ALMACEN') RETURNING *`,
          [codigo, guiaItemId, productoId, almacen_id]
        )
        const etiqueta = etiquetaResult.rows[0]

        await client.query(
          `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_destino_id, usuario_id, detalle)
           VALUES ($1, 'GENERADA', $2, $3, $4)`,
          [etiqueta.id, almacen_id, req.usuario.id, `Guia ${numero_guia.trim()}`]
        )

        await ajustarInventario(client, {
          almacenId: almacen_id,
          productoId: productoId,
          delta: it.cantidad,
          descripcion: `Ingreso guia ${numero_guia.trim()}`,
        })

        etiquetasGeneradas.push({ ...etiqueta, cantidad: it.cantidad })
      }
    }

    await client.query('COMMIT')

    let etiquetasConDetalle = []
    if (etiquetasGeneradas.length > 0) {
      const detalle = await pool.query(`
        SELECT e.id, e.codigo, e.producto_id, e.almacen_id, e.estado,
               p.nombre as producto_nombre,
               um.nombre as unidad_medida_nombre, um.abreviatura as unidad_medida_abreviatura
        FROM etiquetas e
        JOIN productos p ON e.producto_id = p.id
        LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
        WHERE e.id = ANY($1::int[])
        ORDER BY e.codigo
      `, [etiquetasGeneradas.map(e => e.id)])
      const cantidadPorEtiqueta = Object.fromEntries(etiquetasGeneradas.map(e => [e.id, e.cantidad]))
      etiquetasConDetalle = detalle.rows.map(e => ({ ...e, cantidad: cantidadPorEtiqueta[e.id] }))
    }

    res.status(201).json({ guia, etiquetas: etiquetasConDetalle })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflicto al guardar la guia: otro usuario registro el mismo numero de guia o producto al mismo tiempo. Intenta de nuevo.' })
    }
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Edicion de cabecera (Fase A): solo datos de proveedor/O.C./direccion y
// estado. Los items ya generados (etiquetas, inventario) nunca se tocan
// desde aqui para no arriesgar lo que ya salio/quedo en stock.
router.put('/:id', verificarToken, soloRoles('admin', 'almacen'),
  log('EDITAR_GUIA', req => `Guia ${req.params.id}: ${JSON.stringify(req.body)}`),
  async (req, res) => {
  const { proveedor, numero_oc, direccion, estado, guia_remision, factura } = req.body
  const ESTADOS = ['CARGADA', 'CERRADA']

  if (estado !== undefined && !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado invalido' })
  }

  // Solo se actualizan los campos presentes en el body (undefined = no
  // tocar). Un campo presente pero vacio SI limpia el valor a NULL -
  // por eso no se puede usar COALESCE(param, columna): eso impediria
  // borrar un proveedor/O.C./direccion ya cargado.
  const cambios = []
  const valores = []
  if (proveedor !== undefined) {
    valores.push((proveedor || '').trim() || null)
    cambios.push(`proveedor = $${valores.length}`)
  }
  if (numero_oc !== undefined) {
    valores.push((numero_oc || '').trim() || null)
    cambios.push(`numero_oc = $${valores.length}`)
  }
  if (direccion !== undefined) {
    valores.push((direccion || '').trim() || null)
    cambios.push(`direccion = $${valores.length}`)
  }
  if (estado !== undefined) {
    valores.push(estado)
    cambios.push(`estado = $${valores.length}`)
  }
  if (guia_remision !== undefined) {
    valores.push((guia_remision || '').trim() || null)
    cambios.push(`guia_remision = $${valores.length}`)
  }
  if (factura !== undefined) {
    valores.push((factura || '').trim() || null)
    cambios.push(`factura = $${valores.length}`)
  }
  if (cambios.length === 0) {
    return res.status(400).json({ error: 'No se envio ningun campo para editar' })
  }

  try {
    valores.push(req.params.id)
    const result = await pool.query(
      `UPDATE guias SET ${cambios.join(', ')} WHERE id = $${valores.length} RETURNING *`,
      valores
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guia no encontrada' })
    }
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
