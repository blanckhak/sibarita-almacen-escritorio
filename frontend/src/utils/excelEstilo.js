// Motor comun de todos los Excel del sistema: genera .xlsx reales (ExcelJS)
// con el mismo estilo que el PDF: banda de titulo azul SIBARITA, encabezado
// azul con texto blanco, filas cebra, bordes finos, encabezado congelado,
// filtros, anchos automaticos y formato de numeros/fechas.
//
// hoja = {
//   nombre, titulo, subtitulo?,
//   columnas: [{ titulo, campo? | valor?(fila), tipo?: 'texto'|'numero'|'fecha', ancho? }],
//   filas: [...],
//   totales?: true,               // fila TOTAL con la suma de las columnas numericas
//   estiloFila?: (fila) => ({ fuente?, relleno? }),  // p.ej. anuladas en rojo
//   destacar?: [indices de columna] // columnas resaltadas (p.ej. SALDO)
// }

const AZUL = 'FF1E3A8A'
const AZUL_CLARO = 'FFDBEAFE'
const CEBRA = 'FFF1F5F9'
const BORDE = 'FFCBD5E1'
const GRIS_TXT = 'FF64748B'

const borde = { style: 'thin', color: { argb: BORDE } }
const BORDES = { top: borde, left: borde, bottom: borde, right: borde }
const relleno = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

// Codigos, guias, telefonos, etc. son numeros "de texto": nunca se formatean
// con separador de miles aunque solo tengan digitos.
const CAMPO_TEXTO = /codigo|guia|numero|nro|telefono|^(nit|ruc|ip|ni|oc_externa)$/i
const NUM_RE = /^-?\d+(\.\d+)?$/
const FECHA_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/

// Enteros sin decimales; fraccionarios con 2 (hasta 3 si hacen falta).
// Negativos en rojo, ceros como "-".
const formatoNum = (v) => (Number.isInteger(v)
  ? '#,##0;[Red]-#,##0;"-"'
  : '#,##0.00#;[Red]-#,##0.00#;"-"')

const valorDe = (col, fila) => (col.valor ? col.valor(fila) : fila[col.campo])

function tipoColumna(col, filas) {
  if (col.tipo) return col.tipo
  if (col.campo && CAMPO_TEXTO.test(col.campo)) return 'texto'
  const vals = filas.map(f => valorDe(col, f)).filter(v => v !== null && v !== undefined && v !== '')
  if (vals.length === 0) return 'texto'
  if (vals.every(v => typeof v === 'number' || (typeof v === 'string' && NUM_RE.test(v) && !/^0\d/.test(v)))) return 'numero'
  if (vals.every(v => v instanceof Date || (typeof v === 'string' && FECHA_RE.test(v)))) return 'fecha'
  return 'texto'
}

// Excel no tiene zona horaria: se corre la fecha para que muestre la hora local.
function aFechaLocal(v) {
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
}

function convertir(v, tipo) {
  if (v === null || v === undefined || v === '') return null
  if (tipo === 'numero') {
    const n = Number(v)
    return Number.isNaN(n) ? String(v) : n
  }
  if (tipo === 'fecha') return aFechaLocal(v)
  return String(v)
}

const ahoraTexto = () => new Date().toLocaleString('es-GT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

function construirHoja(wb, hoja) {
  const { columnas, filas = [], totales, estiloFila, destacar = [] } = hoja
  const nombre = String(hoja.nombre || 'Hoja').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
  const ws = wb.addWorksheet(nombre, {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: columnas.length > 6 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  })
  const nCol = columnas.length
  const tipos = columnas.map(c => tipoColumna(c, filas))

  // 1) Banda de titulo
  ws.mergeCells(1, 1, 1, nCol)
  const t = ws.getCell(1, 1)
  t.value = hoja.titulo || nombre
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  t.fill = relleno(AZUL)
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 26

  // 2) Subtitulo: SIBARITA + fecha de generacion (+ texto propio)
  ws.mergeCells(2, 1, 2, nCol)
  const s = ws.getCell(2, 1)
  s.value = ['SIBARITA', hoja.subtitulo, `Generado: ${ahoraTexto()}`].filter(Boolean).join('   ·   ')
  s.font = { italic: true, size: 10, color: { argb: GRIS_TXT } }
  s.alignment = { indent: 1 }
  ws.getRow(3).height = 6

  // 4) Encabezado
  const head = ws.getRow(4)
  columnas.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = c.titulo
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = relleno(AZUL)
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = BORDES
  })
  head.height = 30

  // 5) Datos
  filas.forEach((f, r) => {
    const row = ws.getRow(5 + r)
    const extra = estiloFila ? estiloFila(f) || {} : {}
    columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.value = convertir(valorDe(c, f), tipos[i])
      cell.border = BORDES
      cell.alignment = { vertical: 'middle', horizontal: tipos[i] === 'numero' ? 'right' : tipos[i] === 'fecha' ? 'center' : 'left' }
      if (tipos[i] === 'numero' && typeof cell.value === 'number') cell.numFmt = formatoNum(cell.value)
      if (tipos[i] === 'fecha') cell.numFmt = 'dd/mm/yyyy hh:mm'
      const fondo = destacar.includes(i) ? AZUL_CLARO : extra.relleno || (r % 2 ? CEBRA : null)
      if (fondo) cell.fill = relleno(fondo)
      if (destacar.includes(i)) cell.font = { bold: true }
      if (extra.fuente) cell.font = { ...(cell.font || {}), ...extra.fuente }
    })
  })

  // 6) Totales
  if (totales && filas.length) {
    const ult = 4 + filas.length
    const row = ws.getRow(ult + 1)
    columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      if (i === 0) cell.value = 'TOTAL'
      else if (tipos[i] === 'numero') {
        const L = ws.getColumn(i + 1).letter
        const suma = filas.reduce((acc, f) => acc + (Number(valorDe(c, f)) || 0), 0)
        cell.value = { formula: `SUBTOTAL(9,${L}5:${L}${ult})`, result: suma }
        cell.numFmt = formatoNum(Math.round(suma * 1000) / 1000)
        cell.alignment = { horizontal: 'right' }
      }
      cell.font = { bold: true }
      cell.fill = relleno(AZUL_CLARO)
      cell.border = { ...BORDES, top: { style: 'medium', color: { argb: AZUL } } }
    })
  }

  // Filtros en el encabezado
  if (filas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + filas.length, column: nCol } }

  // Anchos segun el contenido (entre 8 y 50 caracteres)
  columnas.forEach((c, i) => {
    if (c.ancho) { ws.getColumn(i + 1).width = c.ancho; return }
    let max = String(c.titulo).length
    for (const f of filas) {
      const v = valorDe(c, f)
      const len = tipos[i] === 'fecha' ? 16 : tipos[i] === 'numero' ? String(v ?? '').length + 3 : String(v ?? '').length
      if (len > max) max = len
    }
    ws.getColumn(i + 1).width = Math.min(50, Math.max(8, max + 2))
  })
}

export async function descargarExcel(nombreArchivo, hojas) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SIBARITA'
  wb.created = new Date()
  hojas.forEach(h => construirHoja(wb, h))

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombreArchivo}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Fecha para nombres de archivo: 2026-09-29
export const fechaArchivo = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
