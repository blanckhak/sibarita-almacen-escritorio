// Excel de la pantalla Reportes (y el Resumen del Dashboard), armados sobre
// el motor comun excelEstilo.js: cada uno con su bloque de resumen y, donde
// sirve, agrupado con subtotales.
import { descargarExcel, fechaArchivo } from './excelEstilo'
import { motivoLabel } from './motivos'

const num = (v) => Number(v) || 0
const tipoLabel = (t) => (t === 'DEVOLUCION' ? 'Devolucion' : t === 'NUEVO' ? 'Nuevo' : t || '')
const fechaTexto = (f) => {
  if (!f) return ''
  const [y, m, d] = String(f).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function excelResumenAlmacenes(resumen) {
  const total = resumen.reduce((s, a) => s + num(a.total), 0)
  const filas = resumen.map(a => ({
    almacen: a.almacen,
    nuevos: num(a.nuevos),
    devoluciones: num(a.devoluciones),
    total: num(a.total),
    participacion: total ? num(a.total) / total : 0,
  }))
  return descargarExcel(`Resumen_almacenes_${fechaArchivo()}`, [{
    nombre: 'Resumen',
    titulo: 'Resumen de Almacenes',
    subtitulo: 'Stock actual por almacen',
    resumen: [
      { etiqueta: 'Almacenes', valor: filas.length },
      { etiqueta: 'Stock total', valor: total },
      { etiqueta: 'Nuevos', valor: filas.reduce((s, f) => s + f.nuevos, 0) },
      { etiqueta: 'Devoluciones', valor: filas.reduce((s, f) => s + f.devoluciones, 0) },
    ],
    columnas: [
      { titulo: 'Almacen', campo: 'almacen', ancho: 22 },
      { titulo: 'Nuevos', campo: 'nuevos', tipo: 'numero', ancho: 14 },
      { titulo: 'Devoluciones', campo: 'devoluciones', tipo: 'numero', ancho: 14 },
      { titulo: 'Total', campo: 'total', tipo: 'numero', ancho: 14 },
      { titulo: '% del total', campo: 'participacion', tipo: 'porcentaje', ancho: 13 },
    ],
    filas,
    totales: true,
    destacar: [3],
  }]).catch(err => console.error('No se pudo generar el Excel', err))
}

export function excelInventario(inventario) {
  const filas = inventario
    .map(i => ({ ...i, cantidad: num(i.cantidad), tipo_label: tipoLabel(i.tipo) }))
    .sort((a, b) => String(a.almacen_nombre).localeCompare(String(b.almacen_nombre))
      || String(a.producto_nombre || '').localeCompare(String(b.producto_nombre || ''))
      || String(a.tipo).localeCompare(String(b.tipo)))
  const suma = (tipo) => filas.filter(f => f.tipo === tipo).reduce((s, f) => s + f.cantidad, 0)
  return descargarExcel(`Inventario_completo_${fechaArchivo()}`, [{
    nombre: 'Inventario',
    titulo: 'Inventario Completo',
    subtitulo: 'Stock por almacen, producto y tipo',
    resumen: [
      { etiqueta: 'Productos', valor: new Set(filas.map(f => f.producto_id)).size },
      { etiqueta: 'Almacenes', valor: new Set(filas.map(f => f.almacen_nombre)).size },
      { etiqueta: 'Stock nuevo', valor: suma('NUEVO') },
      { etiqueta: 'Stock devolucion', valor: suma('DEVOLUCION') },
      { etiqueta: 'Stock total', valor: suma('NUEVO') + suma('DEVOLUCION') },
    ],
    columnas: [
      { titulo: 'Producto', campo: 'producto_nombre', ancho: 52 },
      { titulo: 'Tipo', campo: 'tipo_label', ancho: 13 },
      { titulo: 'Unidad', campo: 'unidad_medida_abreviatura', ancho: 10 },
      { titulo: 'Cantidad', campo: 'cantidad', tipo: 'numero', ancho: 13 },
      { titulo: 'Ultimo movimiento', campo: 'descripcion', ancho: 38 },
    ],
    filas,
    agrupar: { valor: f => f.almacen_nombre, titulo: a => `ALMACEN ${a}` },
    totales: true,
  }]).catch(err => console.error('No se pudo generar el Excel', err))
}

export function excelMovimientos(movimientos) {
  const filas = movimientos.map(m => ({
    ...m,
    cantidad: num(m.cantidad),
    origen: m.origen || '—',
    destino: m.destino || '—',
  }))
  const porTipo = filas.reduce((acc, m) => { acc[m.tipo] = (acc[m.tipo] || 0) + 1; return acc }, {})
  const fechas = filas.map(m => m.fecha).filter(Boolean).sort()
  return descargarExcel(`Movimientos_${fechaArchivo()}`, [{
    nombre: 'Movimientos',
    titulo: 'Reporte de Movimientos',
    subtitulo: fechas.length ? `Del ${fechaTexto(fechas[0])} al ${fechaTexto(fechas.at(-1))}` : 'Traslados, entradas y salidas',
    resumen: [
      { etiqueta: 'Movimientos', valor: filas.length },
      ...Object.entries(porTipo).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([tipo, n]) => ({ etiqueta: String(tipo || 'Sin tipo').replace(/_/g, ' '), valor: n })),
    ],
    columnas: [
      { titulo: 'Fecha', campo: 'fecha', tipo: 'fecha', ancho: 17 },
      { titulo: 'Tipo', valor: m => String(m.tipo || '').replace(/_/g, ' '), ancho: 16 },
      { titulo: 'Producto', campo: 'producto_nombre', ancho: 54 },
      { titulo: 'Origen', campo: 'origen', ancho: 13 },
      { titulo: 'Destino', campo: 'destino', ancho: 13 },
      { titulo: 'Cantidad', campo: 'cantidad', tipo: 'numero', ancho: 12 },
      { titulo: 'Unidad', campo: 'unidad_medida_abreviatura', ancho: 9 },
      { titulo: 'Usuario', campo: 'usuario_nombre', ancho: 18 },
      { titulo: 'Descripcion', campo: 'descripcion', ancho: 40 },
    ],
    filas,
  }]).catch(err => console.error('No se pudo generar el Excel', err))
}

