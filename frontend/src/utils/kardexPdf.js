// PDF formal del Kardex de UN almacen (vista de detalle de Almacenes):
// cabecera SIBARITA, datos del reporte (almacen, fecha, usuario, filtro),
// tabla auto-ajustada en A4 horizontal y pie con numero de pagina.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fechaArchivo } from './excelEstilo'

const AZUL = [30, 58, 138]
const num = (v) => Number(v || 0).toLocaleString('es-GT', { maximumFractionDigits: 3 })
const fechaCorta = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '')

// Color del chip TIPO (mismo criterio que en pantalla).
const COLOR_TIPO = {
  INGRESO:    { fill: [220, 252, 231], text: [21, 128, 61] },
  DEVOLUCION: { fill: [255, 237, 213], text: [194, 65, 12] },
}

// filas: ya filtradas y normalizadas (codigo, tipo, ttl_s, saldo).
export function exportarKardexPdf({ almacen, filas, filtro = '', usuario = '' }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()
  const ahora = new Date().toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Cabecera corporativa
  doc.setFillColor(...AZUL)
  doc.rect(0, 0, ancho, 20, 'F')
  doc.setTextColor(255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('SIBARITA', 14, 13)
  doc.setFontSize(12)
  doc.text(`KARDEX DE REPUESTOS — ${almacen}`, ancho - 14, 13, { align: 'right' })

  // Datos del reporte
  const activos = filas.filter(f => f.estado_guia !== 'ANULADA')
  const saldo = activos.reduce((s, f) => s + (Number(f.saldo) || 0), 0)
  const meta = [
    ['Almacen:', almacen],
    ['Generado:', ahora],
    ['Usuario:', usuario || '—'],
    ['Filtro:', filtro || 'Todos los codigos'],
  ]
  doc.setTextColor(60)
  doc.setFontSize(9)
  meta.forEach(([k, v], i) => {
    const y = 27 + i * 5
    doc.setFont('helvetica', 'bold'); doc.text(k, 14, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(v), 34, y, { maxWidth: 150 })
  })
  // Resumen a la derecha
  const resumen = [['Codigos', filas.length], ['Ingresos', filas.filter(f => f.tipo === 'INGRESO').length], ['Devoluciones', filas.filter(f => f.tipo === 'DEVOLUCION').length], ['Saldo total', num(saldo)]]
  resumen.forEach(([k, v], i) => {
    const y = 27 + i * 5
    doc.setFont('helvetica', 'normal'); doc.text(k, ancho - 60, y)
    doc.setFont('helvetica', 'bold'); doc.text(String(v), ancho - 14, y, { align: 'right' })
  })

  const head = [['Codigo', 'Ubicac.', 'Fecha', 'N/I', 'O/C N° Ext.', 'Doc / N°', 'Proveedor', 'Detalle', 'Maquina - Motivo', 'Unid.', 'Tipo', 'Cant.', 'TTL / S', 'Saldo']]
  const body = filas.map(f => [
    f.codigo, f.ubicac || '', fechaCorta(f.fecha), f.ni || '', f.oc_externa || '',
    [f.doc, f.nro_doc].filter(Boolean).join(' '), f.proveedor || '',
    (f.estado_guia === 'ANULADA' ? 'ANULADA - ' : '') + (f.detalle || ''),
    f.motivo || '', f.unid_med || '', f.tipo,
    num(f.cantidad), f.ttl_s ? num(f.ttl_s) : '-', num(f.saldo),
  ])

  autoTable(doc, {
    startY: 50,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak', lineColor: [203, 213, 225], lineWidth: 0.1 },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 16 },
      2: { cellWidth: 15 },
      6: { cellWidth: 30 },
      7: { cellWidth: 48 },
      10: { halign: 'center', cellWidth: 19 },
      11: { halign: 'right' },
      12: { halign: 'right', textColor: [220, 38, 38] },
      13: { halign: 'right', fontStyle: 'bold', fillColor: [219, 234, 254] },
    },
    margin: { left: 8, right: 8, bottom: 14 },
    didParseCell: (d) => {
      if (d.section !== 'body') return
      const f = filas[d.row.index]
      if (d.column.index === 10 && COLOR_TIPO[f.tipo]) {
        d.cell.styles.fillColor = COLOR_TIPO[f.tipo].fill
        d.cell.styles.textColor = COLOR_TIPO[f.tipo].text
        d.cell.styles.fontStyle = 'bold'
      }
      if (f.estado_guia === 'ANULADA' && d.column.index !== 10) d.cell.styles.textColor = [220, 38, 38]
    },
    didDrawPage: () => {
      const alto = doc.internal.pageSize.getHeight()
      doc.setFontSize(8)
      doc.setTextColor(140)
      doc.text(`SIBARITA · Kardex ${almacen} · ${ahora}`, 8, alto - 6)
      doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, ancho - 8, alto - 6, { align: 'right' })
    },
  })

  doc.save(`Kardex_${almacen}_${fechaArchivo()}.pdf`)
}
