const pool = require('../config/db')

// Fase 15 (R7-b): un periodo CERRADO esta congelado -> no se puede editar,
// anular ni dar salida/devolucion a nada que pertenezca a el. Devuelve true si
// el periodo dado esta CERRADO. periodo_id NULL (registros viejos) = no bloquea.
async function periodoCerrado(clientOrPool, periodoId) {
  if (!periodoId) return false
  const r = await (clientOrPool || pool).query('SELECT estado FROM periodos WHERE id = $1', [periodoId])
  return r.rows[0]?.estado === 'CERRADO'
}

// ?periodo_id=5 o ?periodo_id=5,10,15 (el mismo periodo en los 3 almacenes).
// Devuelve el arreglo de ids para usar con `= ANY($n::int[])`, o null si no
// vino o no es valido (en ese caso no se filtra por periodo).
function idsPeriodo(valor) {
  if (!valor) return null
  const ids = String(valor).split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0 || !ids.every(s => /^\d+$/.test(s))) return null
  return ids.map(Number)
}

module.exports = { periodoCerrado, idsPeriodo }
