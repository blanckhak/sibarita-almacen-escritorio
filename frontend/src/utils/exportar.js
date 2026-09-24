import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function exportarCSV(datos, columnas, nombreArchivo) {
  const encabezado = columnas.map(c => c.titulo).join(',')
  const filas = datos.map(fila =>
    columnas.map(c => `"${fila[c.campo] ?? ''}"`).join(',')
  )
  const csv = [encabezado, ...filas].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${nombreArchivo}_${new Date().toLocaleDateString('es-GT').replace(/\//g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function exportarPDF(datos, columnas, titulo, nombreArchivo) {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.setTextColor(30, 58, 138)
  doc.text('SIBARITA', 14, 16)

  doc.setFontSize(11)
  doc.setTextColor(100)
  doc.text(titulo, 14, 24)
  doc.text(`Generado: ${new Date().toLocaleDateString('es-GT')}`, 14, 30)

  autoTable(doc, {
    startY: 36,
    head: [columnas.map(c => c.titulo)],
    body: datos.map(fila => columnas.map(c => fila[c.campo] ?? '—')),
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    styles: { fontSize: 9 },
  })

  doc.save(`${nombreArchivo}_${new Date().toLocaleDateString('es-GT').replace(/\//g, '-')}.pdf`)
}
