import { useEffect, useState } from 'react'
import api from '../utils/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts'
import TarjetaAlmacen from '../components/TarjetaAlmacen'
import { exportarCSV, exportarPDF } from '../utils/exportar'

const COLORES = ['#1d4ed8', '#16a34a', '#f97316']

export default function Dashboard() {
  const [resumen, setResumen]     = useState([])
  const [cargando, setCargando]   = useState(true)
  const [error, setError]         = useState(null)
  const [fase2, setFase2]         = useState(null)

  useEffect(() => {
    api.get('/api/inventario/resumen')
      .then(res => { setResumen(res.data); setCargando(false) })
      .catch(() => { setError('No se pudo conectar al servidor'); setCargando(false) })
    api.get('/api/dashboard/fase2').then(res => setFase2(res.data)).catch(() => {})
  }, [])

  const totalGeneral = resumen.reduce((s, a) => s + Number(a.total), 0)
  const totalNuevos  = resumen.reduce((s, a) => s + Number(a.nuevos), 0)
  const totalDev     = resumen.reduce((s, a) => s + Number(a.devoluciones), 0)

  const datosGrafica = resumen.map(a => ({
    almacen:      a.almacen,
    Nuevos:       Number(a.nuevos),
    Devoluciones: Number(a.devoluciones),
    total:        Number(a.total),
  }))

  const datosPie = [
    { name: 'Nuevos',       value: totalNuevos },
    { name: 'Devoluciones', value: totalDev    },
  ]

  const columnasExport = [
    { titulo: 'Almacen',      campo: 'almacen'      },
    { titulo: 'Nuevos',       campo: 'nuevos'       },
    { titulo: 'Devoluciones', campo: 'devoluciones' },
    { titulo: 'Total',        campo: 'total'        },
  ]

  return (
    <div className="p-6">

      {/* Encabezado */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 mt-1">Resumen general de todos los almacenes</p>
        </div>
        {!cargando && !error && (
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(resumen, columnasExport, 'resumen_almacenes')}
              className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg transition flex items-center gap-2"
            >
              Exportar Excel
            </button>
            <button
              onClick={() => exportarPDF(resumen, columnasExport, 'Resumen de Almacenes', 'resumen_almacenes')}
              className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg transition flex items-center gap-2"
            >
              Exportar PDF
            </button>
          </div>
        )}
      </div>

      {/* Totales */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-700 text-white rounded-xl p-5 shadow">
          <p className="text-sm opacity-80">Total General</p>
          <p className="text-4xl font-bold mt-1">{totalGeneral.toLocaleString()}</p>
          <p className="text-xs opacity-60 mt-1">items en todos los almacenes</p>
        </div>
        <div className="bg-green-600 text-white rounded-xl p-5 shadow">
          <p className="text-sm opacity-80">Total Nuevos</p>
          <p className="text-4xl font-bold mt-1">{totalNuevos.toLocaleString()}</p>
          <p className="text-xs opacity-60 mt-1">{totalGeneral ? Math.round((totalNuevos/totalGeneral)*100) : 0}% del total</p>
        </div>
        <div className="bg-orange-500 text-white rounded-xl p-5 shadow">
          <p className="text-sm opacity-80">Total Devoluciones</p>
          <p className="text-4xl font-bold mt-1">{totalDev.toLocaleString()}</p>
          <p className="text-xs opacity-60 mt-1">{totalGeneral ? Math.round((totalDev/totalGeneral)*100) : 0}% del total</p>
        </div>
      </div>

      {/* Panel Fase 2: guias, codigos, notas y rotacion de productos */}
      {fase2 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Fase 2 — Ingresos y Salidas</h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow p-5 border border-gray-100">
              <p className="text-xs text-gray-400 uppercase font-semibold">Guias ingresadas</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{fase2.guias_ingresadas}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-5 border border-gray-100">
              <p className="text-xs text-gray-400 uppercase font-semibold">Codigos generados</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{fase2.codigos_generados}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-5 border border-gray-100">
              <p className="text-xs text-gray-400 uppercase font-semibold">Notas de salida pendientes</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">{fase2.notas_pendientes}</p>
            </div>
          </div>
          {fase2.top_productos.length > 0 && (
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="text-base font-semibold text-gray-700 mb-4">Productos que mas rotan</h3>
              <div className="space-y-2">
                {fase2.top_productos.map((p, i) => (
                  <div key={p.producto_nombre} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                    <span className="text-sm text-gray-700 flex-1">{p.producto_nombre}</span>
                    <span className="text-sm font-bold text-gray-800">{p.total_movido}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {cargando && <div className="text-center py-12 text-gray-400">Cargando...</div>}
      {error    && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">{error}</div>}

      {!cargando && !error && (
        <>
          {/* Tarjetas por almacen */}
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Por Almacen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {resumen.map(item => (
              <TarjetaAlmacen
                key={item.almacen}
                almacen={item.almacen}
                nuevos={item.nuevos}
                devoluciones={item.devoluciones}
                total={item.total}
              />
            ))}
          </div>

          {/* Graficas */}
          <div className="grid grid-cols-2 gap-6 mb-10">

            {/* Barras */}
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="text-base font-semibold text-gray-700 mb-4">Comparativa por Almacen</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={datosGrafica} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="almacen" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Nuevos"       fill="#16a34a" radius={[4,4,0,0]} />
                  <Bar dataKey="Devoluciones" fill="#f97316" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie */}
            <div className="bg-white rounded-xl shadow p-6">
              <h3 className="text-base font-semibold text-gray-700 mb-4">Distribucion Global</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={datosPie}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                  >
                    {datosPie.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#16a34a' : '#f97316'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => v.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla resumen */}
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Tabla de Resumen</h2>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="px-6 py-3 text-left">Almacen</th>
                  <th className="px-6 py-3 text-right">Nuevos</th>
                  <th className="px-6 py-3 text-right">Devoluciones</th>
                  <th className="px-6 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((item, i) => (
                  <tr key={item.almacen} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 font-semibold text-gray-800">{item.almacen}</td>
                    <td className="px-6 py-4 text-right text-green-600 font-medium">{Number(item.nuevos).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-orange-500 font-medium">{Number(item.devoluciones).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-gray-800">{Number(item.total).toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="bg-blue-50 border-t-2 border-blue-200">
                  <td className="px-6 py-4 font-bold text-blue-800">TOTAL GENERAL</td>
                  <td className="px-6 py-4 text-right font-bold text-green-700">{totalNuevos.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-orange-600">{totalDev.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-blue-800">{totalGeneral.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
