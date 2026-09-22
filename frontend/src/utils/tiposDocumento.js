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

// Etiqueta larga para las 2 referencias de la Nota de Ingreso (guia_remision /
// factura): cada una puede ser Guia de Remision, Factura o Boleta segun lo
// que haya traido el proveedor -- "GUIA" sola queda ambigua ahi, por eso el
// nombre completo solo en este caso.
const TIPO_REF_LABEL = { GUIA: 'GUIA DE REMISION', FACTURA: 'FACTURA', BOLETA: 'BOLETA', OTRO: 'OTRO' }
export const tipoDocumentoRefLabel = (valor) => TIPO_REF_LABEL[valor] || 'GUIA DE REMISION'

// Misma idea, en minusculas para las tarjetas de pantalla (no el impreso).
const TIPO_REF_LABEL_UI = { GUIA: 'Guia de Remision', FACTURA: 'Factura', BOLETA: 'Boleta', OTRO: 'Otro' }
export const tipoDocumentoRefLabelUI = (valor) => TIPO_REF_LABEL_UI[valor] || 'Guia de Remision'
