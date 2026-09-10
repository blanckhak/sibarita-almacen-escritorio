import api from './api'

// Fase 13 (R1): que mostrar en cada documento impreso. Si el backend no
// responde (o todavia no tiene la fila), se usan estos valores por defecto:
// todo visible, 6 lineas por hoja.
export const PARAMS_IMPRESION_DEFAULT = {
  mostrar_precio: true,
  mostrar_ubicacion: true,
  mostrar_motivo: true,
  mostrar_observaciones: true,
  mostrar_partidas: true,
  lineas_por_pagina: 6,
  pie_texto: null,
}

export const DOCUMENTOS_IMPRESION = [
  { value: 'INGRESO',    label: 'Nota de Ingreso' },
  { value: 'SALIDA',     label: 'Nota de Salida' },
  { value: 'DEVOLUCION', label: 'Nota de Devolucion' },
]

// Devuelve { INGRESO, SALIDA, DEVOLUCION } con la fila de cada documento (o el
// default). Pensado para llamarse una vez al cargar la pantalla de impresion.
export async function cargarParamsImpresion() {
  try {
    const { data } = await api.get('/api/parametros-impresion')
    const map = {}
    for (const row of data) map[row.documento] = row
    return {
      INGRESO:    map.INGRESO    || PARAMS_IMPRESION_DEFAULT,
      SALIDA:     map.SALIDA     || PARAMS_IMPRESION_DEFAULT,
      DEVOLUCION: map.DEVOLUCION || PARAMS_IMPRESION_DEFAULT,
    }
  } catch {
    return {
      INGRESO:    PARAMS_IMPRESION_DEFAULT,
      SALIDA:     PARAMS_IMPRESION_DEFAULT,
      DEVOLUCION: PARAMS_IMPRESION_DEFAULT,
    }
  }
}
