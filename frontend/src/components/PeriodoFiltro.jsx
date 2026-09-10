import { usePeriodo } from '../context/PeriodoContext'

// Fase 16: el selector de periodo salio del navbar. Ahora vive dentro de las
// pantallas que filtran por periodo (Guias, Notas de Salida). Elige almacen +
// periodo para VER; el alta siempre entra en el periodo activo (lo decide el
// backend). El hub para abrir/cerrar/ver productos es la pantalla Periodos.
export default function PeriodoFiltro({ className = '' }) {
  const {
    almacenes, periodosDelAlmacen,
    almacenSel, setAlmacenSel,
    periodoSel, setPeriodoSel,
  } = usePeriodo()

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Periodo</span>
      <select
        value={almacenSel}
        onChange={e => setAlmacenSel(e.target.value)}
        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
      </select>
      <select
        value={periodoSel}
        onChange={e => setPeriodoSel(e.target.value)}
        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px]"
      >
        {periodosDelAlmacen.length === 0 && <option value="">Sin periodos</option>}
        {periodosDelAlmacen.map(p => (
          <option key={p.id} value={p.id}>
            {p.nombre}{p.estado === 'ACTIVO' ? ' (activo)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
