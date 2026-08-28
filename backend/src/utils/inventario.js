const pool = require('../config/db')

// Ajusta el stock de un almacen/producto por un delta (positivo o negativo),
// creando la fila de inventario si todavia no existe. Usado por guias, notas de
// salida (salida/devolucion) y transferencias, para no repetir el mismo upsert.
// `tipo` es 'NUEVO' (default) o 'DEVOLUCION': una devolucion "usada" (Bloque 4)
// reingresa como 'DEVOLUCION' para quedar separada del stock nuevo, aunque
// igual suma al total consolidado.
async function ajustarInventario(client, { almacenId, productoId, delta, descripcion, tipo = 'NUEVO' }) {
  const conexion = client || pool
  const existente = await conexion.query(
    `SELECT id FROM inventario WHERE almacen_id = $1 AND producto_id = $2 AND tipo = $3 LIMIT 1`,
    [almacenId, productoId, tipo]
  )
  if (existente.rows.length > 0) {
    await conexion.query(
      `UPDATE inventario SET cantidad = GREATEST(cantidad + $1, 0) WHERE id = $2`,
      [delta, existente.rows[0].id]
    )
  } else if (delta > 0) {
    await conexion.query(
      `INSERT INTO inventario (almacen_id, producto_id, tipo, cantidad, descripcion)
       VALUES ($1, $2, $3, $4, $5)`,
      [almacenId, productoId, tipo, delta, descripcion || null]
    )
  }
}

module.exports = { ajustarInventario }
