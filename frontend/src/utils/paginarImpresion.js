// Los talonarios fisicos de MALSA (Nota de Ingreso, Nota de Salida, Solicitud
// de Materiales) tienen un cuadro de detalle de 6 filas. Si un documento tiene
// mas de 6 lineas se imprime en varias hojas, cada una con el mismo encabezado.
// enPaginas parte las lineas en grupos de `porPagina` (6) y rellena la ultima
// hoja con filas vacias hasta completar el cuadro.
export const FILAS_POR_PAGINA = 6

export function enPaginas(lineas, porPagina = FILAS_POR_PAGINA) {
  const arr = Array.isArray(lineas) ? lineas : []
  const paginas = []
  for (let i = 0; i < arr.length; i += porPagina) {
    paginas.push(arr.slice(i, i + porPagina))
  }
  if (paginas.length === 0) paginas.push([])
  // Rellenar la ultima hoja con huecos (null) para que el cuadro siempre
  // muestre las 6 filas.
  const ultima = paginas[paginas.length - 1]
  while (ultima.length < porPagina) ultima.push(null)
  return paginas
}
