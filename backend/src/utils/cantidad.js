// Fase 11 (R6): las cantidades son NUMERIC(12,3) -> se admiten fracciones por
// Kilo / Metro (1.2, 0.3, 3.5). Se rechaza con un 400 limpio: 0, negativos,
// NaN, Infinity y mas de 3 decimales (antes de llegar al INSERT de Postgres).
// Compartido por guias, ajuste manual de inventario y movimientos.
const MAX_DECIMALES = 3
const esCantidadPositiva = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return false
  const s = String(v).trim()
  const dec = s.includes('.') ? (s.split('.')[1] || '').length : 0
  return dec <= MAX_DECIMALES
}

// pg devuelve NUMERIC como string ("5.000"): sumar esos valores con + los
// CONCATENA en vez de sumarlos. Para sumar/restar/comparar cantidades se pasan
// a enteros de milesimas (3 decimales exactos, sin ruido binario de floats).
const aMilesimas = (v) => Math.round(Number(v) * 1000)

// Una cantidad con decimales solo vale si la unidad de medida del producto lo
// permite (unidades_medida.permite_decimal: KG, M, M2, L). Un producto sin
// unidad asignada se trata como entero.
async function unidadPermiteDecimal(conexion, productoId) {
  const r = await conexion.query(
    `SELECT COALESCE(um.permite_decimal, false) AS permite_decimal
     FROM productos p
     LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
     WHERE p.id = $1`,
    [productoId]
  )
  return r.rows.length > 0 && r.rows[0].permite_decimal
}

module.exports = { MAX_DECIMALES, esCantidadPositiva, aMilesimas, unidadPermiteDecimal }
