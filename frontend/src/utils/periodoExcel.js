// Fase 14/15: exporta la tabla "productos por periodo" a un .xls (SpreadsheetML,
// sin dependencias, mismo enfoque que kardexExcel.js).

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const celdaTexto  = (v) => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`
const celdaHead   = (v) => `<Cell ss:StyleID="sHead"><Data ss:Type="String">${esc(v)}</Data></Cell>`
const celdaNum    = (v) => `<Cell><Data ss:Type="Number">${Number(v ?? 0)}</Data></Cell>`

// data = { periodo, cerrado, productos: [...] }  (respuesta de /api/reportes/periodo)
export function exportarProductosPeriodo(data) {
  const { periodo, cerrado, productos } = data
  const cols = ['Producto', 'Unidad',
    'Apertura nuevo', 'Apertura devol.',
    'Ingresos', 'Salidas',
    cerrado ? 'Cierre nuevo' : 'Stock nuevo',
    cerrado ? 'Cierre devol.' : 'Stock devol.',
    'Movimiento neto']

  const filas = productos.map(p => {
    const apertura = Number(p.apertura_nuevo) + Number(p.apertura_devolucion)
    const stock = Number(p.stock_nuevo) + Number(p.stock_devolucion)
    return '<Row>' +
      celdaTexto(p.producto_nombre) +
      celdaTexto(p.unidad || '') +
      celdaNum(p.apertura_nuevo) +
      celdaNum(p.apertura_devolucion) +
      celdaNum(p.ingresos) +
      celdaNum(p.salidas) +
      celdaNum(p.stock_nuevo) +
      celdaNum(p.stock_devolucion) +
      celdaNum(Math.round((stock - apertura) * 1000) / 1000) +
      '</Row>'
  }).join('')

  const rango = `${periodo.fecha_inicio ? String(periodo.fecha_inicio).slice(0, 10) : ''} a ${periodo.fecha_fin ? String(periodo.fecha_fin).slice(0, 10) : '(abierto)'}`

  const worksheet =
    `<Worksheet ss:Name="Productos">` +
    `<Table>` +
      `<Row><Cell ss:StyleID="sTitulo"><Data ss:Type="String">${esc(periodo.almacen_nombre || '')} - ${esc(periodo.nombre)}${cerrado ? ' (CERRADO)' : ' (ACTIVO)'}</Data></Cell></Row>` +
      `<Row><Cell ss:StyleID="sSub"><Data ss:Type="String">Periodo: ${esc(rango)}</Data></Cell></Row>` +
      `<Row></Row>` +
      `<Row>${cols.map(celdaHead).join('')}</Row>` +
      filas +
    `</Table>` +
    `</Worksheet>`

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
    worksheet +
    '</Workbook>'

  const blob = new Blob(['﻿' + xml], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const nombreArch = `Periodo_${(periodo.almacen_nombre || '').replace(/\s+/g, '')}_${String(periodo.nombre).replace(/\s+/g, '_')}.xls`
  a.download = nombreArch
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
