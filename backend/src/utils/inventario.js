const pool = require('../config/db')

// Ajusta el stock NUEVO de un almacen/producto por un delta (positivo o negativo),
// creando la fila de inventario si todavia no existe. Usado por guias, notas de
// salida (salida/devolucion) y transferencias, para no repetir el mismo upsert.
async function ajustarInventario(client, { almacenId, productoId, delta, descripcion }) {
  const conexion = client || pool
  const existente = await conexion.query(
    `SELECT id FROM inventario WHERE almacen_id = $1 AND producto_id = $2 AND tipo = 'NUEVO' LIMIT 1`,
    [almacenId, productoId]
  )
  if (existente.rows.length > 0) {
    await conexion.query(
      `UPDATE inventario SET cantidad = GREATEST(cantidad + $1, 0) WHERE id = $2`,
      [delta, existente.rows[0].id]
    )
  } else if (delta > 0) {
    await conexion.query(
      `INSERT INTO inventario (almacen_id, producto_id, tipo, cantidad, descripcion)
       VALUES ($1, $2, 'NUEVO', $3, $4)`,
      [almacenId, productoId, delta, descripcion || null]
    )
  }
}

module.exports = { ajustarInventario }
