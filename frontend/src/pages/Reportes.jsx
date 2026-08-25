import { useEffect, useState } from 'react'
import api from '../utils/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { exportarCSV, exportarPDF } from '../utils/exportar'

export default function Reportes() {
  const [resumen, setResumen]         = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [inventario, setInventario]   = useState([])
  const [reimpresiones, setReimpresiones] = useState([])
  const [cargando, setCargando]       = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/inventario/resumen'),
      api.get('/api/movimientos'),
      api.get('/api/inventario'),
      api.get('/api/etiquetas/reportes/reimpresiones'),
    ]).then(([res, mov, inv, reimp]) => {
      setResumen(res.data)
      setMovimientos(mov.data)
      setInventario(inv.data)
      setReimpresiones(reimp.data)
      setCargando(false)
    })
  }, [])

  const totalGeneral = resumen.reduce((s, a) => s + Number(a.total), 0)
  const totalNuevos  = resumen.reduce((s, a) => s + Number(a.nuevos), 0)
  const totalDev     = resumen.reduce((s, a) => s + Number(a.devoluciones), 0)

  const datosGrafica = resumen.map(a => ({
    almacen:      a.almacen,
    Nuevos:       Number(a.nuevos),
    Devoluciones: Number(a.devoluciones),
  }))

  if (cargando) return <div className="p-6 text-center text-gray-400">Cargando reportes...</div>

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Reportes</h1>
        <p className="text-gray-500 mt-1">Genera y exporta reportes del sistema</p>
      </div>

      {/* Tarjetas de reporte */}
      <div className="grid grid-cols-4 gap-6 mb-10">

        {/* Reporte resumen */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-100 text-blue-700 p-2 rounded-lg text-xl">📊</div>
            <div>
              <h3 className="font-semibold text-gray-800">Resumen de Almacenes</h3>
              <p className="text-xs text-gray-400">{resumen.length} almacenes</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Total: {totalGeneral.toLocaleString()} items</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(resumen, [
                { titulo: 'Almacen', campo: 'almacen' },
                { titulo: 'Nuevos', campo: 'nuevos' },
                { titulo: 'Devoluciones', campo: 'devoluciones' },
                { titulo: 'Total', campo: 'total' },
              ], 'resumen_almacenes')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(resumen, [
                { titulo: 'Almacen', campo: 'almacen' },
                { titulo: 'Nuevos', campo: 'nuevos' },
                { titulo: 'Devoluciones', campo: 'devoluciones' },
                { titulo: 'Total', campo: 'total' },
              ], 'Resumen de Almacenes', 'resumen_almacenes')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Reporte inventario */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-100 text-green-700 p-2 rounded-lg text-xl">📦</div>
            <div>
              <h3 className="font-semibold text-gray-800">Inventario Completo</h3>
              <p className="text-xs text-gray-400">{inventario.length} registros</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Nuevos: {totalNuevos.toLocaleString()} | Dev: {totalDev.toLocaleString()}</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(inventario, [
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Tipo', campo: 'tipo' },
                { titulo: 'Cantidad', campo: 'cantidad' },
                { titulo: 'Descripcion', campo: 'descripcion' },
              ], 'inventario_completo')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(inventario, [
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Tipo', campo: 'tipo' },
                { titulo: 'Cantidad', campo: 'cantidad' },
                { titulo: 'Descripcion', campo: 'descripcion' },
              ], 'Inventario Completo', 'inventario_completo')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>

        {/* Reporte movimientos */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-orange-100 text-orange-600 p-2 rounded-lg text-xl">🔄</div>
            <div>
              <h3 className="font-semibold text-gray-800">Movimientos</h3>
              <p className="text-xs text-gray-400">{movimientos.length} registros</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Traslados, entradas y salidas</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(movimientos, [
                { titulo: 'Tipo', campo: 'tipo' },
                { titulo: 'Origen', campo: 'origen' },
                { titulo: 'Destino', campo: 'destino' },
                { titulo: 'Cantidad', campo: 'cantidad' },
                { titulo: 'Descripcion', campo: 'descripcion' },
              ], 'movimientos')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(movimientos, [
                { titulo: 'Tipo', campo: 'tipo' },
                { titulo: 'Origen', campo: 'origen' },
                { titulo: 'Destino', campo: 'destino' },
                { titulo: 'Cantidad', campo: 'cantidad' },
              ], 'Reporte de Movimientos', 'movimientos')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>
        {/* Reporte reimpresiones */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-yellow-100 text-yellow-700 p-2 rounded-lg text-xl">🏷️</div>
            <div>
              <h3 className="font-semibold text-gray-800">Reimpresiones de Etiqueta</h3>
              <p className="text-xs text-gray-400">{reimpresiones.length} registros</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Quien y cuando reimprimio cada codigo</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarCSV(reimpresiones, [
                { titulo: 'Codigo', campo: 'etiqueta_codigo' },
                { titulo: 'Producto', campo: 'producto_nombre' },
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Usuario', campo: 'usuario_nombre' },
                { titulo: 'Fecha', campo: 'fecha' },
              ], 'reimpresiones_etiquetas')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition"
            >
              Excel
            </button>
            <button
              onClick={() => exportarPDF(reimpresiones, [
                { titulo: 'Codigo', campo: 'etiqueta_codigo' },
                { titulo: 'Producto', campo: 'producto_nombre' },
                { titulo: 'Almacen', campo: 'almacen_nombre' },
                { titulo: 'Usuario', campo: 'usuario_nombre' },
              ], 'Reimpresiones de Etiqueta', 'reimpresiones_etiquetas')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition"
            >
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Grafica comparativa */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-6">Grafica Comparativa por Almacen</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={datosGrafica} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="almacen" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="Nuevos"       fill="#16a34a" radius={[4,4,0,0]} />
            <Bar dataKey="Devoluciones" fill="#f97316" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
