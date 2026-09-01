// Genera el kardex como archivo SpreadsheetML 2003: un solo XML que Excel abre
// nativamente, sin librerias extra. UNA HOJA POR ALMACEN (MALSA, JOPISA,
// INDELPAS): cada pestaña es el kardex completo de ese almacen, con una fila
// por codigo (ingresos y devoluciones juntos, la columna TIPO los distingue) y
// sus salidas en pares CANT. | N° GUIA. Se generan tantos pares como tenga la
// fila con mas salidas (minimo 6, como el talonario).
import { codigoAlmacen } from './colorAlmacen'

// Orden fijo de las pestañas; cualquier otro almacen que aparezca en los datos
// se agrega despues, alfabetico.
const ALMACENES_ORDEN = ['MALSA', 'JOPISA', 'INDELPAS']

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const celdaTxt = (v, styleId) => {
  const st = styleId ? ` ss:StyleID="${styleId}"` : ''
  if (v === null || v === undefined || v === '') return `<Cell${st}><Data ss:Type="String"></Data></Cell>`
  return `<Cell${st}><Data ss:Type="String">${esc(v)}</Data></Cell>`
}

const celdaNum = (v, styleId) => {
  const st = styleId ? ` ss:StyleID="${styleId}"` : ''
  const n = Number(v)
  if (v === null || v === undefined || v === '' || Number.isNaN(n)) {
    return `<Cell${st}><Data ss:Type="String"></Data></Cell>`
  }
  return `<Cell${st}><Data ss:Type="Number">${n}</Data></Cell>`
}

const filaXml = (celdas) => `<Row>${celdas.join('')}</Row>`

const fechaCorta = (f) => {
  if (!f) return ''
  const [y, m, d] = String(f).slice(0, 10).split('-')
  return `${d}/${m}/${y?.slice(2) || ''}`
}

const sumaSalidas = (salidas) => (salidas || []).reduce((s, x) => s + (Number(x.cant) || 0), 0)

const COLUMNAS = ['ITEM', 'UBICAC', 'FECHA', 'N/I', 'O/C N° EXTERNA', 'DOC', 'N°', 'PROVEEDOR', 'DETALLE', 'MAQUINA - MOTIVO', 'UNID MED', 'TIPO', 'CANTIDAD', 'INGRESO']

const mapFila = (f) => [
  celdaTxt(codigoAlmacen(f.item, f.almacen)),
  celdaTxt(f.ubicac),
  celdaTxt(fechaCorta(f.fecha)),
  celdaTxt(f.ni),
  celdaTxt(f.oc_externa),
  celdaTxt(f.doc),
  celdaTxt(f.nro_doc),
  celdaTxt(f.proveedor),
  celdaTxt(f.estado_guia === 'ANULADA' ? `ANULADA - ${f.detalle || ''}` : f.detalle),
  celdaTxt(f.motivo),
  celdaTxt(f.unid_med),
  celdaTxt(f.tipo),
  celdaNum(f.cantidad),
  celdaNum(f.cantidad),
]

// Una hoja = un almacen. `filas` ya viene filtrada para ese almacen.
function construirHoja(nombreHoja, titulo, subtitulo, filas) {
  const maxSalidas = Math.max(6, ...filas.map(f => (f.salidas || []).length))
  const pares = []
  for (let i = 1; i <= maxSalidas; i++) pares.push('CANT.', `N° GUIA ${i}`)
  const encabezados = [...COLUMNAS, ...pares, 'TTL / S', 'SALDO']
  const totalCols = encabezados.length

  const filaTitulo = filaXml([celdaTxt(titulo, 'sTitulo')])
  const filaVacia = filaXml([celdaTxt('')])
  const filaSub = filaXml([celdaTxt(subtitulo, 'sSub')])
  const filaHead = filaXml(encabezados.map(h => celdaTxt(h, 'sHead')))

  const filasDatos = filas.map(f => {
    const celdas = [...mapFila(f)]
    const salidas = f.salidas || []
    for (let i = 0; i < maxSalidas; i++) {
      const s = salidas[i]
      celdas.push(celdaNum(s ? s.cant : ''))
      celdas.push(celdaTxt(s ? s.guia : ''))
    }
    const ttlS = sumaSalidas(salidas)
    const ingreso = Number(f.cantidad) || 0
    celdas.push(celdaNum(ttlS))
    celdas.push(celdaNum(ingreso - ttlS))
    return filaXml(celdas)
  })

  return `<Worksheet ss:Name="${esc(nombreHoja)}"><Table>` +
    `<Column ss:Width="70"/>`.repeat(totalCols) +
    filaTitulo + filaVacia + filaSub + filaHead + filasDatos.join('') +
    `</Table></Worksheet>`
}

export function generarKardexExcel(ingresos = [], devoluciones = []) {
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

  const worksheets = hojas.map(nombre => {
    const filas = todas.filter(f => f.almacen === nombre)
    return construirHoja(nombre, `INVENTARIO DE REPUESTO - ${nombre}`, `PERIODO AL ${periodo}`, filas)
  }).join('')

  const xml =
    '<?xml version="1.0"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Styles>' +
      '<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style>' +
      '<Style ss:ID="sTitulo"><Font ss:Bold="1" ss:Size="13"/></Style>' +
      '<Style ss:ID="sSub"><Font ss:Bold="1"/></Style>' +
      '<Style ss:ID="sHead"><Font ss:Bold="1"/><Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/>' +
        '<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>' +
    '</Styles>' +
    worksheets +
    '</Workbook>'

  const blob = new Blob(['﻿' + xml], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Kardex_almacenes_${hoy.toISOString().slice(0, 10)}.xls`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
