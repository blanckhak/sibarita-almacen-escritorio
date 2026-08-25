import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

// Codigo de barras escaneable (Code128) generado a partir del mismo codigo correlativo
// de la etiqueta. Una pistola lectora actua como teclado: al escanear "escribe" el
// numero y envia Enter, lo que ya dispara la busqueda existente por codigo (seccion 5.2/10.1).
export default function CodigoBarras({ valor, height = 34 }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (svgRef.current && valor) {
      JsBarcode(svgRef.current, String(valor), {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        height,
        width: 1.6,
      })
    }
  }, [valor, height])

  if (!valor) return null
  return <svg ref={svgRef} className="max-w-full"></svg>
}
