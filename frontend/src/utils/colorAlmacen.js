// Color por almacen (pedido del cliente): el codigo de un producto se muestra
// con el color del almacen donde esta.
//   MALSA    -> amarillo
//   JOPISA   -> naranja
//   INDELPAS -> verde claro
// `bg`/`text` son clases Tailwind para pantalla; `hex` es para lo que se
// imprime (fondo de la banda del codigo en la etiqueta, chip en los formatos).
export const COLOR_ALMACEN = {
  MALSA:    { bg: 'bg-yellow-300', text: 'text-yellow-900', hex: '#fde047', hexText: '#713f12' },
  JOPISA:   { bg: 'bg-orange-300', text: 'text-orange-900', hex: '#fdba74', hexText: '#7c2d12' },
  INDELPAS: { bg: 'bg-green-200',  text: 'text-green-900',  hex: '#bbf7d0', hexText: '#14532d' },
}

const NEUTRO = { bg: 'bg-gray-200', text: 'text-gray-700', hex: '#e5e7eb', hexText: '#374151' }

export const colorAlmacen = (nombre) => COLOR_ALMACEN[nombre] || NEUTRO

// Clases Tailwind (fondo + texto) para un chip del codigo en pantalla. Una
// sola llamada, para no repetir el lookup en cada className.
export const claseCodigoAlmacen = (nombre) => {
  const c = colorAlmacen(nombre)
  return `${c.bg} ${c.text}`
}

// Estilo inline para lo impreso: fuerza el color de fondo aunque el navegador
// no imprima fondos por defecto (print-color-adjust).
export const estiloCodigoImpreso = (nombre) => {
  const c = colorAlmacen(nombre)
  return {
    backgroundColor: c.hex,
    color: c.hexText,
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  }
}
