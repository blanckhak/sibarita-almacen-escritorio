// Colores del estado de una etiqueta/codigo. Unico para no repetir (ni dejar
// desactualizado) el mapa en cada pagina que muestra etiqueta_estado:
// NotaSalidaDetalle, EtiquetaDetalle, ConsultaProductos, GuiaDetalle.
// REEMPLAZADA = codigo retirado tras una devolucion "usada" (Bloque 4).
export const COLOR_ETIQUETA_ESTADO = {
  EN_ALMACEN:  'bg-blue-100 text-blue-700',
  SALIO:       'bg-orange-100 text-orange-700',
  REEMPLAZADA: 'bg-gray-200 text-gray-500',
  ANULADA:     'bg-red-100 text-red-700',
}

export const colorEtiquetaEstado = (estado) =>
  COLOR_ETIQUETA_ESTADO[estado] || 'bg-gray-100 text-gray-600'

// Texto que se muestra al usuario. El valor real en la base sigue siendo
// 'SALIO' (lo usan queries, historial y el CHECK de la tabla); aca solo se
// cambia como se ve en pantalla: "SALIDA" en vez de "SALIO".
export const LABEL_ETIQUETA_ESTADO = {
  SALIO: 'SALIDA',
}

export const labelEtiquetaEstado = (estado) =>
  LABEL_ETIQUETA_ESTADO[estado] || estado || '—'
