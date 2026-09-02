const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const { verificarToken, soloRoles } = require('../middlewares/authMiddleware')
const { ajustarInventario } = require('../utils/inventario')
const { marcarSalida } = require('../utils/salida')
const { validarLargos } = require('../utils/texto')
const log = require('../middlewares/logMiddleware')

const MOTIVOS = ['USO_INTERNO', 'PRESTAMO', 'REPARACION', 'DESECHO', 'OTRO']
const PRESENTACIONES = ['CAJA', 'ROLLO', 'BOLSA', 'SACO']

router.get('/', verificarToken, async (req, res) => {
  const { numero_nota, estado } = req.query
  const condiciones = []
  const valores = []

  if (numero_nota) {
    valores.push(`%${numero_nota}%`)
    condiciones.push(`n.numero_nota ILIKE $${valores.length}`)
  }
  if (estado) {
    valores.push(estado)
    condiciones.push(`n.estado = $${valores.length}`)
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : ''

  try {
    const result = await pool.query(`
      SELECT n.id, n.numero_nota, n.seccion, n.persona_responsable, n.motivo,
             n.fecha, n.estado, g.numero_guia,
             u.nombre as usuario_nombre,
             COUNT(d.id)::int as total_lineas
      FROM notas_salida n
      LEFT JOIN guias g ON n.guia_id = g.id
      LEFT JOIN usuarios u ON n.usuario_id = u.id
      LEFT JOIN notas_salida_detalle d ON d.nota_salida_id = n.id
      ${where}
      GROUP BY n.id, g.numero_guia, u.nombre
      ORDER BY n.fecha DESC
    `, valores)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', verificarToken, async (req, res) => {
  try {
    const nota = await pool.query(`
      SELECT n.*, g.numero_guia, u.nombre as usuario_nombre
      FROM notas_salida n
      LEFT JOIN guias g ON n.guia_id = g.id
      LEFT JOIN usuarios u ON n.usuario_id = u.id
      WHERE n.id = $1
    `, [req.params.id])
    if (nota.rows.length === 0) {
      return res.status(404).json({ error: 'Nota de salida no encontrada' })
    }

    const detalle = await pool.query(`
      SELECT d.*, e.codigo as etiqueta_codigo, e.estado as etiqueta_estado,
             e.condicion as etiqueta_condicion, e.almacen_id,
             p.nombre as producto_nombre, a.nombre as almacen_nombre,
             um.abreviatura as unidad_medida_abreviatura,
             dum.nombre as devuelto_unidad_medida_nombre,
             dum.abreviatura as devuelto_unidad_medida_abreviatura,
             en.codigo as etiqueta_devuelta_codigo,
             -- Stock actual del producto en ese almacen (Fase 9, Bloque 7):
             -- lo que queda hoy, no una foto al momento de la salida.
             (SELECT COALESCE(SUM(i.cantidad), 0)::int FROM inventario i
                WHERE i.almacen_id = e.almacen_id AND i.producto_id = e.producto_id) as stock_agregado_actual,
             (SELECT COUNT(*)::int FROM etiquetas e2
                WHERE e2.almacen_id = e.almacen_id AND e2.producto_id = e.producto_id
                  AND e2.estado = 'EN_ALMACEN') as codigos_disponibles_actual
      FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      JOIN productos p ON e.producto_id = p.id
      JOIN almacenes a ON e.almacen_id = a.id
      LEFT JOIN unidades_medida um ON p.unidad_medida_id = um.id
      LEFT JOIN unidades_medida dum ON d.devuelto_unidad_medida_id = dum.id
      LEFT JOIN etiquetas en ON d.etiqueta_devuelta_id = en.id
      WHERE d.nota_salida_id = $1
      ORDER BY d.id
    `, [req.params.id])

    res.json({ ...nota.rows[0], detalle: detalle.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', verificarToken, soloRoles('admin', 'almacen'),
  log('CREAR_NOTA_SALIDA', req => `Responsable ${req.body.persona_responsable}, motivo ${req.body.motivo}, ${Array.isArray(req.body.lineas) ? req.body.lineas.length : 0} codigo(s)`),
  async (req, res) => {
  const { seccion, persona_responsable, motivo, requiere_devolucion, observaciones, lineas } = req.body

  if (!persona_responsable || !persona_responsable.trim()) {
    return res.status(400).json({ error: 'La persona responsable es requerida' })
  }
  const errLargo = validarLargos({
    'seccion': [seccion, 100],
    'persona responsable': [persona_responsable, 150],
  })
  if (errLargo) return res.status(400).json({ error: errLargo })
  if (!MOTIVOS.includes(motivo)) {
    return res.status(400).json({ error: 'Motivo invalido' })
  }
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return res.status(400).json({ error: 'La nota de salida debe incluir al menos un codigo' })
  }
  const etiquetaIds = lineas.map(l => l.etiqueta_id)
  if (new Set(etiquetaIds).size !== etiquetaIds.length) {
    return res.status(400).json({ error: 'Hay codigos repetidos en la nota de salida' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const etiquetas = await client.query(`
      SELECT e.id, e.estado, e.almacen_id, e.producto_id, e.codigo, e.condicion,
             COALESCE(e.cantidad, gi.cantidad) as cantidad, gi.guia_id
      FROM etiquetas e
      JOIN guia_items gi ON e.guia_item_id = gi.id
      WHERE e.id = ANY($1::int[])
      FOR UPDATE
    `, [etiquetaIds])

    if (etiquetas.rows.length !== etiquetaIds.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Uno o mas codigos no existen' })
    }
    const noDisponible = etiquetas.rows.find(e => e.estado !== 'EN_ALMACEN')
    if (noDisponible) {
      await client.query('ROLLBACK')
      // Fase 9: se devuelve el codigo/id en conflicto para que el formulario
      // marque esa linea puntual en vez de un aviso generico. Pasa cuando otra
      // persona saco ese mismo codigo mientras se armaba esta nota.
      return res.status(409).json({
        error: `El codigo ${noDisponible.codigo} ya no esta disponible en almacen`,
        codigo_conflicto: noDisponible.codigo,
        etiqueta_id_conflicto: noDisponible.id,
      })
    }

    const guiaIds = new Set(etiquetas.rows.map(e => e.guia_id))
    const guiaRelacionada = guiaIds.size === 1 ? [...guiaIds][0] : null

    const numeroResult = await client.query(`SELECT nextval('notas_salida_numero_seq') as n`)
    const numeroNota = String(numeroResult.rows[0].n).padStart(6, '0')

    const etiquetasPorId = Object.fromEntries(etiquetas.rows.map(e => [e.id, e]))
    const detallesCalculados = lineas.map(linea => {
      const et = etiquetasPorId[linea.etiqueta_id]
      const pUnitario = linea.p_unitario !== null && linea.p_unitario !== undefined && linea.p_unitario !== ''
        ? Number(linea.p_unitario) : null
      const total = pUnitario !== null ? pUnitario * et.cantidad : null
      return { etiqueta: et, pUnitario, total, observaciones: linea.observaciones?.trim() || null }
    })
    const montoTotal = detallesCalculados.reduce((s, d) => s + (d.total || 0), 0)

    // Aprobacion previa para salidas de alto valor (seccion 14 punto 5, CU-05)
    const parametro = await client.query('SELECT * FROM parametros_aprobacion WHERE activo = true ORDER BY id DESC LIMIT 1')
    const requiereAprobacion = parametro.rows.length > 0 && parametro.rows[0].monto_minimo != null && montoTotal >= Number(parametro.rows[0].monto_minimo)

    const estadoInicial = requiereAprobacion
      ? 'EN_APROBACION'
      : (requiere_devolucion === false ? 'CERRADO' : 'PENDIENTE')

    const notaResult = await client.query(
      `INSERT INTO notas_salida (numero_nota, seccion, persona_responsable, motivo, guia_id, usuario_id, estado, observaciones, requiere_devolucion, fecha_salida)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        numeroNota,
        seccion?.trim() || null,
        persona_responsable.trim(),
        motivo,
        guiaRelacionada,
        req.usuario.id,
        estadoInicial,
        observaciones?.trim() || null,
        requiere_devolucion !== false,
        requiereAprobacion ? null : new Date(),
      ]
    )
    const nota = notaResult.rows[0]

    for (const d of detallesCalculados) {
      await client.query(
        `INSERT INTO notas_salida_detalle (nota_salida_id, etiqueta_id, cantidad, p_unitario, total, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [nota.id, d.etiqueta.id, d.etiqueta.cantidad, d.pUnitario, d.total, d.observaciones]
      )

      // Si queda en aprobacion, el producto todavia no sale fisicamente del almacen (CU-05)
      if (!requiereAprobacion) {
        await marcarSalida(client, d.etiqueta, numeroNota, req.usuario.id)
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ ...nota, numero_guia: null, detalle_generado: lineas.length, monto_total: montoTotal })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// CU-05: el supervisor/admin aprueba una nota que quedo retenida por superar el umbral configurado
router.post('/:id/aprobar', verificarToken, soloRoles('admin', 'almacen'),
  log('APROBAR_NOTA_SALIDA', req => `Nota de salida id ${req.params.id}`),
  async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const nota = await client.query('SELECT * FROM notas_salida WHERE id = $1 FOR UPDATE', [req.params.id])
    if (nota.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Nota de salida no encontrada' })
    }
    if (nota.rows[0].estado !== 'EN_APROBACION') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Esta nota no esta pendiente de aprobacion' })
    }

    const detalle = await client.query(`
      SELECT d.etiqueta_id, e.estado, e.almacen_id, e.producto_id, e.codigo, e.condicion, d.cantidad
      FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      WHERE d.nota_salida_id = $1
      FOR UPDATE OF e
    `, [req.params.id])

    for (const linea of detalle.rows) {
      if (linea.estado !== 'EN_ALMACEN') {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: `El codigo ${linea.codigo} ya no esta disponible en almacen` })
      }
    }

    for (const linea of detalle.rows) {
      await marcarSalida(client, { id: linea.etiqueta_id, almacen_id: linea.almacen_id, producto_id: linea.producto_id, cantidad: linea.cantidad, condicion: linea.condicion }, nota.rows[0].numero_nota, req.usuario.id)
    }

    const nuevoEstado = nota.rows[0].requiere_devolucion ? 'PENDIENTE' : 'CERRADO'
    const actualizada = await client.query(
      'UPDATE notas_salida SET estado = $1, fecha_salida = NOW() WHERE id = $2 RETURNING *',
      [nuevoEstado, req.params.id]
    )

    await client.query('COMMIT')
    res.json(actualizada.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// CU-05 (rechazo): el producto nunca salio, la nota queda cerrada con el motivo del rechazo
router.post('/:id/rechazar', verificarToken, soloRoles('admin', 'almacen'),
  log('RECHAZAR_NOTA_SALIDA', req => `Nota de salida id ${req.params.id}, motivo: ${req.body.motivo || 'sin indicar'}`),
  async (req, res) => {
  const { motivo } = req.body
  try {
    const nota = await pool.query('SELECT * FROM notas_salida WHERE id = $1', [req.params.id])
    if (nota.rows.length === 0) {
      return res.status(404).json({ error: 'Nota de salida no encontrada' })
    }
    if (nota.rows[0].estado !== 'EN_APROBACION') {
      return res.status(400).json({ error: 'Esta nota no esta pendiente de aprobacion' })
    }

    const observacionesFinal = [nota.rows[0].observaciones, `[Rechazada] ${motivo || 'Sin motivo indicado'}`]
      .filter(Boolean).join(' — ')

    const actualizada = await pool.query(
      `UPDATE notas_salida SET estado = 'CERRADO', observaciones = $1 WHERE id = $2 RETURNING *`,
      [observacionesFinal, req.params.id]
    )
    res.json(actualizada.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// CU-03: la devolucion solo puede registrarse contra una nota de salida valida y vigente.
// Bloque 4: cada linea puede volver como 'NUEVO' (el mismo codigo vuelve a
// EN_ALMACEN, stock NUEVO) o 'USADO' (el codigo viejo pasa a REEMPLAZADA y se
// genera un codigo nuevo con condicion USADO que reingresa como stock DEVOLUCION).
router.post('/:id/devolucion', verificarToken, soloRoles('admin', 'almacen'),
  log('REGISTRAR_DEVOLUCION', req => `Nota de salida id ${req.params.id}, ${Array.isArray(req.body.etiqueta_ids) ? req.body.etiqueta_ids.length : 0} codigo(s), condicion ${req.body.condicion === 'USADO' ? 'USADO' : 'NUEVO'}`),
  async (req, res) => {
  const { etiqueta_ids } = req.body
  const condicion = req.body.condicion === 'USADO' ? 'USADO' : 'NUEVO'
  if (!Array.isArray(etiqueta_ids) || etiqueta_ids.length === 0) {
    return res.status(400).json({ error: 'Selecciona al menos un codigo para devolver' })
  }

  // Panel de devolucion USADA: cantidad/unidad reales con que vuelve el item.
  // Solo aplican a condicion USADO y a una sola linea a la vez (asi lo manda el
  // modal). devuelto_cantidad puede ser menor a la que salio; devuelto_unidad_
  // medida_id es opcional (Caja, Rollo, Kilogramo, etc del catalogo unidades_
  // medida). Se ignoran si la devolucion es NUEVA.
  let devueltoCantidad = null
  let devueltoUnidadMedidaId = null
  let devueltoPresentacion = null
  let devueltoObs = null
  if (condicion === 'USADO') {
    const rawCant = req.body.devuelto_cantidad
    if (rawCant !== undefined && rawCant !== null && rawCant !== '') {
      const n = Number(rawCant)
      if (!Number.isInteger(n) || n <= 0) {
        return res.status(400).json({ error: 'La cantidad que vuelve debe ser un entero mayor a 0' })
      }
      devueltoCantidad = n
    }
    const rawUnidad = req.body.devuelto_unidad_medida_id
    if (rawUnidad !== undefined && rawUnidad !== null && rawUnidad !== '') {
      const u = Number(rawUnidad)
      if (!Number.isInteger(u) || u <= 0) {
        return res.status(400).json({ error: 'Unidad de medida invalida' })
      }
      devueltoUnidadMedidaId = u
    }
    if (req.body.devuelto_presentacion !== undefined && req.body.devuelto_presentacion !== null && req.body.devuelto_presentacion !== '') {
      if (!PRESENTACIONES.includes(req.body.devuelto_presentacion)) {
        return res.status(400).json({ error: 'Presentacion invalida' })
      }
      devueltoPresentacion = req.body.devuelto_presentacion
    }
    if (typeof req.body.devuelto_obs === 'string' && req.body.devuelto_obs.trim()) {
      devueltoObs = req.body.devuelto_obs.trim()
    }
    if ((devueltoCantidad !== null || devueltoUnidadMedidaId !== null || devueltoPresentacion !== null || devueltoObs !== null) && etiqueta_ids.length !== 1) {
      return res.status(400).json({ error: 'Los datos de la devolucion usada se registran de a un codigo por vez' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let devueltoUnidadNombre = null
    if (devueltoUnidadMedidaId != null) {
      const um = await client.query('SELECT nombre FROM unidades_medida WHERE id = $1', [devueltoUnidadMedidaId])
      if (um.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'La unidad de medida indicada no existe' })
      }
      devueltoUnidadNombre = um.rows[0].nombre
    }

    const nota = await client.query('SELECT * FROM notas_salida WHERE id = $1 FOR UPDATE', [req.params.id])
    if (nota.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Nota de salida no encontrada' })
    }
    if (nota.rows[0].estado === 'CERRADO') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Esta nota de salida no requiere devolucion' })
    }
    if (nota.rows[0].estado === 'DEVUELTO') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Todos los codigos de esta nota ya fueron devueltos' })
    }
    if (nota.rows[0].estado === 'EN_APROBACION') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Esta nota esta pendiente de aprobacion; el producto todavia no ha salido del almacen' })
    }

    const detalle = await client.query(`
      SELECT d.id as detalle_id, d.etiqueta_id, d.cantidad,
             e.estado, e.almacen_id, e.producto_id, e.codigo, e.guia_item_id, e.condicion
      FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      WHERE d.nota_salida_id = $1
      FOR UPDATE OF e
    `, [req.params.id])

    const detallePorId = Object.fromEntries(detalle.rows.map(d => [d.etiqueta_id, d]))
    for (const eid of etiqueta_ids) {
      const linea = detallePorId[eid]
      if (!linea) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `El codigo ${eid} no pertenece a esta nota de salida` })
      }
      if (linea.estado !== 'SALIO') {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `El codigo ${linea.codigo} ya fue devuelto` })
      }
    }

    const numeroNota = nota.rows[0].numero_nota
    const codigosNuevos = []

    for (const eid of etiqueta_ids) {
      const linea = detallePorId[eid]

      if (condicion === 'USADO') {
        // Cantidad real que vuelve: la del panel si se indico, si no la que
        // salio. No puede ser mayor a lo que salio.
        const cantDevuelta = devueltoCantidad != null ? devueltoCantidad : linea.cantidad
        if (cantDevuelta > linea.cantidad) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: `No puede volver mas de lo que salio (salieron ${linea.cantidad})` })
        }

        // El codigo viejo queda retirado; el item fisico ahora vive bajo un
        // codigo nuevo marcado USADO, con su propia cantidad, que reingresa
        // como stock DEVOLUCION.
        await client.query(`UPDATE etiquetas SET estado = 'REEMPLAZADA' WHERE id = $1`, [eid])

        const codigoResult = await client.query(`SELECT nextval('etiquetas_codigo_seq') as codigo`)
        const codigoNuevo = codigoResult.rows[0].codigo
        const nuevaEtiqueta = await client.query(
          `INSERT INTO etiquetas (codigo, guia_item_id, producto_id, almacen_id, estado, condicion, cantidad)
           VALUES ($1, $2, $3, $4, 'EN_ALMACEN', 'USADO', $5) RETURNING id`,
          [codigoNuevo, linea.guia_item_id, linea.producto_id, linea.almacen_id, cantDevuelta]
        )
        const nuevaEtiquetaId = nuevaEtiqueta.rows[0].id
        codigosNuevos.push({ codigo_viejo: linea.codigo, codigo_nuevo: Number(codigoNuevo) })

        const detExtra = [
          cantDevuelta !== linea.cantidad ? `cantidad ${cantDevuelta} de ${linea.cantidad}` : null,
          devueltoPresentacion ? `presentacion ${devueltoPresentacion}` : null,
          devueltoUnidadNombre ? `unidad ${devueltoUnidadNombre}` : null,
          devueltoObs ? `obs: ${devueltoObs}` : null,
        ].filter(Boolean).join(', ')
        await client.query(
          `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_origen_id, usuario_id, detalle)
           VALUES ($1, 'REEMPLAZADA', $2, $3, $4)`,
          [eid, linea.almacen_id, req.usuario.id, `Devuelta usada en nota ${numeroNota}, reemplazada por codigo ${codigoNuevo}`]
        )
        await client.query(
          `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_destino_id, usuario_id, detalle)
           VALUES ($1, 'GENERADA', $2, $3, $4)`,
          [nuevaEtiquetaId, linea.almacen_id, req.usuario.id,
           `Reingreso por devolucion usada del codigo ${linea.codigo}, nota ${numeroNota}${detExtra ? ` (${detExtra})` : ''}`]
        )

        await ajustarInventario(client, {
          almacenId: linea.almacen_id,
          productoId: linea.producto_id,
          delta: cantDevuelta,
          descripcion: `Devolucion usada nota ${numeroNota}`,
          tipo: 'DEVOLUCION',
        })

        await client.query(
          `UPDATE notas_salida_detalle
           SET devuelto_condicion = 'USADO', devuelto_en = NOW(), etiqueta_devuelta_id = $1,
               devuelto_cantidad = $2, devuelto_unidad_medida_id = $3, devuelto_presentacion = $4, devuelto_obs = $5
           WHERE id = $6`,
          [nuevaEtiquetaId, cantDevuelta, devueltoUnidadMedidaId, devueltoPresentacion, devueltoObs, linea.detalle_id]
        )
      } else {
        await client.query(`UPDATE etiquetas SET estado = 'EN_ALMACEN' WHERE id = $1`, [eid])

        await client.query(
          `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_destino_id, usuario_id, detalle)
           VALUES ($1, 'DEVOLVIO', $2, $3, $4)`,
          [eid, linea.almacen_id, req.usuario.id, `Devolucion nota ${numeroNota}`]
        )

        // Un codigo que ya era USADO (devolucion previa) mantiene su stock en el
        // bucket DEVOLUCION al volver; uno normal, en el NUEVO.
        await ajustarInventario(client, {
          almacenId: linea.almacen_id,
          productoId: linea.producto_id,
          delta: linea.cantidad,
          descripcion: 'Devolucion nota de salida',
          tipo: linea.condicion === 'USADO' ? 'DEVOLUCION' : 'NUEVO',
        })

        await client.query(
          `UPDATE notas_salida_detalle
           SET devuelto_condicion = 'NUEVO', devuelto_en = NOW()
           WHERE id = $1`,
          [linea.detalle_id]
        )
      }
    }

    const pendientes = await client.query(`
      SELECT COUNT(*) FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      WHERE d.nota_salida_id = $1 AND e.estado = 'SALIO'
    `, [req.params.id])
    const nuevoEstado = parseInt(pendientes.rows[0].count) === 0 ? 'DEVUELTO' : 'PENDIENTE'

    const actualizada = await client.query(
      'UPDATE notas_salida SET estado = $1 WHERE id = $2 RETURNING *',
      [nuevoEstado, req.params.id]
    )

    await client.query('COMMIT')
    res.json({ ...actualizada.rows[0], condicion, codigos_nuevos: codigosNuevos })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Corrige los datos de una devolucion USADA ya registrada (cantidad, unidad,
// observacion), sin rehacer el retiro del codigo viejo ni la generacion del
// nuevo. Si la cantidad cambia, se ajusta el inventario y la cantidad del
// codigo nuevo por la diferencia, para que sigan cuadrando con la nota.
router.put('/:id/lineas/:etiquetaId/devolucion-usada', verificarToken, soloRoles('admin', 'almacen'),
  log('EDITAR_DEVOLUCION_USADA', req => `Nota de salida id ${req.params.id}, etiqueta id ${req.params.etiquetaId}`),
  async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const linea = await client.query(`
      SELECT d.id as detalle_id, d.cantidad as cantidad_salida, d.devuelto_cantidad,
             d.devuelto_condicion, d.etiqueta_devuelta_id,
             en.almacen_id, en.producto_id, en.estado as etiqueta_devuelta_estado
      FROM notas_salida_detalle d
      LEFT JOIN etiquetas en ON d.etiqueta_devuelta_id = en.id
      WHERE d.nota_salida_id = $1 AND d.etiqueta_id = $2
      FOR UPDATE OF d
    `, [req.params.id, req.params.etiquetaId])
    if (linea.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Ese codigo no pertenece a esta nota de salida' })
    }
    const l = linea.rows[0]
    if (l.devuelto_condicion !== 'USADO') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Ese codigo no tiene una devolucion usada registrada' })
    }
    if (l.etiqueta_devuelta_estado !== 'EN_ALMACEN') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El codigo nuevo generado por esa devolucion ya no esta en almacen (fue transferido o usado); no se puede corregir' })
    }

    const rawCant = req.body.devuelto_cantidad
    if (rawCant === undefined || rawCant === null || rawCant === '') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'La cantidad que vuelve es requerida' })
    }
    const nuevaCantidad = Number(rawCant)
    if (!Number.isInteger(nuevaCantidad) || nuevaCantidad <= 0 || nuevaCantidad > l.cantidad_salida) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `La cantidad que vuelve debe estar entre 1 y ${l.cantidad_salida}` })
    }

    let unidadMedidaId = null
    const rawUnidad = req.body.devuelto_unidad_medida_id
    if (rawUnidad !== undefined && rawUnidad !== null && rawUnidad !== '') {
      const u = Number(rawUnidad)
      if (!Number.isInteger(u) || u <= 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Unidad de medida invalida' })
      }
      const um = await client.query('SELECT id FROM unidades_medida WHERE id = $1', [u])
      if (um.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'La unidad de medida indicada no existe' })
      }
      unidadMedidaId = u
    }
    let presentacion = null
    if (req.body.devuelto_presentacion !== undefined && req.body.devuelto_presentacion !== null && req.body.devuelto_presentacion !== '') {
      if (!PRESENTACIONES.includes(req.body.devuelto_presentacion)) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Presentacion invalida' })
      }
      presentacion = req.body.devuelto_presentacion
    }
    const obs = typeof req.body.devuelto_obs === 'string' && req.body.devuelto_obs.trim()
      ? req.body.devuelto_obs.trim() : null

    const delta = nuevaCantidad - l.devuelto_cantidad
    if (delta !== 0) {
      await client.query('UPDATE etiquetas SET cantidad = $1 WHERE id = $2', [nuevaCantidad, l.etiqueta_devuelta_id])
      await ajustarInventario(client, {
        almacenId: l.almacen_id,
        productoId: l.producto_id,
        delta,
        descripcion: `Correccion de cantidad devolucion usada nota ${req.params.id}`,
        tipo: 'DEVOLUCION',
      })
      await client.query(
        `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_origen_id, usuario_id, detalle)
         VALUES ($1, 'CORREGIDA', $2, $3, $4)`,
        [l.etiqueta_devuelta_id, l.almacen_id, req.usuario.id,
         `Cantidad de devolucion usada corregida de ${l.devuelto_cantidad} a ${nuevaCantidad}`]
      )
    }

    await client.query(
      `UPDATE notas_salida_detalle
       SET devuelto_cantidad = $1, devuelto_unidad_medida_id = $2, devuelto_presentacion = $3, devuelto_obs = $4
       WHERE id = $5`,
      [nuevaCantidad, unidadMedidaId, presentacion, obs, l.detalle_id]
    )

    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Registra que se reviso un codigo y todavia NO lo han devuelto: no cambia
// ningun estado (la etiqueta sigue SALIO, la nota sigue PENDIENTE), solo
// queda anotado en la auditoria para seguimiento.
router.post('/:id/lineas/:etiquetaId/no-devuelto', verificarToken, soloRoles('admin', 'almacen'),
  log('MARCAR_NO_DEVUELTO', req => `Nota de salida id ${req.params.id}, etiqueta id ${req.params.etiquetaId}`),
  async (req, res) => {
  try {
    const linea = await pool.query(`
      SELECT d.id, e.estado
      FROM notas_salida_detalle d
      JOIN etiquetas e ON d.etiqueta_id = e.id
      WHERE d.nota_salida_id = $1 AND d.etiqueta_id = $2
    `, [req.params.id, req.params.etiquetaId])
    if (linea.rows.length === 0) {
      return res.status(404).json({ error: 'Ese codigo no pertenece a esta nota de salida' })
    }
    if (linea.rows[0].estado !== 'SALIO') {
      return res.status(400).json({ error: 'Ese codigo no esta pendiente de devolucion' })
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
