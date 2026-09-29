import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { descargarExcel, fechaArchivo } from './excelEstilo'

// Misma firma que exportarPDF. opciones.totales agrega una fila TOTAL con la
// suma de las columnas numericas.
export function exportarExcel(datos, columnas, titulo, nombreArchivo, opciones = {}) {
  return descargarExcel(`${nombreArchivo}_${fechaArchivo()}`, [{
    nombre: titulo,
    titulo,
    columnas,
    filas: datos,
    totales: opciones.totales,
  }]).catch(err => console.error('No se pudo generar el Excel', err))
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
