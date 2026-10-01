// Nota de Devolucion de Activos enlazada a una Nota de Salida. Cada linea que
// se marca "Devuelto" en la nota de salida queda tambien como renglon de una
// nota de devolucion (notas_desuso con nota_salida_id). Las devoluciones de
// la misma nota de salida, del mismo almacen y del mismo dia van en la misma
// nota de devolucion (un papel por entrega); otro dia abre una nota nueva.

// Agrega la linea `detalleId` (notas_salida_detalle) a la nota de devolucion
// que le toca, creandola si no existe. Debe llamarse dentro de la transaccion
// que registra la devolucion. `fecha` = cuando volvio (NOW() si es null);
// `areaMaquina` = AREA - MAQUINA del renglon impreso (opcional).
// Devuelve { id, numero_nota } de la nota de devolucion.
async function registrarEnNotaDevolucion(client, { detalleId, usuarioId, fecha = null, areaMaquina = null }) {
  const l = await client.query(`
    SELECT d.id, d.nota_salida_id, d.cantidad::float8 as cantidad,
           d.devuelto_cantidad::float8 as devuelto_cantidad, d.devuelto_unidad_medida_id,
           e.almacen_id, p.nombre as producto_nombre, p.unidad_medida_id,
           n.numero_nota, n.seccion, n.persona_responsable, n.periodo_id
    FROM notas_salida_detalle d
    JOIN notas_salida n ON d.nota_salida_id = n.id
    JOIN etiquetas e ON d.etiqueta_id = e.id
    JOIN productos p ON e.producto_id = p.id
    WHERE d.id = $1
  `, [detalleId])
  const linea = l.rows[0]
  if (!linea) return null

  const cuando = fecha || new Date()
  const existente = await client.query(`
    SELECT id, numero_nota FROM notas_desuso
    WHERE nota_salida_id = $1 AND almacen_id = $2 AND estado = 'VIGENTE'
      AND fecha::date = $3::timestamp::date
    ORDER BY id LIMIT 1
    FOR UPDATE
  `, [linea.nota_salida_id, linea.almacen_id, cuando])

  let nota = existente.rows[0]
  if (!nota) {
    const num = await client.query(`SELECT nextval('notas_desuso_numero_seq') as n`)
    const creada = await client.query(
      `INSERT INTO notas_desuso (numero_nota, seccion, persona_responsable, nota_salida_ref, nota_salida_id,
                                 almacen_id, usuario_id, periodo_id, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, numero_nota`,
      [String(num.rows[0].n).padStart(6, '0'), linea.seccion, linea.persona_responsable,
       linea.numero_nota, linea.nota_salida_id, linea.almacen_id, usuarioId, linea.periodo_id, cuando]
    )
    nota = creada.rows[0]
  }

  await client.query(
    `INSERT INTO notas_desuso_detalle (nota_desuso_id, nota_salida_detalle_id, descripcion, cantidad, unidad_medida_id, area_maquina)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [nota.id, linea.id, String(linea.producto_nombre).slice(0, 200),
     linea.devuelto_cantidad != null ? linea.devuelto_cantidad : linea.cantidad,
     linea.devuelto_unidad_medida_id || linea.unidad_medida_id || null,
     areaMaquina]
  )
  return nota
}

// Corrige cantidad/unidad del renglon enlazado cuando se edita una
// devolucion usada ya registrada.
async function actualizarRenglonDevolucion(client, { detalleId, cantidad, unidadMedidaId }) {
  await client.query(
    `UPDATE notas_desuso_detalle dd
        SET cantidad = $1,
            unidad_medida_id = COALESCE($2, (SELECT p.unidad_medida_id FROM notas_salida_detalle d
                                               JOIN etiquetas e ON d.etiqueta_id = e.id
                                               JOIN productos p ON e.producto_id = p.id
                                              WHERE d.id = dd.nota_salida_detalle_id))
      WHERE dd.nota_salida_detalle_id = $3`,
    [cantidad, unidadMedidaId, detalleId]
  )
}

module.exports = { registrarEnNotaDevolucion, actualizarRenglonDevolucion }
