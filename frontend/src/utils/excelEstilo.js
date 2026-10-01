// Motor comun de todos los Excel del sistema: genera .xlsx reales (ExcelJS)
// con formato de reporte formal:
//   - membrete: empresa, titulo del reporte y linea de datos (fecha de
//     generacion, usuario, filtros) cerrada con una linea azul
//   - bloque de resumen opcional (indicadores clave)
//   - tabla: encabezado azul oscuro, filas cebra suaves, bordes finos,
//     encabezado congelado, filtros y anchos automaticos
//   - agrupacion opcional (p.ej. por almacen) con subtotal por grupo
//   - impresion: A4 ajustado al ancho, encabezado repetido en cada hoja y
//     pie con empresa, titulo y "Pagina X de Y"
//
// hoja = {
//   nombre, titulo, subtitulo?,
//   columnas: [{ titulo, campo? | valor?(fila), tipo?: 'texto'|'numero'|'fecha'|'porcentaje', ancho? }],
//   filas: [...],
//   totales?: true,               // fila TOTAL GENERAL con la suma de las columnas numericas
//   resumen?: [{ etiqueta, valor, tipo? }],   // indicadores arriba de la tabla
//   agrupar?: { valor(fila), titulo?(clave) }, // banda + subtotal por grupo
//   estiloFila?: (fila) => ({ fuente?, relleno? }),  // p.ej. anuladas en rojo
//   destacar?: [indices de columna] // columnas resaltadas (p.ej. SALDO)
// }

const EMPRESA = 'MANUFACTURA DE ALIMENTOS S.A.'
const AZUL = 'FF1E3A8A'
const AZUL_OSCURO = 'FF172554'
const AZUL_CLARO = 'FFDBEAFE'
const AZUL_SUAVE = 'FFEFF6FF'
const CEBRA = 'FFF8FAFC'
const BORDE = 'FFD9E1EC'
const GRIS_TXT = 'FF64748B'
const TEXTO = 'FF1F2937'
const FUENTE = 'Calibri'

const borde = { style: 'thin', color: { argb: BORDE } }
const BORDES = { top: borde, left: borde, bottom: borde, right: borde }
const relleno = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const fuente = (extra = {}) => ({ name: FUENTE, size: 10, color: { argb: TEXTO }, ...extra })

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
  if (tipo === 'numero' || tipo === 'porcentaje') {
    const n = Number(v)
    return Number.isNaN(n) ? String(v) : n
  }
  if (tipo === 'fecha') return aFechaLocal(v)
  return String(v)
}

