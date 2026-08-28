import { useEffect, useState, useRef } from 'react'
import api from '../utils/api'

export default function Notificaciones() {
  const [alertas, setAlertas]       = useState([])
  const [abierto, setAbierto]       = useState(false)
  const [cargando, setCargando]     = useState(true)
  const ref = useRef(null)

  useEffect(() => {
    api.get('/api/alertas')
      .then(res => { setAlertas(res.data.alertas); setCargando(false) })
      .catch(() => setCargando(false))
  }, [])

  useEffect(() => {
    const cerrar = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])

  const stock       = alertas.filter(a => a.categoria === 'STOCK_BAJO')
  const devoluciones = alertas.filter(a => a.categoria === 'DEVOLUCION_VENCIDA')
  const sinMovimiento = alertas.filter(a => a.categoria === 'STOCK_SIN_MOVIMIENTO')
  const criticas    = stock.filter(a => a.nivel === 'critico')
  const advertencias = stock.filter(a => a.nivel === 'advertencia')
  const total = alertas.length
  const hayCritico = criticas.length > 0
    || devoluciones.some(d => d.nivel === 'critico')
    || sinMovimiento.some(s => s.nivel === 'critico')

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto(!abierto)}
        className="relative p-2 rounded-lg hover:bg-blue-800 transition"
        title="Notificaciones"
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {total > 0 && (
          <span className={`absolute -top-1 -right-1 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center ${hayCritico ? 'bg-red-500' : 'bg-yellow-500'}`}>
            {total}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 bg-gray-800 text-white flex items-center justify-between">
            <span className="font-semibold text-sm">Alertas de Stock</span>
            <span className="text-xs text-gray-300">{total} alertas</span>
          </div>

          {cargando && <p className="text-center text-gray-400 py-4 text-sm">Cargando...</p>}

          {!cargando && total === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-2xl mb-1">✅</p>
              <p className="text-sm text-gray-500">Todo el stock esta en orden</p>
            </div>
          )}

          {criticas.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-bold text-red-600 uppercase tracking-wide">Critico</p>
              {criticas.map((a, i) => (
                <div key={i} className="px-4 py-2.5 border-l-4 border-red-500 bg-red-50 mx-3 mb-2 rounded-r-lg">
                  <p className="text-xs font-semibold text-red-700">{a.almacen} — {a.tipo}</p>
                  <p className="text-xs text-red-500 mt-0.5">Solo {a.total} items disponibles</p>
                </div>
              ))}
            </div>
          )}

          {advertencias.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-bold text-yellow-600 uppercase tracking-wide">Advertencia</p>
              {advertencias.map((a, i) => (
                <div key={i} className="px-4 py-2.5 border-l-4 border-yellow-400 bg-yellow-50 mx-3 mb-2 rounded-r-lg">
                  <p className="text-xs font-semibold text-yellow-700">{a.almacen} — {a.tipo}</p>
                  <p className="text-xs text-yellow-600 mt-0.5">{a.total} items (umbral: 500)</p>
                </div>
              ))}
            </div>
          )}

          {devoluciones.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-bold text-orange-600 uppercase tracking-wide">Devolucion vencida</p>
              {devoluciones.map((a, i) => (
                <div key={i} className={`px-4 py-2.5 border-l-4 mx-3 mb-2 rounded-r-lg ${a.nivel === 'critico' ? 'border-red-500 bg-red-50' : 'border-orange-400 bg-orange-50'}`}>
                  <p className={`text-xs font-semibold ${a.nivel === 'critico' ? 'text-red-700' : 'text-orange-700'}`}>Nota {a.numero_nota}</p>
                  <p className={`text-xs mt-0.5 ${a.nivel === 'critico' ? 'text-red-500' : 'text-orange-600'}`}>
                    {a.persona_responsable} — {a.dias_habiles_pendiente} dias habiles pendiente
                  </p>
                </div>
              ))}
            </div>
          )}

          {sinMovimiento.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-bold text-slate-600 uppercase tracking-wide">Stock sin movimiento</p>
              {sinMovimiento.map((a, i) => (
                <div key={i} className={`px-4 py-2.5 border-l-4 mx-3 mb-2 rounded-r-lg ${a.nivel === 'critico' ? 'border-red-500 bg-red-50' : 'border-slate-400 bg-slate-50'}`}>
                  <p className={`text-xs font-semibold ${a.nivel === 'critico' ? 'text-red-700' : 'text-slate-700'}`}>{a.producto} — {a.almacen}</p>
                  <p className={`text-xs mt-0.5 ${a.nivel === 'critico' ? 'text-red-500' : 'text-slate-500'}`}>
                    {a.codigos} codigo(s), {a.dias_max}+ dias sin movimiento
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-3 bg-gray-50 border-t text-center">
            <p className="text-xs text-gray-400">Stock bajo: menos de 500 items</p>
          </div>
        </div>
      )}
    </div>
  )
}
