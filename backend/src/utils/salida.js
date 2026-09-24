const { ajustarInventario } = require('./inventario')

const redondear = (n) => Math.round(Number(n) * 1000) / 1000

// Marca la salida de una etiqueta: registra historial y descuenta inventario.
// Usado por Notas de Salida normales y por la salida automatica de guias hacia
// Compras Diarias (Bloque 6).
// etiqueta.cantidad = lo que el codigo tiene HOY en almacen. cantidadSalida
// (24/09, salida parcial) = lo que sale; por defecto todo. Si sale menos, el
// codigo sigue EN_ALMACEN con el resto (etiquetas.cantidad); si sale todo pasa
// a SALIO como siempre.
async function marcarSalida(client, etiqueta, numeroNota, usuarioId, cantidadSalida = etiqueta.cantidad) {
  const sale = redondear(cantidadSalida)
  const resto = redondear(Number(etiqueta.cantidad) - sale)

  if (resto > 0) {
    await client.query(`UPDATE etiquetas SET cantidad = $1 WHERE id = $2`, [resto, etiqueta.id])
  } else {
    await client.query(`UPDATE etiquetas SET estado = 'SALIO' WHERE id = $1`, [etiqueta.id])
  }

  await client.query(
    `INSERT INTO etiqueta_historial (etiqueta_id, evento, almacen_origen_id, usuario_id, detalle)
     VALUES ($1, 'SALIO', $2, $3, $4)`,
    [etiqueta.id, etiqueta.almacen_id, usuarioId,
     `Nota de salida ${numeroNota}${resto > 0 ? ` (salieron ${sale}, quedan ${resto})` : ''}`]
  )

  // Un codigo USADO (devolucion) tiene su stock en el bucket DEVOLUCION; al
  // volver a salir hay que descontarlo de ahi, no del stock NUEVO.
  await ajustarInventario(client, {
    almacenId: etiqueta.almacen_id,
    productoId: etiqueta.producto_id,
    delta: -sale,
    tipo: etiqueta.condicion === 'USADO' ? 'DEVOLUCION' : 'NUEVO',
  })
}

// Lineas de notas de salida de este codigo que siguen AFUERA: nota PENDIENTE de
// devolucion y linea sin devolver. Con la salida parcial un codigo puede estar
// EN_ALMACEN y a la vez tener unidades afuera en una o varias notas, asi que
// "pendiente" se decide por linea, no por el estado del codigo.
async function lineasAfuera(client, etiquetaId, exceptoDetalleId = null) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM notas_salida_detalle d
     JOIN notas_salida n ON n.id = d.nota_salida_id
     WHERE d.etiqueta_id = $1 AND d.devuelto_condicion IS NULL
       AND n.estado = 'PENDIENTE' AND d.id IS DISTINCT FROM $2::int`,
    [etiquetaId, exceptoDetalleId]
  )
  return r.rows[0].n
}

// Crea una Nota de Salida ya CERRADA (sin devolucion) para UNA O VARIAS
// etiquetas juntas, y las marca como salida. Usada cuando una guia entrega
// directo a Compras Diarias (Bloque 6): motivo fijo USO_INTERNO,
// seccion = destino. Varias lineas de la misma guia con el mismo destino y
// la misma persona que retira quedan agrupadas en UNA sola nota (no una por
// producto).
async function crearNotaSalidaAutomatica(client, { guiaId, etiquetas, seccion, personaResponsable, observaciones, usuarioId, periodoId = null }) {
  const numeroResult = await client.query(`SELECT nextval('notas_salida_numero_seq') as n`)
  const numeroNota = String(numeroResult.rows[0].n).padStart(6, '0')

  const notaResult = await client.query(
    `INSERT INTO notas_salida (numero_nota, seccion, persona_responsable, motivo, guia_id, usuario_id, estado, observaciones, requiere_devolucion, fecha_salida, periodo_id)
     VALUES ($1, $2, $3, 'USO_INTERNO', $4, $5, 'CERRADO', $6, false, NOW(), $7) RETURNING *`,
    [numeroNota, seccion, personaResponsable, guiaId, usuarioId, observaciones || null, periodoId]
  )
  const nota = notaResult.rows[0]

  for (const etiqueta of etiquetas) {
    await client.query(
      `INSERT INTO notas_salida_detalle (nota_salida_id, etiqueta_id, cantidad)
       VALUES ($1, $2, $3)`,
      [nota.id, etiqueta.id, etiqueta.cantidad]
    )
    await marcarSalida(client, etiqueta, numeroNota, usuarioId)
  }

  return nota
}

// Fase 13 (R3): Nota de Salida ya CERRADA para uno o varios servicios EXTERNO
// de una guia. No hay etiquetas ni inventario: cada linea guarda solo la
// descripcion del servicio y la cantidad. seccion 'Servicios', motivo
// USO_INTERNO, sin devolucion.
async function crearNotaSalidaServicios(client, { guiaId, servicios, usuarioId, periodoId = null }) {
  const numeroResult = await client.query(`SELECT nextval('notas_salida_numero_seq') as n`)
  const numeroNota = String(numeroResult.rows[0].n).padStart(6, '0')

  const notaResult = await client.query(
    `INSERT INTO notas_salida (numero_nota, seccion, persona_responsable, motivo, guia_id, usuario_id, estado, requiere_devolucion, fecha_salida, periodo_id)
     VALUES ($1, 'Servicios', 'SERVICIO EXTERNO', 'USO_INTERNO', $2, $3, 'CERRADO', false, NOW(), $4) RETURNING *`,
    [numeroNota, guiaId, usuarioId, periodoId]
  )
  const nota = notaResult.rows[0]

  for (const s of servicios) {
    await client.query(
      `INSERT INTO notas_salida_detalle (nota_salida_id, etiqueta_id, cantidad, descripcion_servicio)
       VALUES ($1, NULL, $2, $3)`,
      [nota.id, s.cantidad, s.descripcion]
    )
  }

  return nota
}

module.exports = { marcarSalida, lineasAfuera, crearNotaSalidaAutomatica, crearNotaSalidaServicios }
