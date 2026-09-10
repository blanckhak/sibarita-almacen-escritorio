const pool = require('../config/db')

// Fase 15 (R7-b): un periodo CERRADO esta congelado -> no se puede editar,
// anular ni dar salida/devolucion a nada que pertenezca a el. Devuelve true si
// el periodo dado esta CERRADO. periodo_id NULL (registros viejos) = no bloquea.
async function periodoCerrado(clientOrPool, periodoId) {
  if (!periodoId) return false
  const r = await (clientOrPool || pool).query('SELECT estado FROM periodos WHERE id = $1', [periodoId])
  return r.rows[0]?.estado === 'CERRADO'
}

module.exports = { periodoCerrado }
