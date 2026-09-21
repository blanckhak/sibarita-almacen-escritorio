const pool = require('../config/db')

// Ajusta el stock de un almacen/producto por un delta (positivo o negativo),
// creando la fila de inventario si todavia no existe. Usado por guias, notas de
// salida (salida/devolucion) y transferencias, para no repetir el mismo upsert.
// `tipo` es 'NUEVO' (default) o 'DEVOLUCION': una devolucion "usada" (Bloque 4)
// reingresa como 'DEVOLUCION' para quedar separada del stock nuevo, aunque
// igual suma al total consolidado.
async function ajustarInventario(client, { almacenId, productoId, delta, descripcion, tipo = 'NUEVO' }) {
  const conexion = client || pool
  // Upsert atomico (requiere el UNIQUE de setup.js:
  // inventario_almacen_producto_tipo_unique). Antes era un SELECT para ver
  // si existia + INSERT/UPDATE segun el resultado: dos requests concurrentes
  // para el mismo (almacen,producto,tipo) que TODAVIA no existia podian
  // pasar los dos por "no existe" y terminar creando 2 filas duplicadas en
  // vez de una sola. Con ON CONFLICT, Postgres serializa la operacion sola.
  await conexion.query(
    `INSERT INTO inventario (almacen_id, producto_id, tipo, cantidad, descripcion)
     VALUES ($1, $2, $3, GREATEST($4, 0), $5)
     ON CONFLICT (almacen_id, producto_id, tipo)
     DO UPDATE SET cantidad = GREATEST(inventario.cantidad + $4, 0)`,
    [almacenId, productoId, tipo, delta, descripcion || null]
  )
}

module.exports = { ajustarInventario }
