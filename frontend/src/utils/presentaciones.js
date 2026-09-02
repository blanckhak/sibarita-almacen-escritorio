// Presentacion fisica en la que vuelve una devolucion usada (aparte de la
// unidad de medida). El valor debe coincidir con el CHECK de
// notas_salida_detalle.devuelto_presentacion en la base y con la lista del
// backend (notasSalida.js).
export const PRESENTACIONES = [
  { value: 'CAJA',  label: 'Caja' },
  { value: 'ROLLO', label: 'Rollo' },
  { value: 'BOLSA', label: 'Bolsa' },
  { value: 'SACO',  label: 'Saco' },
]

export const presentacionLabel = (valor) =>
  PRESENTACIONES.find(p => p.value === valor)?.label ?? valor ?? null
