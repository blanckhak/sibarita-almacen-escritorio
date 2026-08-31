// Tipo del documento con que entra una guia de ingreso. El valor debe coincidir
// con el CHECK de guias.tipo_documento en la base y con la lista del backend
// (guias.js). Se centraliza para no repetir el mapeo en el form, el listado,
// el detalle y la impresion.
export const TIPOS_DOCUMENTO = [
  { value: 'GUIA',    label: 'Guia' },
  { value: 'FACTURA', label: 'Factura' },
  { value: 'BOLETA',  label: 'Boleta' },
  { value: 'OTRO',    label: 'Otro' },
]

export const tipoDocumentoLabel = (valor) =>
  TIPOS_DOCUMENTO.find(t => t.value === valor)?.label ?? (valor || 'Guia')
