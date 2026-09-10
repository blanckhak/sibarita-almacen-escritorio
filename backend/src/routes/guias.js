const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { ajustarInventario } = require('../utils/inventario')
const { crearNotaSalidaAutomatica } = require('../utils/salida')
const { validarLargos } = require('../utils/texto')
const { mensajeConcurrencia } = require('../utils/dbErrores')
const log = require('../middlewares/logMiddleware')

const DESTINOS = ['ALMACEN', 'OFICINA', 'LABORATORIO', 'OTRO']
// Destinos que generan su propia Nota de Salida automatica (Bloque 6): el
// material se entrega directo, no se maneja como stock normal de almacen.
const DESTINOS_SALIDA_AUTO = ['OFICINA', 'LABORATORIO']
const DESTINO_LABEL = { OFICINA: 'Oficina', LABORATORIO: 'Laboratorio' }

// Fase 11 (R6): guia_items.cantidad y guia_item_partidas.cantidad son
// NUMERIC(12,3) -> se admiten fracciones por Kilo / Metro (1.2, 0.3, 3.5).
// Se sigue rechazando aca con un 400 limpio: 0, negativos, NaN, Infinity y
// mas de 3 decimales (antes de llegar al INSERT de Postgres).
const MAX_DECIMALES = 3
const esCantidadPositiva = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return false
  const s = String(v).trim()
  const dec = s.includes('.') ? (s.split('.')[1] || '').length : 0
  return dec <= MAX_DECIMALES
}

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
  // Las lineas SERVICIO (Fase 8) no representan stock fisico y las guias
  // ANULADAS ya no tienen stock: quedan fuera de la consulta de productos.
  condiciones.unshift(`gi.tipo = 'PRODUCTO'`, `g.estado <> 'ANULADA'`)
  const where = `WHERE ${condiciones.join(' AND ')}`

  try {
    const result = await pool.query(`
      SELECT g.numero_guia, g.fecha, a.nombre as almacen_nombre,
             gi.id as guia_item_id, p.nombre as producto_nombre, p.categoria,
             COALESCE(e.cantidad, gi.cantidad)::float8 as cantidad, gi.destino,
             e.id as etiqueta_id, e.codigo as etiqueta_codigo, e.estado as etiqueta_estado,
             e.condicion as etiqueta_condicion, e.ubicacion as etiqueta_ubicacion
      FROM guia_items gi
      JOIN guias g ON gi.guia_id = g.id
      JOIN almacenes a ON g.almacen_id = a.id
      JOIN productos p ON gi.producto_id = p.id
      -- Una devolucion "usada" deja el codigo viejo como REEMPLAZADA y crea uno
      -- nuevo para el mismo guia_item; se muestra el vigente, no el retirado.
      LEFT JOIN etiquetas e ON e.guia_item_id = gi.id AND e.estado NOT IN ('REEMPLAZADA', 'ANULADA')
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
             g.proveedor, g.numero_oc, g.direccion, g.estado, g.tipo_documento,
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
      SELECT g.*, a.nombre as almacen_nombre, u.nombre as usuario_nombre,
             ua.nombre as anulada_por_nombre
      FROM guias g
      JOIN almacenes a ON g.almacen_id = a.id
      LEFT JOIN usuarios u ON g.usuario_id = u.id
      LEFT JOIN usuarios ua ON g.anulada_por = ua.id
      WHERE g.id = $1
    `, [req.params.id])
    if (guia.rows.length === 0) {
      return res.status(404).json({ error: 'Guia no encontrada' })
    }

    const items = await pool.query(`
      SELECT gi.id, gi.producto_id, gi.cantidad::float8 as cantidad, gi.tipo, gi.destino, gi.destino_detalle, gi.recogido,
             gi.id_agrupador, gi.observaciones, gi.codigo_impresion,
             COALESCE(p.nombre, gi.descripcion) as producto_nombre, p.metrica as producto_metrica,
             um.nombre as unidad_medida_nombre, um.abreviatura as unidad_medida_abreviatura,
             e.id as etiqueta_id, e.codigo as etiqueta_codigo, e.estado as etiqueta_estado,
             e.condicion as etiqueta_condicion, e.ubicacion as etiqueta_ubicacion
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
        `SELECT id, guia_item_id, cantidad::float8 as cantidad, referencia
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
  const { numero_guia, almacen_id, fecha, items, proveedor, numero_oc, direccion, guia_remision, factura, observaciones } = req.body
  const TIPOS_DOC = ['GUIA', 'FACTURA', 'BOLETA', 'OTRO']
  const tipoDocumento = TIPOS_DOC.includes(req.body.tipo_documento) ? req.body.tipo_documento : 'GUIA'

  if (!numero_guia || !numero_guia.trim()) {
    return res.status(400).json({ error: 'El numero de guia es requerido' })
  }
  if (!almacen_id) {
    return res.status(400).json({ error: 'El almacen es requerido' })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La guia debe tener al menos una linea de producto' })
  }
  const errLargo = validarLargos({
    'numero de guia': [numero_guia, 50],
    'proveedor': [proveedor, 150],
    'numero de O.C.': [numero_oc, 50],
    'direccion': [direccion, 200],
    'guia de remision': [guia_remision, 50],
    'factura': [factura, 50],
  })
  if (errLargo) return res.status(400).json({ error: errLargo })
  for (const it of items) {
    if (!it.producto_id && !(it.producto_nombre && it.producto_nombre.trim())) {
      return res.status(400).json({ error: 'Cada linea debe tener un producto o servicio' })
    }
    const errItem = validarLargos({
      'producto / servicio': [it.producto_nombre, 150],
      'destino (Otro)': [it.destino_detalle, 200],
      'persona que retira': [it.persona_retira, 150],
      'ID de agrupacion': [it.id_agrupador, 30],
      'observacion de la linea': [it.observaciones, 300],
    })
    if (errItem) return res.status(400).json({ error: errItem })
    for (const pt of (Array.isArray(it.partidas) ? it.partidas : [])) {
      const errRef = validarLargos({ 'referencia de partida': [pt.referencia, 200] })
      if (errRef) return res.status(400).json({ error: errRef })
    }
    // Linea SERVICIO (Fase 8): solo se registra e imprime -> sin destino, sin
    // partidas, sin etiqueta. Solo se valida la cantidad.
    if (it.tipo === 'SERVICIO') {
      if (!esCantidadPositiva(it.cantidad)) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 (hasta 3 decimales) en todas las lineas' })
      }
      continue
    }
    if (!DESTINOS.includes(it.destino)) {
      return res.status(400).json({ error: 'Destino invalido en una de las lineas' })
    }
    if (it.destino === 'OTRO' && !(it.destino_detalle && it.destino_detalle.trim())) {
      return res.status(400).json({ error: 'Debes especificar el destino cuando eliges "Otro"' })
    }
    // Oficina/Laboratorio ya recogido (Bloque 6): si viene "quien retira" se
    // genera su Nota de Salida al toque. Si NO viene (o queda "pendiente de
    // recoger", recogido:false) la linea queda en inventario con codigo y la
    // Nota se genera despues, al marcarla retirada desde el detalle de la guia
    // (POST /:id/items/:itemId/retirar), cuando ya se sabe quien lo retira.
    // Linea EN_PARTIDA (Fase 7): la cantidad sale de la suma de partidas, no
    // se exige el campo cantidad. Se valida cada partida por separado. La
    // metrica real del producto se comprueba dentro de la transaccion.
    const tienePartidas = Array.isArray(it.partidas) && it.partidas.length > 0
    if (tienePartidas) {
      for (const pt of it.partidas) {
        if (!esCantidadPositiva(pt.cantidad)) {
          return res.status(400).json({ error: 'Cada partida debe tener una cantidad mayor a 0 (hasta 3 decimales)' })
        }
      }
    } else if (!esCantidadPositiva(it.cantidad)) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 (hasta 3 decimales) en todas las lineas' })
    }
  }

  // --- Recomendaciones 2 y 3 (prueba de estres): resolver el producto de cada
  // linea ANTES de abrir la transaccion de la guia.
  //   * Si la linea ya trae producto_id (elegido del catalogo en el front) no
  //     se toca: es el camino sin carrera.
  //   * Si trae nombre libre, el find-or-create se hace aca en AUTOCOMMIT.
  //     Antes se hacia dentro de la transaccion y el candado del producto nuevo
  //     quedaba tomado durante TODA la transaccion de la guia; con muchas guias
  //     concurrentes sobre el mismo producto nuevo eso serializaba todo y
  //     tumbaba el backend. En autocommit el candado dura milisegundos.
  // Si luego la guia falla puede quedar un producto de catalogo sin stock: es
  // inocuo (producto_canon lo deduplica) y un reintento lo reutiliza.
  try {
    for (const it of items) {
      if (it.tipo === 'SERVICIO' || it.producto_id) continue
      const nombre = (it.producto_nombre || '').trim().replace(/\s+/g, ' ')
      if (!nombre) continue
      const existente = await pool.query(
        'SELECT id, metrica FROM productos WHERE producto_canon(nombre) = producto_canon($1)',
        [nombre]
      )
      if (existente.rows.length > 0) {
        it.producto_id = existente.rows[0].id
        it.__metrica = existente.rows[0].metrica
        continue
      }
      const metricaNueva = ['ENTERO', 'EN_PARTIDA'].includes(it.metrica) ? it.metrica : 'ENTERO'
      const creado = await pool.query(
        `INSERT INTO productos (nombre, unidad_medida_id, metrica) VALUES ($1, $2, $3)
         ON CONFLICT ((producto_canon(nombre))) DO UPDATE SET nombre = productos.nombre
         RETURNING id, metrica`,
        [nombre, it.unidad_medida_id || null, metricaNueva]
      )
      it.producto_id = creado.rows[0].id
      it.__metrica = creado.rows[0].metrica
    }
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflicto al registrar un producto nuevo; intenta de nuevo.' })
    }
    return res.status(500).json({ error: err.message })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const dup = await client.query(
      `SELECT id FROM guias WHERE numero_guia = $1 AND almacen_id = $2 AND estado <> 'ANULADA'`,
      [numero_guia.trim(), almacen_id]
    )
    if (dup.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Ya existe una guia con ese numero en este almacen' })
    }

    const guiaResult = await client.query(
      `INSERT INTO guias (numero_guia, almacen_id, usuario_id, fecha, proveedor, numero_oc, direccion, guia_remision, factura, tipo_documento, observaciones)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        numero_guia.trim(), almacen_id, req.usuario.id, fecha || null,
        (proveedor || '').trim() || null,
        (numero_oc || '').trim() || null,
        (direccion || '').trim() || null,
        (guia_remision || '').trim() || null,
        (factura || '').trim() || null,
        tipoDocumento,
        (observaciones || '').trim() || null,
      ]
    )
    const guia = guiaResult.rows[0]

    const etiquetasGeneradas = []
    const notasSalidaGeneradas = []
    // Agrupa las lineas de salida automatica (Oficina/Laboratorio ya
    // recogido) por destino+persona+observacion, para generar una sola Nota
    // de Salida por grupo en vez de una por producto.
    const salidaAutoGrupos = new Map()

    for (const it of items) {
      // Fase 11 (R4): id de agrupacion y observacion por linea, comunes a
      // PRODUCTO y SERVICIO.
      const idAgrupador = (it.id_agrupador || '').trim() || null
      const obsItem = (it.observaciones || '').trim() || null

      // Linea SERVICIO (Fase 8): no usa el catalogo de productos. Se guarda la
      // descripcion libre y nada mas: producto_id NULL, sin etiqueta, sin
      // inventario, sin partidas ni destino.
      if (it.tipo === 'SERVICIO') {
        await client.query(
          `INSERT INTO guia_items (guia_id, producto_id, descripcion, cantidad, tipo, destino, destino_detalle, recogido, id_agrupador, observaciones)
           VALUES ($1, NULL, $2, $3, 'SERVICIO', NULL, NULL, NULL, $4, $5)`,
          [guia.id, (it.producto_nombre || '').trim(), it.cantidad, idAgrupador, obsItem]
        )
        continue
      }

      let productoId = it.producto_id
      // Metrica del producto (Fase 7): decide si la linea usa el campo
      // cantidad (ENTERO) o el desglose de partidas (EN_PARTIDA).
      let productoMetrica = 'ENTERO'
      // Camino normal: el producto ya se resolvio en el pre-pass autocommit de
      // arriba (trae producto_id y __metrica). El bloque !productoId queda solo
      // como red de seguridad por si alguna ruta no paso por ese pre-pass.
      if (it.__metrica) {
        productoMetrica = it.__metrica
      } else if (!productoId) {
        // Nombre para guardar: sin espacios de mas. La comparacion contra el
        // catalogo (Bloque 3, "stock consolidado") usa producto_canon para que
        // "Tornillo 1/2", "tornillo  1 - 2" y "TORNILLO 1/2" sean el mismo
        // producto y su stock no quede partido en variantes.
        const nombre = it.producto_nombre.trim().replace(/\s+/g, ' ')
        const existente = await client.query(
          'SELECT id, metrica FROM productos WHERE producto_canon(nombre) = producto_canon($1)',
          [nombre]
        )
        if (existente.rows.length > 0) {
          productoId = existente.rows[0].id
          productoMetrica = existente.rows[0].metrica
        } else {
          // Upsert atomico: si dos guias concurrentes registran el mismo
          // producto nuevo al mismo tiempo, el check de arriba puede pasar en
          // ambas antes de que cualquiera comitee (TOCTOU). El ON CONFLICT
          // sobre producto_canon(nombre) resuelve la carrera con la misma
          // nocion de igualdad que usa el check (sin tildes/espacios/simbolos):
          // la segunda transaccion recibe el id ya creado por la primera en
          // vez de fallar con 23505, aunque haya escrito el nombre distinto.
          // La metrica se toma del formulario (ENTERO por defecto); el
          // ON CONFLICT devuelve la que ya existiera si otra la creo primero.
          const metricaNueva = ['ENTERO', 'EN_PARTIDA'].includes(it.metrica) ? it.metrica : 'ENTERO'
          const creado = await client.query(
            `INSERT INTO productos (nombre, unidad_medida_id, metrica) VALUES ($1, $2, $3)
             ON CONFLICT ((producto_canon(nombre))) DO UPDATE SET nombre = productos.nombre
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
        // Redondeo a 3 decimales: sumar floats (0.1 + 0.2) arrastra ruido
        // binario que esCantidadPositiva rechazaria por "mas de 3 decimales".
        it.cantidad = Math.round(partidas.reduce((suma, pt) => suma + Number(pt.cantidad), 0) * 1000) / 1000
      }
      if (!esCantidadPositiva(it.cantidad)) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 (hasta 3 decimales) en todas las lineas' })
      }

      // Oficina/Laboratorio marcado "ya recogido" pero SIN indicar quien retira:
      // no se puede emitir la Nota de Salida todavia (necesita responsable), asi
      // que la linea se trata como pendiente de recoger y el responsable se
      // asigna despues desde el detalle de la guia.
      const sinResponsable = DESTINOS_SALIDA_AUTO.includes(it.destino) && !(it.persona_retira && it.persona_retira.trim())
      // Solo aplica a OFICINA/LABORATORIO/OTRO: si aun no lo recogen
      // (recogido=false) o falta el responsable, se trata igual que ALMACEN
      // (genera etiqueta y queda en inventario) hasta que lo retiren
      // (POST /:id/items/:itemId/retirar).
      const pendienteDeRecoger = it.destino !== 'ALMACEN' && (it.recogido === false || sinResponsable)
      const recogidoValor = it.destino === 'ALMACEN' ? null : (it.recogido !== false && !sinResponsable)
      // Oficina/Laboratorio ya recogido (Bloque 6): genera su propia Nota de
      // Salida automatica (USO_INTERNO, cerrada, sin devolucion) en el mismo
      // momento. OTRO no cambia: sigue saliendo sin dejar ningun rastro.
      const salidaAutoInmediata = DESTINOS_SALIDA_AUTO.includes(it.destino) && !pendienteDeRecoger

      const itemResult = await client.query(
        `INSERT INTO guia_items (guia_id, producto_id, cantidad, destino, destino_detalle, recogido, tipo, id_agrupador, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, 'PRODUCTO', $7, $8) RETURNING id`,
        [guia.id, productoId, it.cantidad, it.destino, it.destino === 'OTRO' ? it.destino_detalle.trim() : null, recogidoValor, idAgrupador, obsItem]
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

      if (it.destino === 'ALMACEN' || pendienteDeRecoger || salidaAutoInmediata) {
        const codigoResult = await client.query(`SELECT nextval('etiquetas_codigo_seq') as codigo`)
        const codigo = codigoResult.rows[0].codigo

        const etiquetaResult = await client.query(
          `INSERT INTO etiquetas (codigo, guia_item_id, producto_id, almacen_id, estado)
           VALUES ($1, $2, $3, $4, 'EN_ALMACEN') RETURNING *`,
          [codigo, guiaItemId, productoId, almacen_id]
        )
        const etiqueta = { ...etiquetaResult.rows[0], cantidad: it.cantidad }

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

        if (salidaAutoInmediata) {
          // No se crea la nota todavia: se agrupan las etiquetas de todas las
          // lineas con el mismo destino + persona que retira + observacion, y
          // se genera UNA sola Nota de Salida con todas juntas (no una por
          // producto) despues del loop.
          const clave = `${it.destino}::${it.persona_retira.trim()}::${(it.retira_obs || '').trim()}`
          if (!salidaAutoGrupos.has(clave)) {
            salidaAutoGrupos.set(clave, {
              destino: it.destino,
              personaRetira: it.persona_retira.trim(),
              retiraObs: (it.retira_obs || '').trim() || null,
              etiquetas: [],
            })
          }
          salidaAutoGrupos.get(clave).etiquetas.push(etiqueta)
        } else {
          etiquetasGeneradas.push(etiqueta)
        }
      }
    }

    for (const grupo of salidaAutoGrupos.values()) {
      const notaAuto = await crearNotaSalidaAutomatica(client, {
        guiaId: guia.id,
        etiquetas: grupo.etiquetas,
        seccion: DESTINO_LABEL[grupo.destino],
        personaResponsable: grupo.personaRetira,
        observaciones: grupo.retiraObs,
        usuarioId: req.usuario.id,
      })
      notasSalidaGeneradas.push({ numero_nota: notaAuto.numero_nota, nota_id: notaAuto.id, productos: grupo.etiquetas.length })
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

    res.status(201).json({ guia, etiquetas: etiquetasConDetalle, notas_salida_generadas: notasSalidaGeneradas })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflicto al guardar la guia: otro usuario registro el mismo numero de guia o producto al mismo tiempo. Intenta de nuevo.' })
    }
    const msgConcurrencia = mensajeConcurrencia(err)
    if (msgConcurrencia) return res.status(503).json({ error: msgConcurrencia })
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Marca como retirado un item de Oficina/Laboratorio que habia quedado
// "pendiente de recoger" (Bloque 6): genera su Nota de Salida automatica
// (USO_INTERNO, cerrada, sin devolucion) recien en este momento, cuando ya se
// sabe quien lo retira.
router.post('/:id/items/:itemId/retirar', verificarToken, soloRoles('admin', 'almacen'),
  log('RETIRAR_ITEM_GUIA', req => `Guia id ${req.params.id}, item id ${req.params.itemId}`),
  async (req, res) => {
  const personaRetira = (req.body.persona_retira || '').trim()
  if (!personaRetira) {
    return res.status(400).json({ error: 'Debes indicar quien retira el producto' })
  }
  const errLargo = validarLargos({ 'persona que retira': [personaRetira, 150] })
  if (errLargo) return res.status(400).json({ error: errLargo })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const item = await client.query(`
      SELECT gi.id, gi.destino, gi.recogido, e.id as etiqueta_id, e.estado as etiqueta_estado,
             e.almacen_id, e.producto_id, e.condicion,
             COALESCE(e.cantidad, gi.cantidad) as cantidad
      FROM guia_items gi
      LEFT JOIN etiquetas e ON e.guia_item_id = gi.id AND e.estado <> 'REEMPLAZADA'
      WHERE gi.guia_id = $1 AND gi.id = $2
      FOR UPDATE OF gi
    `, [req.params.id, req.params.itemId])
    if (item.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Ese item no pertenece a esta guia' })
    }
    const it = item.rows[0]
    if (!DESTINOS_SALIDA_AUTO.includes(it.destino)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Ese item no es de Oficina ni Laboratorio' })
    }
    if (it.recogido !== false) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Ese item ya fue retirado' })
    }
    if (!it.etiqueta_id || it.etiqueta_estado !== 'EN_ALMACEN') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Ese item ya no esta disponible en almacen para retirar' })
    }

    const nota = await crearNotaSalidaAutomatica(client, {
      guiaId: Number(req.params.id),
      etiquetas: [{ id: it.etiqueta_id, almacen_id: it.almacen_id, producto_id: it.producto_id, condicion: it.condicion, cantidad: it.cantidad }],
      seccion: DESTINO_LABEL[it.destino],
      personaResponsable: personaRetira,
      observaciones: (req.body.retira_obs || '').trim() || null,
      usuarioId: req.usuario.id,
    })

    await client.query(`UPDATE guia_items SET recogido = true WHERE id = $1`, [it.id])

    await client.query('COMMIT')
    res.json({ ok: true, numero_nota: nota.numero_nota, nota_id: nota.id })
  } catch (err) {
    await client.query('ROLLBACK')
    const msgConcurrencia = mensajeConcurrencia(err)
    if (msgConcurrencia) return res.status(503).json({ error: msgConcurrencia })
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Edicion de guia (Fase A + Fase 8):
// - Cabecera: proveedor/O.C./direccion/guia_remision/factura/estado/observaciones.
// - `items`: [{ id, cantidad, id_agrupador?, observaciones?, codigo_impresion? }].
//   La CANTIDAD sigue las reglas de Fase 8 (abajo). id_agrupador / observaciones
//   / codigo_impresion (Fase 11 R4) no afectan stock: se pueden editar aunque la
//   guia este CERRADA o la etiqueta ya haya salido.
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
  const { proveedor, numero_oc, direccion, estado, guia_remision, factura, tipo_documento, items, observaciones } = req.body
  const ESTADOS = ['CARGADA', 'CERRADA']
  const TIPOS_DOC = ['GUIA', 'FACTURA', 'BOLETA', 'OTRO']
  if (tipo_documento !== undefined && !TIPOS_DOC.includes(tipo_documento)) {
    return res.status(400).json({ error: 'Tipo de documento invalido' })
  }

  if (estado !== undefined && !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado invalido' })
  }
  const errLargo = validarLargos({
    'proveedor': [proveedor, 150],
    'numero de O.C.': [numero_oc, 50],
    'direccion': [direccion, 200],
    'guia de remision': [guia_remision, 50],
    'factura': [factura, 50],
  })
  if (errLargo) return res.status(400).json({ error: errLargo })

  const editItems = Array.isArray(items) ? items : []
  for (const it of editItems) {
    if (!it || it.id === undefined || !esCantidadPositiva(it.cantidad)) {
      return res.status(400).json({ error: 'Cada linea a editar necesita un id y una cantidad mayor a 0 (hasta 3 decimales)' })
    }
    const errItem = validarLargos({
      'ID de agrupacion': [it.id_agrupador, 30],
      'observacion de la linea': [it.observaciones, 300],
      'codigo de impresion': [it.codigo_impresion, 30],
    })
    if (errItem) return res.status(400).json({ error: errItem })
  }

  const sinCabecera = [proveedor, numero_oc, direccion, estado, guia_remision, factura, tipo_documento, observaciones].every(v => v === undefined)
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

    if (guiaActual.estado === 'ANULADA') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'La guia esta ANULADA y no se puede editar' })
    }

    // Guia CERRADA: solo cantidad de lineas + N de O.C. (y reabrir con estado).
    if (guiaActual.estado === 'CERRADA') {
      const bloqueados = { proveedor, direccion, guia_remision, factura, tipo_documento }
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
    if (tipo_documento !== undefined) push('tipo_documento', tipo_documento)
    // Fase 11 (R4): observacion general de la guia. No afecta stock -> se admite
    // tambien en guias CERRADAS.
    if (observaciones !== undefined) push('observaciones', (observaciones || '').trim() || null)

    let guiaFinal = guiaActual
    if (cambios.length > 0) {
      valores.push(req.params.id)
      const upd = await client.query(
        `UPDATE guias SET ${cambios.join(', ')} WHERE id = $${valores.length} RETURNING *`,
        valores
      )
      guiaFinal = upd.rows[0]
    }

    // --- Cantidad por linea (Fase 8) + agrupador/observacion/codigo (Fase 11 R4) ---
    for (const edit of editItems) {
      const linea = await client.query(`
        SELECT gi.id, gi.cantidad::float8 AS cantidad, gi.producto_id, gi.tipo, p.metrica AS producto_metrica,
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

      // Fase 11 (R4): id_agrupador / observacion / codigo_impresion no afectan
      // stock -> se actualizan siempre que vengan, aunque la cantidad no cambie
      // y aunque la guia este CERRADA o la etiqueta ya haya salido.
      const setR4 = []
      const valR4 = []
      const pushR4 = (campo, valor) => { valR4.push(valor); setR4.push(`${campo} = $${valR4.length}`) }
      if (edit.id_agrupador !== undefined)     pushR4('id_agrupador', (edit.id_agrupador || '').trim() || null)
      if (edit.observaciones !== undefined)    pushR4('observaciones', (edit.observaciones || '').trim() || null)
      if (edit.codigo_impresion !== undefined) pushR4('codigo_impresion', (edit.codigo_impresion || '').trim() || null)
      if (setR4.length > 0) {
        valR4.push(l.id)
        await client.query(`UPDATE guia_items SET ${setR4.join(', ')} WHERE id = $${valR4.length}`, valR4)
      }

      const nuevaCantidad = Number(edit.cantidad)
      const delta = Math.round((nuevaCantidad - l.cantidad) * 1000) / 1000
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
    const msgConcurrencia = mensajeConcurrencia(err)
    if (msgConcurrencia) return res.status(503).json({ error: msgConcurrencia })
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Anular una guia: revierte el stock que sumo, retira sus codigos (etiquetas ->
// estado ANULADA) y deja la guia en estado ANULADA con el motivo. Solo se
// permite si NINGUN codigo salio del almacen ni esta comprometido en una nota
// de salida. No borra nada: la guia sigue visible en el historial.
router.post('/:id/anular', verificarToken, soloRoles('admin', 'almacen'),
  log('ANULAR_GUIA', req => `Guia id ${req.params.id}, motivo: ${(req.body.motivo || '').trim() || 'sin indicar'}`),
  async (req, res) => {
  const motivo = (req.body.motivo || '').trim()
  if (!motivo) {
    return res.status(400).json({ error: 'El motivo de anulacion es requerido' })
  }
  const errLargo = validarLargos({ 'motivo': [motivo, 200] })
  if (errLargo) return res.status(400).json({ error: errLargo })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const g = await client.query('SELECT * FROM guias WHERE id = $1 FOR UPDATE', [req.params.id])
    if (g.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Guia no encontrada' })
    }
    if (g.rows[0].estado === 'ANULADA') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'La guia ya esta anulada' })
    }
    const numeroGuia = g.rows[0].numero_guia

    // Solo las lineas PRODUCTO con destino ALMACEN (o OFICINA/LABORATORIO sin
    // recoger) tienen etiqueta y movieron inventario; las demas no.
    const ets = await client.query(`
      SELECT e.id, e.codigo, e.estado, e.almacen_id, e.producto_id, e.condicion,
             COALESCE(e.cantidad, gi.cantidad) as cantidad
      FROM etiquetas e
      JOIN guia_items gi ON e.guia_item_id = gi.id
      WHERE gi.guia_id = $1
      FOR UPDATE OF e
    `, [req.params.id])

    const salioAfuera = ets.rows.find(e => e.estado === 'SALIO')
    if (salioAfuera) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: `El codigo ${salioAfuera.codigo} ya salio del almacen; revertí esa salida antes de anular la guia` })
    }
    // REEMPLAZADA = una linea que salio y volvio "usada" (devolucion). Tiene
    // historial posterior a la guia: no se puede anular sin desarmarlo.
    const conMovimientos = ets.rows.find(e => e.estado !== 'EN_ALMACEN')
    if (conMovimientos) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: `El codigo ${conMovimientos.codigo} tiene movimientos posteriores (devolucion); no se puede anular la guia` })
    }
    const idsEt = ets.rows.map(e => e.id)
    if (idsEt.length > 0) {
      const enNota = await client.query(
        `SELECT e.codigo
         FROM notas_salida_detalle d JOIN etiquetas e ON d.etiqueta_id = e.id
         WHERE d.etiqueta_id = ANY($1::int[]) LIMIT 1`,
        [idsEt]
      )
      if (enNota.rows.length > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: `El codigo ${enNota.rows[0].codigo} esta en una nota de salida; no se puede anular la guia` })
      }
    }

    for (const e of ets.rows) {
      await ajustarInventario(client, {
        almacenId: e.almacen_id,
        productoId: e.producto_id,
        delta: -e.cantidad,
        tipo: e.condicion === 'USADO' ? 'DEVOLUCION' : 'NUEVO',
        descripcion: `Anulacion guia ${numeroGuia}`,
      })
      await client.query(`UPDATE etiquetas SET estado = 'ANULADA' WHERE id = $1`, [e.id])
      await client.query(
        `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_origen_id, usuario_id, detalle)
         VALUES ($1, 'ANULADA', $2, $3, $4)`,
        [e.id, e.almacen_id, req.usuario.id, `Anulacion guia ${numeroGuia}: ${motivo}`]
      )
    }

    const actualizada = await client.query(
      `UPDATE guias SET estado = 'ANULADA', motivo_anulacion = $1, anulada_en = NOW(), anulada_por = $2
       WHERE id = $3 RETURNING *`,
      [motivo, req.usuario.id, req.params.id]
    )

    await client.query('COMMIT')
    res.json({ ...actualizada.rows[0], codigos_retirados: ets.rows.length })
  } catch (err) {
    await client.query('ROLLBACK')
    const msgConcurrencia = mensajeConcurrencia(err)
    if (msgConcurrencia) return res.status(503).json({ error: msgConcurrencia })
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
