const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { ajustarInventario } = require('../utils/inventario')
const log = require('../middlewares/logMiddleware')

const DESTINOS = ['ALMACEN', 'OFICINA', 'LABORATORIO', 'OTRO']

// guia_items.cantidad y guia_item_partidas.cantidad son columnas INTEGER:
// un decimal (ej. "1.5") reventaria como error crudo de Postgres (500), asi
// que se rechaza aca con un 400 limpio.
const esEnteroPositivo = (v) => Number.isInteger(Number(v)) && Number(v) > 0

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
  // Las lineas SERVICIO (Fase 8) no representan stock fisico: quedan fuera de
  // la consulta de productos por almacen/guia.
  condiciones.unshift(`gi.tipo = 'PRODUCTO'`)
  const where = `WHERE ${condiciones.join(' AND ')}`

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
      SELECT gi.id, gi.producto_id, gi.cantidad, gi.tipo, gi.destino, gi.destino_detalle, gi.recogido,
             COALESCE(p.nombre, gi.descripcion) as producto_nombre, p.metrica as producto_metrica,
             um.nombre as unidad_medida_nombre, um.abreviatura as unidad_medida_abreviatura,
             e.id as etiqueta_id, e.codigo as etiqueta_codigo, e.estado as etiqueta_estado,
             e.condicion as etiqueta_condicion
      FROM guia_items gi
      LEFT JOIN productos p ON gi.producto_id = p.id
      LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
      LEFT JOIN etiquetas e ON e.guia_item_id = gi.id AND e.estado <> 'REEMPLAZADA'
      WHERE gi.guia_id = $1
      ORDER BY gi.id
    `, [req.params.id])

    // Partidas parciales de las lineas EN_PARTIDA (Fase 7)
    const itemIds = items.rows.map(r => r.id)
    const partidasPorItem = {}
    if (itemIds.length > 0) {
      const partidas = await pool.query(
        `SELECT id, guia_item_id, cantidad, referencia
         FROM guia_item_partidas WHERE guia_item_id = ANY($1::int[]) ORDER BY id`,
        [itemIds]
      )
      for (const pt of partidas.rows) {
        (partidasPorItem[pt.guia_item_id] ||= []).push(pt)
      }
    }
    const itemsConPartidas = items.rows.map(r => ({ ...r, partidas: partidasPorItem[r.id] || [] }))

    res.json({ ...guia.rows[0], items: itemsConPartidas })
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
      return res.status(400).json({ error: 'Cada linea debe tener un producto o servicio' })
    }
    // Linea SERVICIO (Fase 8): solo se registra e imprime -> sin destino, sin
    // partidas, sin etiqueta. Solo se valida la cantidad.
    if (it.tipo === 'SERVICIO') {
      if (!esEnteroPositivo(it.cantidad)) {
        return res.status(400).json({ error: 'La cantidad debe ser un entero mayor a 0 en todas las lineas' })
      }
      continue
    }
    if (!DESTINOS.includes(it.destino)) {
      return res.status(400).json({ error: 'Destino invalido en una de las lineas' })
    }
    if (it.destino === 'OTRO' && !(it.destino_detalle && it.destino_detalle.trim())) {
      return res.status(400).json({ error: 'Debes especificar el destino cuando eliges "Otro"' })
    }
    // Linea EN_PARTIDA (Fase 7): la cantidad sale de la suma de partidas, no
    // se exige el campo cantidad. Se valida cada partida por separado. La
    // metrica real del producto se comprueba dentro de la transaccion.
    const tienePartidas = Array.isArray(it.partidas) && it.partidas.length > 0
    if (tienePartidas) {
      for (const pt of it.partidas) {
        if (!esEnteroPositivo(pt.cantidad)) {
          return res.status(400).json({ error: 'Cada partida debe tener una cantidad entera mayor a 0' })
        }
      }
    } else if (!esEnteroPositivo(it.cantidad)) {
      return res.status(400).json({ error: 'La cantidad debe ser un entero mayor a 0 en todas las lineas' })
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
      // Linea SERVICIO (Fase 8): no usa el catalogo de productos. Se guarda la
      // descripcion libre y nada mas: producto_id NULL, sin etiqueta, sin
      // inventario, sin partidas ni destino.
      if (it.tipo === 'SERVICIO') {
        await client.query(
          `INSERT INTO guia_items (guia_id, producto_id, descripcion, cantidad, tipo, destino, destino_detalle, recogido)
           VALUES ($1, NULL, $2, $3, 'SERVICIO', NULL, NULL, NULL)`,
          [guia.id, (it.producto_nombre || '').trim(), it.cantidad]
        )
        continue
      }

      let productoId = it.producto_id
      // Metrica del producto (Fase 7): decide si la linea usa el campo
      // cantidad (ENTERO) o el desglose de partidas (EN_PARTIDA).
      let productoMetrica = 'ENTERO'
      if (!productoId) {
        const nombre = it.producto_nombre.trim()
        const existente = await client.query(
          'SELECT id, metrica FROM productos WHERE LOWER(nombre) = LOWER($1)',
          [nombre]
        )
        if (existente.rows.length > 0) {
          productoId = existente.rows[0].id
          productoMetrica = existente.rows[0].metrica
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
          // Producto nuevo dado de alta desde la guia: la metrica se toma del
          // formulario (por defecto ENTERO). El ON CONFLICT devuelve la
          // metrica ya existente si otra transaccion lo creo primero.
          const metricaNueva = ['ENTERO', 'EN_PARTIDA'].includes(it.metrica) ? it.metrica : 'ENTERO'
          const creado = await client.query(
            `INSERT INTO productos (nombre, unidad_medida_id, metrica) VALUES ($1, $2, $3)
             ON CONFLICT ((LOWER(nombre))) DO UPDATE SET nombre = productos.nombre
             RETURNING id, metrica`,
            [nombre, it.unidad_medida_id || null, metricaNueva]
          )
          productoId = creado.rows[0].id
          productoMetrica = creado.rows[0].metrica
        }
      } else {
        const prodRow = await client.query('SELECT metrica FROM productos WHERE id = $1', [productoId])
        productoMetrica = prodRow.rows[0]?.metrica || 'ENTERO'
      }

      if (it.unidad_medida_id) {
        await client.query(
          `UPDATE productos SET unidad_medida_id = $1 WHERE id = $2 AND unidad_medida_id IS NULL`,
          [it.unidad_medida_id, productoId]
        )
      }

      // Fase 7: para un producto EN_PARTIDA la cantidad de la linea es la suma
      // de las partidas (fuente unica de verdad, se ignora lo que mande el
      // cliente en it.cantidad). Un producto ENTERO ignora cualquier partida.
      const partidas = Array.isArray(it.partidas) ? it.partidas : []
      const usaPartidas = productoMetrica === 'EN_PARTIDA'
      if (usaPartidas) {
        if (partidas.length === 0) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: `El producto "${it.producto_nombre || 'seleccionado'}" se maneja EN PARTIDA: agrega al menos una partida` })
        }
        it.cantidad = partidas.reduce((suma, pt) => suma + Number(pt.cantidad), 0)
      }
      if (!esEnteroPositivo(it.cantidad)) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'La cantidad debe ser un entero mayor a 0 en todas las lineas' })
      }

      // Solo aplica a OFICINA/LABORATORIO: si aun no lo recogen (recogido=false),
      // se trata igual que ALMACEN (genera etiqueta y queda en inventario) hasta
      // que lo retiren. Si ya lo recogieron (recogido=true o no enviado), sale
      // automatico sin etiqueta, como antes.
      const pendienteDeRecoger = it.destino !== 'ALMACEN' && it.recogido === false
      const recogidoValor = it.destino === 'ALMACEN' ? null : (it.recogido !== false)

      const itemResult = await client.query(
        `INSERT INTO guia_items (guia_id, producto_id, cantidad, destino, destino_detalle, recogido, tipo) VALUES ($1, $2, $3, $4, $5, $6, 'PRODUCTO') RETURNING id`,
        [guia.id, productoId, it.cantidad, it.destino, it.destino === 'OTRO' ? it.destino_detalle.trim() : null, recogidoValor]
      )
      const guiaItemId = itemResult.rows[0].id

      if (usaPartidas) {
        for (const pt of partidas) {
          await client.query(
            `INSERT INTO guia_item_partidas (guia_item_id, cantidad, referencia) VALUES ($1, $2, $3)`,
            [guiaItemId, Number(pt.cantidad), (pt.referencia || '').trim() || null]
          )
        }
      }

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

// Edicion de guia (Fase A + Fase 8):
// - Cabecera: proveedor/O.C./direccion/guia_remision/factura/estado.
// - `items`: [{ id, cantidad }] corrige la CANTIDAD de lineas ya registradas.
//   Si la linea tiene etiqueta EN_ALMACEN, el inventario se ajusta por la
//   diferencia. Si esa etiqueta ya salio (SALIO/REEMPLAZADA) la linea queda
//   bloqueada. Las lineas EN_PARTIDA no se editan aqui (su cantidad sale del
//   desglose de partidas). No se agregan/quitan lineas ni se cambia el
//   producto o el destino.
// - Guia CERRADA: solo se admite `numero_oc`, `estado` (para reabrirla) e
//   `items`. El resto de la cabecera queda bloqueado hasta pasarla a CARGADA.
router.put('/:id', verificarToken, soloRoles('admin', 'almacen'),
  log('EDITAR_GUIA', req => `Guia ${req.params.id}: ${JSON.stringify(req.body)}`),
  async (req, res) => {
  const { proveedor, numero_oc, direccion, estado, guia_remision, factura, items } = req.body
  const ESTADOS = ['CARGADA', 'CERRADA']

  if (estado !== undefined && !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado invalido' })
  }

  const editItems = Array.isArray(items) ? items : []
  for (const it of editItems) {
    if (!it || it.id === undefined || !esEnteroPositivo(it.cantidad)) {
      return res.status(400).json({ error: 'Cada linea a editar necesita un id y una cantidad entera mayor a 0' })
    }
  }

  const sinCabecera = [proveedor, numero_oc, direccion, estado, guia_remision, factura].every(v => v === undefined)
  if (sinCabecera && editItems.length === 0) {
    return res.status(400).json({ error: 'No se envio ningun campo para editar' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const actual = await client.query('SELECT * FROM guias WHERE id = $1 FOR UPDATE', [req.params.id])
    if (actual.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Guia no encontrada' })
    }
    const guiaActual = actual.rows[0]

    // Guia CERRADA: solo cantidad de lineas + N de O.C. (y reabrir con estado).
    if (guiaActual.estado === 'CERRADA') {
      const bloqueados = { proveedor, direccion, guia_remision, factura }
      for (const [campo, valor] of Object.entries(bloqueados)) {
        if (valor !== undefined) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: `La guia esta CERRADA: solo se puede editar la cantidad de las lineas y el N de O.C. (campo bloqueado: ${campo})` })
        }
      }
    }

    // --- Cabecera (solo los campos presentes; vacio = limpiar a NULL) ---
    const cambios = []
    const valores = []
    const push = (campo, valor) => { valores.push(valor); cambios.push(`${campo} = $${valores.length}`) }
    if (proveedor !== undefined)     push('proveedor', (proveedor || '').trim() || null)
    if (numero_oc !== undefined)     push('numero_oc', (numero_oc || '').trim() || null)
    if (direccion !== undefined)     push('direccion', (direccion || '').trim() || null)
    if (estado !== undefined)        push('estado', estado)
    if (guia_remision !== undefined) push('guia_remision', (guia_remision || '').trim() || null)
    if (factura !== undefined)       push('factura', (factura || '').trim() || null)

    let guiaFinal = guiaActual
    if (cambios.length > 0) {
      valores.push(req.params.id)
      const upd = await client.query(
        `UPDATE guias SET ${cambios.join(', ')} WHERE id = $${valores.length} RETURNING *`,
        valores
      )
      guiaFinal = upd.rows[0]
    }

    // --- Cantidad por linea (Fase 8) ---
    for (const edit of editItems) {
      const linea = await client.query(`
        SELECT gi.id, gi.cantidad, gi.producto_id, gi.tipo, p.metrica AS producto_metrica,
               e.id AS etiqueta_id, e.estado AS etiqueta_estado, e.codigo AS etiqueta_codigo,
               e.condicion AS etiqueta_condicion
        FROM guia_items gi
        LEFT JOIN productos p ON gi.producto_id = p.id
        LEFT JOIN etiquetas e ON e.guia_item_id = gi.id AND e.estado <> 'REEMPLAZADA'
        WHERE gi.id = $1 AND gi.guia_id = $2
        FOR UPDATE OF gi
      `, [edit.id, req.params.id])
      if (linea.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `La linea ${edit.id} no pertenece a esta guia` })
      }
      const l = linea.rows[0]
      const nuevaCantidad = Number(edit.cantidad)
      const delta = nuevaCantidad - l.cantidad
      if (delta === 0) continue

      if (l.producto_metrica === 'EN_PARTIDA') {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Una linea EN PARTIDA toma su cantidad del desglose de partidas: no se edita aqui' })
      }
      // Si la linea genero etiqueta y esa etiqueta ya salio o fue reemplazada,
      // el inventario ya se movio con la salida -> cambiar la cantidad aqui lo
      // dejaria inconsistente. Se bloquea.
      if (l.etiqueta_id && l.etiqueta_estado !== 'EN_ALMACEN') {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: `No se puede cambiar la cantidad de la linea "${l.etiqueta_codigo}": ese codigo ya salio del almacen (estado ${l.etiqueta_estado})` })
      }
      // Si la etiqueta viva de la linea es una devolucion USADA (Fase 5), su
      // stock esta en el bucket DEVOLUCION del inventario, no NUEVO, y su
      // relacion con guia_items.cantidad ya no es 1:1. Ajustar la cantidad
      // aqui descuadraria los buckets -> se bloquea.
      if (l.etiqueta_id && l.etiqueta_condicion === 'USADO') {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: `No se puede cambiar la cantidad de la linea "${l.etiqueta_codigo}": tiene una devolucion USADA asociada` })
      }

      await client.query('UPDATE guia_items SET cantidad = $1 WHERE id = $2', [nuevaCantidad, l.id])

      // Solo las lineas con etiqueta EN_ALMACEN movieron inventario al
      // ingresar; se replica el mismo delta sobre el stock del almacen.
      if (l.etiqueta_id) {
        await ajustarInventario(client, {
          almacenId: guiaFinal.almacen_id,
          productoId: l.producto_id,
          delta,
          descripcion: `Ajuste guia ${guiaFinal.numero_guia} (edicion de cantidad)`,
        })
      }
    }

    await client.query('COMMIT')
    res.json(guiaFinal)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
