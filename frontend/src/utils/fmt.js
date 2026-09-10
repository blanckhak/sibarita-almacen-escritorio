// Fase 11 (R6): las cantidades pasaron a NUMERIC(12,3) y pueden venir con
// decimales (Kilo, Metro) o como string desde la API. fmtCantidad las muestra
// sin ceros de mas ("3.500" -> "3.5", 3 -> "3", "0.30" -> "0.3"), redondeadas
// a 3 decimales. Devuelve "—" si el valor no es un numero valido.
export function fmtCantidad(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return String(Math.round(n * 1000) / 1000)
}

// Suma de una lista de cantidades (partidas, lineas) redondeada a 3 decimales,
// para que sumar floats (0.1 + 0.2) no arrastre ruido binario en la pantalla.
export function sumarCantidades(valores) {
  const s = (valores || []).reduce((acc, v) => acc + (Number(v) || 0), 0)
  return Math.round(s * 1000) / 1000
}
