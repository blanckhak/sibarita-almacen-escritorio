// Kardex en .xlsx. UNA HOJA POR ALMACEN (MALSA, JOPISA, INDELPAS): cada pestaña
// es el kardex completo de ese almacen, con una fila por codigo (ingresos y
// devoluciones juntos, la columna TIPO los distingue) y sus salidas en pares
// CANT. | N° GUIA. Se generan tantos pares como tenga la fila con mas salidas
// (minimo 6, como el talonario). Estilo comun en excelEstilo.js.
import { codigoAlmacen } from './colorAlmacen'
import { descargarExcel, fechaArchivo } from './excelEstilo'

// Orden fijo de las pestañas; cualquier otro almacen que aparezca en los datos
// se agrega despues, alfabetico.
const ALMACENES_ORDEN = ['MALSA', 'JOPISA', 'INDELPAS']

const fechaCorta = (f) => {
  if (!f) return ''
  const [y, m, d] = String(f).slice(0, 10).split('-')
  return `${d}/${m}/${y?.slice(2) || ''}`
}

const sumaSalidas = (salidas) => (salidas || []).reduce((s, x) => s + (Number(x.cant) || 0), 0)

const COLUMNAS = [
  { titulo: 'ITEM',             tipo: 'texto',  valor: f => codigoAlmacen(f.item, f.almacen) },
  { titulo: 'UBICAC',           tipo: 'texto',  campo: 'ubicac' },
  { titulo: 'FECHA',            tipo: 'texto',  valor: f => fechaCorta(f.fecha), ancho: 10 },
  { titulo: 'N/I',              tipo: 'texto',  campo: 'ni' },
  { titulo: 'O/C N° EXTERNA',   tipo: 'texto',  campo: 'oc_externa' },
  { titulo: 'DOC',              tipo: 'texto',  campo: 'doc' },
  { titulo: 'N°',               tipo: 'texto',  campo: 'nro_doc' },
  { titulo: 'PROVEEDOR',        tipo: 'texto',  campo: 'proveedor' },
  { titulo: 'DETALLE',          tipo: 'texto',  valor: f => (f.estado_guia === 'ANULADA' ? `ANULADA - ${f.detalle || ''}` : f.detalle) },
  { titulo: 'MAQUINA - MOTIVO', tipo: 'texto',  campo: 'motivo' },
  { titulo: 'UNID MED',         tipo: 'texto',  campo: 'unid_med' },
  { titulo: 'TIPO',             tipo: 'texto',  campo: 'tipo' },
  { titulo: 'CANTIDAD',         tipo: 'numero', campo: 'cantidad' },
  { titulo: 'INGRESO',          tipo: 'numero', campo: 'cantidad' },
]

// minPares: el kardex general deja 6 pares minimo (como el talonario); el de
// un almacen solo los que hagan falta.
function hojaAlmacen(nombre, subtitulo, filas, minPares = 6) {
  const maxSalidas = Math.max(minPares, ...filas.map(f => (f.salidas || []).length))
  const pares = []
  for (let i = 0; i < maxSalidas; i++) {
    pares.push({ titulo: `N° GUIA ${i + 1}`, tipo: 'texto', ancho: 11, valor: f => f.salidas?.[i]?.guia })
    pares.push({ titulo: 'CANT.', tipo: 'numero', ancho: 7, valor: f => f.salidas?.[i]?.cant })
  }
  const columnas = [
    ...COLUMNAS,
    ...pares,
    { titulo: 'TTL / S', tipo: 'numero', valor: f => sumaSalidas(f.salidas) },
    { titulo: 'SALDO PENDIENTE', tipo: 'numero', valor: f => (Number(f.cantidad) || 0) - sumaSalidas(f.salidas) },
  ]
  return {
    nombre,
    titulo: `INVENTARIO DE REPUESTO - ${nombre}`,
    subtitulo,
    columnas,
    filas,
    destacar: [columnas.length - 1],
    // Anuladas en rojo tachado; devoluciones con fondo ambar suave.
    estiloFila: f => (f.estado_guia === 'ANULADA'
      ? { fuente: { color: { argb: 'FFDC2626' }, strike: true } }
      : f.tipo === 'DEVOLUCION' ? { relleno: 'FFFEF3C7' } : null),
  }
}

export async function generarKardexExcel(ingresos = [], devoluciones = []) {
  const hoy = new Date()
  const periodo = `${String(hoy.getDate()).padStart(2, '0')}.${String(hoy.getMonth() + 1).padStart(2, '0')}.${String(hoy.getFullYear()).slice(2)}`

  // Ingresos y devoluciones en una sola lista, marcadas con TIPO.
  const todas = [
    ...ingresos.map(f => ({ ...f, tipo: 'INGRESO' })),
    ...devoluciones.map(f => ({ ...f, tipo: 'DEVOLUCION' })),
  ]

  // Nombres de almacen: primero el orden fijo, despues cualquier otro presente.
  const presentes = [...new Set(todas.map(f => f.almacen).filter(Boolean))]
  const extras = presentes.filter(n => !ALMACENES_ORDEN.includes(n)).sort()
  const hojas = [...ALMACENES_ORDEN, ...extras]
    .map(nombre => hojaAlmacen(nombre, `PERIODO AL ${periodo}`, todas.filter(f => f.almacen === nombre)))

  await descargarExcel(`Kardex_almacenes_${fechaArchivo()}`, hojas)
}

// Kardex de UN almacen tal como se ve en pantalla (vista de detalle de
// Almacenes): `filas` ya viene filtrada y con TIPO; `filtro` describe los
// filtros aplicados para que quede escrito en el archivo.
export async function exportarKardexAlmacen(almacen, filas, filtro = '') {
  const sub = filtro ? `Filtro: ${filtro}` : 'Todos los codigos'
  await descargarExcel(`Kardex_${almacen}_${fechaArchivo()}`, [hojaAlmacen(almacen, sub, filas, 1)])
}
