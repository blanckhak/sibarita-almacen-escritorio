// Overlay de previsualizacion antes de imprimir. Muestra el documento ya
// armado (tal como saldra en papel) con botones Imprimir / Cerrar.
//
// Uso: envolver los bloques de impresion. Cuando `abierto` es false el
// componente no altera el layout (los hijos siguen con su `hidden print:block`
// para que un Ctrl+P directo siga funcionando). Cuando esta abierto, el
// documento se ve en pantalla y "Imprimir" dispara window.print().
//
// `onImprimir` opcional: si se pasa, el boton lo llama en vez de window.print()
// directo (el handler decide cuando imprimir; util para registrar la impresion
// solo cuando el usuario realmente imprime).
export default function PreviewImpresion({ abierto, onCerrar, onImprimir, children }) {
  if (!abierto) return <>{children}</>
  return (
    <div className="fixed inset-0 z-[60] bg-neutral-400/95 overflow-auto print:static print:bg-transparent print:overflow-visible print:z-auto">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between bg-white border-b border-gray-300 shadow-sm px-4 py-2">
        <span className="text-sm font-medium text-gray-600">Previsualizacion de impresion</span>
        <div className="flex gap-2">
          <button
            onClick={() => (onImprimir ? onImprimir() : window.print())}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            Imprimir
          </button>
          <button
            onClick={onCerrar}
            className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
      <div className="mx-auto my-6 max-w-[900px] bg-white shadow-xl p-8 print:my-0 print:max-w-none print:shadow-none print:p-0">
        {children}
      </div>
    </div>
  )
}
