// onClick opcional: si viene, la tarjeta se puede pulsar (abre el Kardex del
// almacen en el Dashboard) y `seleccionada` la resalta.
export default function TarjetaAlmacen({ almacen, nuevos, devoluciones, total, onClick, seleccionada }) {
  const porcentajeNuevos = total ? Math.round((nuevos / total) * 100) : 0

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())) : undefined}
      className={`bg-white rounded-xl shadow-md p-6 border transition ${
        seleccionada ? 'border-blue-600 ring-2 ring-blue-500 shadow-lg' : 'border-gray-100 hover:shadow-lg'
      } ${onClick ? 'cursor-pointer hover:border-blue-300' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">{almacen}</h3>
        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full">
          Activo
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Nuevos</p>
          <p className="text-2xl font-bold text-green-600">{Number(nuevos).toLocaleString()}</p>
        </div>
        <div className="bg-orange-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Devoluciones</p>
          <p className="text-2xl font-bold text-orange-500">{Number(devoluciones).toLocaleString()}</p>
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-gray-500">Total items</span>
          <span className="text-lg font-bold text-gray-800">{Number(total).toLocaleString()}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${porcentajeNuevos}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-gray-400">{porcentajeNuevos}% nuevos</p>
          {onClick && (
            <p className="text-xs font-medium text-blue-700">{seleccionada ? 'Viendo kardex ▾' : 'Ver kardex ›'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
