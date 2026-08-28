// Motivos de una nota de salida. Lista unica para no repetirla en cada pagina
// (NotasSalida.jsx, Reportes.jsx). El valor debe coincidir con el CHECK de
// notas_salida.motivo en la base y con MOTIVOS en backend/src/routes/notasSalida.js.
export const MOTIVOS = [
  { value: 'USO_INTERNO', label: 'Uso interno' },
  { value: 'PRESTAMO',    label: 'Prestamo' },
  { value: 'REPARACION',  label: 'Reparacion' },
  { value: 'DESECHO',     label: 'Desecho' },
  { value: 'OTRO',        label: 'Otro' },
]

export const motivoLabel = (valor) =>
  MOTIVOS.find(m => m.value === valor)?.label ?? valor
