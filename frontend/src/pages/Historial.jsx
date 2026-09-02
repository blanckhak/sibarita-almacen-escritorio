import { useEffect, useState } from 'react'
import api from '../utils/api'
import { exportarCSV, exportarPDF } from '../utils/exportar'

const colorAccion = {
  LOGIN:    'bg-blue-100 text-blue-700',
  CREAR:    'bg-green-100 text-green-700',
  EDITAR:   'bg-yellow-100 text-yellow-700',
  ELIMINAR: 'bg-red-100 text-red-700',
}

export default function Historial() {
  const [logs, setLogs]           = useState([])
  const [cargando, setCargando]   = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [filtroAccion, setFiltroAccion] = useState('')

  useEffect(() => {
    api.get('/api/logs?limit=200')
      .then(res => { setLogs(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }, [])

  const acciones = [...new Set(logs.map(l => l.accion))]

  const filtrado = logs.filter(l => {
    const matchBusqueda = !busqueda ||
      l.usuario_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      l.detalle?.toLowerCase().includes(busqueda.toLowerCase()) ||
      l.ip?.toLowerCase().includes(busqueda.toLowerCase())
    const matchAccion = !filtroAccion || l.accion === filtroAccion
    return matchBusqueda && matchAccion
  })

  const columnas = [
    { titulo: 'Usuario',  campo: 'usuario_nombre' },
    { titulo: 'IP',       campo: 'ip'             },
    { titulo: 'Accion',   campo: 'accion'         },
    { titulo: 'Detalle',  campo: 'detalle'        },
    { titulo: 'Fecha',    campo: 'fecha'          },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Historial de Actividad</h1>
          <p className="text-gray-500 mt-1">Registro completo de acciones del sistema</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportarCSV(filtrado, columnas, 'historial')}
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Excel
          </button>
          <button
            onClick={() => exportarPDF(filtrado, columnas, 'Historial de Actividad', 'historial')}
            className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            PDF
          </button>
        </div>
      </div>

      {/* Estadisticas rapidas */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total acciones', valor: logs.length,                                     color: 'bg-blue-600' },
          { label: 'Logins hoy',     valor: logs.filter(l => l.accion === 'LOGIN').length,   color: 'bg-green-600' },
          { label: 'Usuarios activos', valor: new Set(logs.map(l => l.usuario_nombre)).size, color: 'bg-purple-600' },
          { label: 'Ultimas 24h',    valor: logs.filter(l => new Date(l.fecha) > new Date(Date.now() - 86400000)).length, color: 'bg-orange-500' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} text-white rounded-xl p-4 shadow`}>
            <p className="text-xs opacity-75">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.valor}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow p-4 mb-4 flex gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por usuario o detalle..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filtroAccion}
          onChange={e => setFiltroAccion(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las acciones</option>
          {acciones.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {(busqueda || filtroAccion) && (
          <button
            onClick={() => { setBusqueda(''); setFiltroAccion('') }}
            className="text-sm text-red-500 hover:text-red-700 px-2"
          >
            Limpiar
          </button>
        )}
        <span className="text-xs text-gray-400 whitespace-nowrap">{filtrado.length} registros</span>
      </div>

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando historial...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">Usuario</th>
                <th className="px-6 py-3 text-left">IP / Equipo</th>
                <th className="px-6 py-3 text-left">Accion</th>
                <th className="px-6 py-3 text-left">Detalle</th>
                <th className="px-6 py-3 text-left">Fecha y Hora</th>
              </tr>
            </thead>
            <tbody>
              {filtrado.map((log, i) => (
                <tr key={log.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-medium text-gray-800">{log.usuario_nombre}</td>
                  <td className="px-6 py-3 text-gray-500 text-xs font-mono">{log.ip || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorAccion[log.accion] || 'bg-gray-100 text-gray-600'}`}>
                      {log.accion}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{log.detalle || '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">
                    {new Date(log.fecha).toLocaleString('es-GT')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrado.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay registros de actividad</p>
          )}
        </div>
      )}
    </div>
  )
}
