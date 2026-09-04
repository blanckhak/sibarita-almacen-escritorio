// Traduce codigos de error de Postgres relacionados a choques de concurrencia
// (dos usuarios tocando el mismo registro a la vez) a un mensaje que el
// usuario entienda, en vez del mensaje crudo de Postgres.
// Devuelve null si el error no es de este tipo (el caller sigue con su
// manejo normal, p.ej. 23505 o el 500 generico).
function mensajeConcurrencia(err) {
  if (err.code === '55P03') {
    // lock_timeout (db.js): esperamos el candado de una fila mas de 8s.
    return 'Otro usuario esta guardando algo sobre el mismo producto/almacen en este momento. Espera unos segundos e intenta de nuevo.'
  }
  if (err.code === '40P01') {
    // deadlock_detected: dos transacciones se trabaron entre si.
    return 'Choque con otra operacion que se estaba guardando al mismo tiempo. Intenta de nuevo.'
  }
  if (err.code === '57014') {
    // statement_timeout (db.js): la consulta tardo mas de 20s.
    return 'La operacion tardo demasiado y se cancelo. Intenta de nuevo.'
  }
  return null
}

module.exports = { mensajeConcurrencia }
