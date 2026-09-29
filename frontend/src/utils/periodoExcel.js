// Fase 14/15: exporta la tabla "productos por periodo" a .xlsx con el estilo
// comun de excelEstilo.js.
import { descargarExcel } from './excelEstilo'

const n = (v) => Number(v) || 0

// data = { periodo, cerrado, productos: [...] }  (respuesta de /api/reportes/periodo)
export async function exportarProductosPeriodo(data) {
  const { periodo, cerrado, productos } = data
  const columnas = [
    { titulo: 'Producto',        campo: 'producto_nombre', tipo: 'texto' },
    { titulo: 'Unidad',          campo: 'unidad',          tipo: 'texto' },
    { titulo: 'Apertura nuevo',  campo: 'apertura_nuevo',      tipo: 'numero' },
    { titulo: 'Apertura devol.', campo: 'apertura_devolucion', tipo: 'numero' },
    { titulo: 'Ingresos',        campo: 'ingresos',            tipo: 'numero' },
    { titulo: 'Salidas',         campo: 'salidas',             tipo: 'numero' },
    { titulo: cerrado ? 'Cierre nuevo' : 'Stock nuevo',   campo: 'stock_nuevo',      tipo: 'numero' },
    { titulo: cerrado ? 'Cierre devol.' : 'Stock devol.', campo: 'stock_devolucion', tipo: 'numero' },
    { titulo: 'Movimiento neto', tipo: 'numero', valor: p =>
      Math.round(((n(p.stock_nuevo) + n(p.stock_devolucion)) - (n(p.apertura_nuevo) + n(p.apertura_devolucion))) * 1000) / 1000 },
  ]

  const fecha = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '')
  const rango = `${fecha(periodo.fecha_inicio)} a ${periodo.fecha_fin ? fecha(periodo.fecha_fin) : '(abierto)'}`
  const almacen = periodo.almacen_nombre || ''

  await descargarExcel(
    `Periodo_${almacen.replace(/\s+/g, '')}_${String(periodo.nombre).replace(/\s+/g, '_')}`,
    [{
      nombre: 'Productos',
      titulo: `${almacen ? `${almacen} - ` : ''}${periodo.nombre}${cerrado ? ' (CERRADO)' : ' (ACTIVO)'}`,
      subtitulo: `Periodo: ${rango}`,
      columnas,
      filas: productos,
      destacar: [columnas.length - 1],
    }],
  )
}