const ahoraTexto = () => new Date().toLocaleString('es-GT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

const usuarioActual = () => {
  try { return JSON.parse(sessionStorage.getItem('usuario') || 'null')?.nombre || '' } catch { return '' }
}

const alineacion = (tipo) => ({
  vertical: 'middle',
  horizontal: tipo === 'numero' || tipo === 'porcentaje' ? 'right' : tipo === 'fecha' ? 'center' : 'left',
  indent: tipo === 'texto' ? 1 : 0,
})

function construirHoja(wb, hoja) {
  const { columnas, filas = [], totales, estiloFila, destacar = [], resumen, agrupar } = hoja
  const nombre = String(hoja.nombre || 'Hoja').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
  const titulo = hoja.titulo || nombre
  const nCol = columnas.length
  const tipos = columnas.map(c => tipoColumna(c, filas))
  const ws = wb.addWorksheet(nombre, {
    pageSetup: {
      orientation: nCol > 6 ? 'landscape' : 'portrait', paperSize: 9,
      fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.6, header: 0.25, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: `&L&8SIBARITA - ${EMPRESA}&C&8${titulo.replace(/&/g, '&&')}&R&8Pagina &P de &N`,
    },
  })

  // Anchos segun el contenido (entre 10 y 55 caracteres).
  columnas.forEach((c, i) => {
    if (c.ancho) { ws.getColumn(i + 1).width = c.ancho; return }
    let max = String(c.titulo).length + 2
    for (const f of filas) {
      const v = valorDe(c, f)
      const len = tipos[i] === 'fecha' ? 16 : tipos[i] === 'porcentaje' ? 8
        : tipos[i] === 'numero' ? String(v ?? '').length + 4 : String(v ?? '').length
      if (len > max) max = len
    }
    ws.getColumn(i + 1).width = Math.min(55, Math.max(10, max + 2))
  })

  const unir = (n) => { if (nCol > 1) ws.mergeCells(n, 1, n, nCol) }
  const poner = (cell, props) => Object.assign(cell, props)

  // 1) Membrete
  unir(1)
  poner(ws.getCell(1, 1), {
    value: EMPRESA,
    font: fuente({ bold: true, size: 9, color: { argb: GRIS_TXT } }),
    alignment: { vertical: 'bottom' },
  })
  ws.getRow(1).height = 16
  unir(2)
  poner(ws.getCell(2, 1), {
    value: titulo.toUpperCase(),
    font: fuente({ bold: true, size: 16, color: { argb: AZUL_OSCURO } }),
    alignment: { vertical: 'middle' },
  })
  ws.getRow(2).height = 26
  unir(3)
  const usuario = usuarioActual()
  poner(ws.getCell(3, 1), {
    value: [
      hoja.subtitulo,
      `Generado: ${ahoraTexto()}`,
      usuario && `Por: ${usuario}`,
    ].filter(Boolean).join('   |   '),
    font: fuente({ size: 9, color: { argb: GRIS_TXT } }),
    alignment: { vertical: 'top', wrapText: true },
  })
  for (let c = 1; c <= nCol; c++) ws.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: AZUL } } }
  // Si la linea no entra en el ancho de la tabla, baja a un segundo renglon.
  const anchoTabla = columnas.reduce((acc, c, i) => acc + (ws.getColumn(i + 1).width || 10), 0)
  ws.getRow(3).height = String(ws.getCell(3, 1).value).length > anchoTabla * 1.35 ? 30 : 18
  let r = 5

  // 2) Resumen: tarjetas de indicadores, una por columna (etiqueta arriba,
  // valor grande abajo); si hay mas indicadores que columnas, otra fila.
  if (resumen?.length) {
    for (let k = 0; k < resumen.length; k += nCol) {
      resumen.slice(k, k + nCol).forEach((ind, j) => {
        const lado = { left: { style: 'medium', color: { argb: AZUL } } }
        poner(ws.getCell(r, j + 1), {
          value: String(ind.etiqueta).toUpperCase(),
          font: fuente({ size: 8, bold: true, color: { argb: GRIS_TXT } }),
          fill: relleno(AZUL_SUAVE),
          alignment: { vertical: 'bottom', indent: 1, wrapText: true },
          border: lado,
        })
        const va = ws.getCell(r + 1, j + 1)
        poner(va, {
          value: ind.valor,
          font: fuente({ bold: true, size: 14, color: { argb: AZUL_OSCURO } }),
          fill: relleno(AZUL_SUAVE),
          alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
          border: lado,
        })
        if (typeof ind.valor === 'number') va.numFmt = ind.tipo === 'porcentaje' ? '0.0%' : formatoNum(ind.valor)
      })
      ws.getRow(r).height = 24
      ws.getRow(r + 1).height = 24
      r += 3
    }
  }

  // 3) Encabezado de la tabla
  const filaHead = r
  columnas.forEach((c, i) => {
    poner(ws.getCell(filaHead, i + 1), {
      value: String(c.titulo).toUpperCase(),
      font: fuente({ bold: true, size: 9, color: { argb: 'FFFFFFFF' } }),
      fill: relleno(AZUL_OSCURO),
      alignment: { ...alineacion(tipos[i]), wrapText: true },
      border: { ...BORDES, bottom: { style: 'medium', color: { argb: AZUL } } },
    })
  })
  ws.getRow(filaHead).height = 24
  ws.views = [{ state: 'frozen', ySplit: filaHead, showGridLines: false }]
  ws.pageSetup.printTitlesRow = `${filaHead}:${filaHead}`
  r = filaHead + 1

  const escribirDato = (f, zebra) => {
    const extra = estiloFila ? estiloFila(f) || {} : {}
    columnas.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = convertir(valorDe(c, f), tipos[i])
      cell.font = fuente()
      cell.border = BORDES
      cell.alignment = alineacion(tipos[i])
      if (tipos[i] === 'numero' && typeof cell.value === 'number') cell.numFmt = formatoNum(cell.value)
      if (tipos[i] === 'porcentaje') cell.numFmt = '0.0%'
      if (tipos[i] === 'fecha') cell.numFmt = 'dd/mm/yyyy hh:mm'
      const fondo = destacar.includes(i) ? AZUL_CLARO : extra.relleno || (zebra ? CEBRA : null)
      if (fondo) cell.fill = relleno(fondo)
      if (destacar.includes(i)) cell.font = fuente({ bold: true })
      if (extra.fuente) cell.font = { ...cell.font, ...extra.fuente }
    })
    ws.getRow(r).height = 18
    r++
  }

  // Fila de suma (subtotal de grupo o TOTAL GENERAL). SUBTOTAL(9,...) ignora
  // los subtotales de grupo que quedan dentro del rango del total general.
  const escribirSuma = (etiqueta, desde, hasta, filasSuma, general) => {
    columnas.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1)
      if (i === 0) cell.value = etiqueta
      else if (tipos[i] === 'numero' || tipos[i] === 'porcentaje') {
        // Los % (participacion) tambien se suman: el total da 100%.
        const L = ws.getColumn(i + 1).letter
        const suma = filasSuma.reduce((acc, f) => acc + (Number(valorDe(c, f)) || 0), 0)
        cell.value = { formula: `SUBTOTAL(9,${L}${desde}:${L}${hasta})`, result: suma }
        cell.numFmt = tipos[i] === 'porcentaje' ? '0.0%' : formatoNum(Math.round(suma * 1000) / 1000)
      }
      cell.alignment = i === 0 ? { vertical: 'middle', indent: 1 } : { vertical: 'middle', horizontal: 'right' }
      cell.font = fuente({ bold: true, color: { argb: general ? 'FFFFFFFF' : AZUL_OSCURO } })
      cell.fill = relleno(general ? AZUL : AZUL_CLARO)
      cell.border = general
        ? { top: { style: 'medium', color: { argb: AZUL_OSCURO } }, bottom: { style: 'medium', color: { argb: AZUL_OSCURO } } }
        : { top: borde, bottom: { style: 'thin', color: { argb: AZUL } } }
    })
    ws.getRow(r).height = general ? 22 : 19
    r++
  }

  const hayNumeros = tipos.includes('numero')
  const primeraDato = r
  if (agrupar && filas.length) {
    const grupos = new Map()
    for (const f of filas) {
      const k = agrupar.valor(f) ?? '—'
      if (!grupos.has(k)) grupos.set(k, [])
      grupos.get(k).push(f)
    }
    for (const [clave, filasG] of grupos) {
      unir(r)
      poner(ws.getCell(r, 1), {
        value: `${agrupar.titulo ? agrupar.titulo(clave) : clave}   (${filasG.length})`,
        font: fuente({ bold: true, color: { argb: AZUL_OSCURO } }),
        fill: relleno(AZUL_SUAVE),
        alignment: { vertical: 'middle', indent: 1 },
        border: { top: { style: 'thin', color: { argb: AZUL } }, bottom: borde },
      })
      ws.getRow(r).height = 20
      r++
      const desde = r
      filasG.forEach((f, k) => escribirDato(f, k % 2 === 1))
      if (hayNumeros) escribirSuma(`Subtotal ${clave}`, desde, r - 1, filasG, false)
    }
  } else {
    filas.forEach((f, k) => escribirDato(f, k % 2 === 1))
  }
  const ultimaDato = r - 1

  if (totales && filas.length && hayNumeros) escribirSuma('TOTAL GENERAL', primeraDato, ultimaDato, filas, true)
  if (!filas.length) {
    unir(r)
    poner(ws.getCell(r, 1), {
      value: 'Sin datos para mostrar',
      font: fuente({ italic: true, color: { argb: GRIS_TXT } }),
      alignment: { horizontal: 'center' },
    })
  }

  // Filtros en el encabezado (con grupos no: las bandas romperian el filtro).
  if (filas.length && !agrupar) ws.autoFilter = { from: { row: filaHead, column: 1 }, to: { row: ultimaDato, column: nCol } }
}

export async function descargarExcel(nombreArchivo, hojas) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SIBARITA'
  wb.company = EMPRESA
  wb.title = hojas[0]?.titulo || nombreArchivo
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
