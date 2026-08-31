// Fase 9 (Bloque 7): resumen de stock de un producto en un almacen, mostrado
// en la Orden de Salida. Son dos numeros distintos que conviven en el sistema:
//  - agregado: total de unidades en la tabla `inventario` (NUEVO + DEVOLUCION)
//  - codigos:  cuantas etiquetas individuales siguen EN_ALMACEN
// Se centraliza el formato porque se usa en el buscador de codigos, en las
// lineas ya agregadas, en el detalle de la nota y en la vista de impresion.
export function textoStock(agregado, codigos, { abreviatura = '' } = {}) {
  const partes = []
  if (agregado !== null && agregado !== undefined) {
    partes.push(`${agregado}${abreviatura ? ` ${abreviatura}` : ' u.'} en stock`)
  }
  if (codigos !== null && codigos !== undefined) {
    partes.push(`${codigos} ${codigos === 1 ? 'codigo' : 'codigos'}`)
  }
  return partes.join(' · ')
}