export function excelSalidasMotivo(salidas, desde, hasta) {
  const base = salidas.map(r => ({ ...r, motivo_label: motivoLabel(r.motivo), notas: num(r.notas), unidades: num(r.unidades) }))
  const totalUnidades = base.reduce((s, f) => s + f.unidades, 0)
  const porMotivo = base.reduce((acc, f) => { acc[f.motivo_label] = (acc[f.motivo_label] || 0) + f.unidades; return acc }, {})
  // Motivos de mayor a menor salida; dentro de cada uno, almacenes igual.
  const filas = base.sort((a, b) => porMotivo[b.motivo_label] - porMotivo[a.motivo_label]
    || a.motivo_label.localeCompare(b.motivo_label) || b.unidades - a.unidades)
  const top = Object.entries(porMotivo).sort((a, b) => b[1] - a[1])[0]
  const rango = desde || hasta
    ? `Rango: ${desde ? fechaTexto(desde) : 'inicio'} al ${hasta ? fechaTexto(hasta) : 'hoy'}`
    : 'Todo el historial'
  return descargarExcel(`Salidas_por_motivo_${fechaArchivo()}`, [{
    nombre: 'Salidas por motivo',
    titulo: 'Salidas por Motivo',
    subtitulo: rango,
    resumen: [
      { etiqueta: 'Unidades salidas', valor: totalUnidades },
      { etiqueta: 'Motivos', valor: Object.keys(porMotivo).length },
      ...(top ? [{ etiqueta: `Principal: ${top[0]}`, valor: totalUnidades ? top[1] / totalUnidades : 0, tipo: 'porcentaje' }] : []),
    ],
    columnas: [
      { titulo: 'Almacen', campo: 'almacen', ancho: 22 },
      { titulo: 'Notas de salida', campo: 'notas', tipo: 'numero', ancho: 19 },
      { titulo: 'Unidades', campo: 'unidades', tipo: 'numero', ancho: 14 },
      { titulo: '% del total', valor: f => (totalUnidades ? f.unidades / totalUnidades : 0), tipo: 'porcentaje', ancho: 13 },
    ],
    filas,
    agrupar: { valor: f => f.motivo_label, titulo: m => `MOTIVO: ${m.toUpperCase()}` },
    totales: true,
  }]).catch(err => console.error('No se pudo generar el Excel', err))
}
