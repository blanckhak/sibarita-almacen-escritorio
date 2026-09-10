import { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { usePeriodo } from '../context/PeriodoContext'
import { hoyLocal } from '../utils/fecha'
import { fmtCantidad } from '../utils/fmt'
import { exportarProductosPeriodo } from '../utils/periodoExcel'

// Fase 14 (R7-a): listado de periodos por almacen + abrir el primer periodo de
// un almacen que todavia no tiene ninguno. Cerrar / reabrir / export / purga
// son Fase 15.
export default function Periodos() {
  const { usuario } = useAuth()
  const { periodos, almacenes, recargarPeriodos } = usePeriodo()
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje]   = useState(null)
  const [form, setForm] = useState(null) // { almacen_id, nombre, fecha_inicio }
  const [guardando, setGuardando] = useState(false)
  // Productos del periodo (panel + export Excel)
  const [verProductos, setVerProductos] = useState(null) // { periodo, cerrado, productos }
  const [cargandoProd, setCargandoProd] = useState(false)

  const puedeAbrir = ['admin', 'almacen', 'almacenero3'].includes(usuario?.rol)

  useEffect(() => { recargarPeriodos().finally(() => setCargando(false)) }, [recargarPeriodos])

  const almacenesSinActivo = almacenes.filter(
    a => !periodos.some(p => p.almacen_id === a.id && p.estado === 'ACTIVO')
  )

  const abrir = async () => {
    if (!form?.almacen_id || !form.nombre.trim() || !form.fecha_inicio) return
    setGuardando(true)
    try {
      await api.post('/api/periodos', {
        almacen_id: Number(form.almacen_id),
        nombre: form.nombre.trim(),
        fecha_inicio: form.fecha_inicio,
      })
      setMensaje({ tipo: 'ok', texto: 'Periodo abierto' })
      setForm(null)
      await recargarPeriodos()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudo abrir el periodo' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  const abrirProductos = async (p) => {
    setCargandoProd(true)
    setVerProductos({ periodo: p, cerrado: p.estado === 'CERRADO', productos: null })
    try {
      const { data } = await api.get('/api/reportes/periodo', { params: { periodo_id: p.id } })
      setVerProductos(data)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudieron cargar los productos' })
      setVerProductos(null)
      setTimeout(() => setMensaje(null), 4000)
    } finally {
      setCargandoProd(false)
    }
  }

  if (cargando) return <div className="p-6 text-center py-12 text-gray-400">Cargando...</div>

  const fmt = d => d ? new Date(d).toLocaleDateString('es-GT') : '—'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Periodos</h1>
          <p className="text-gray-500">Un periodo activo por almacen. Toda guia y nota de salida entra en el periodo activo de su almacen.</p>
        </div>
        {puedeAbrir && almacenesSinActivo.length > 0 && !form && (
          <button
            onClick={() => setForm({ almacen_id: String(almacenesSinActivo[0].id), nombre: '', fecha_inicio: hoyLocal() })}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium"
          >
            Abrir periodo
          </button>
        )}
      </div>

      {mensaje && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>{mensaje.texto}</div>
      )}

      {form && (
        <div className="bg-white rounded-xl shadow p-5 mb-6 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Abrir periodo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Almacen</label>
              <select
                value={form.almacen_id}
                onChange={e => setForm(f => ({ ...f, almacen_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {almacenesSinActivo.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del periodo</label>
              <input
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value.toUpperCase() }))}
                maxLength={60}
                placeholder="Ej: Periodo 1 - 2026"
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha de inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setForm(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={abrir} disabled={guardando} className="px-5 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {guardando ? 'Abriendo...' : 'Abrir'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-white">
            <tr>
              <th className="px-4 py-3 text-left">Almacen</th>
              <th className="px-4 py-3 text-left">Periodo</th>
              <th className="px-4 py-3 text-left">Rango</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-right">Guias</th>
              <th className="px-4 py-3 text-right">Notas</th>
              <th className="px-4 py-3 text-right">Productos</th>
            </tr>
          </thead>
          <tbody>
            {periodos.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No hay periodos todavia</td></tr>
            )}
            {periodos.map((p, i) => (
              <tr key={p.id} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                <td className="px-4 py-3 font-medium text-gray-800">{p.almacen_nombre}</td>
                <td className="px-4 py-3 text-gray-700">{p.nombre}</td>
                <td className="px-4 py-3 text-gray-500">{fmt(p.fecha_inicio)} — {fmt(p.fecha_fin)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    p.estado === 'ACTIVO' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                  }`}>{p.estado}</span>
                </td>
                <td className="px-4 py-3 text-right">{p.total_guias}</td>
                <td className="px-4 py-3 text-right">{p.total_notas}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => abrirProductos(p)}
                    className="text-sm border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition"
                  >
                    Ver productos
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {verProductos && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setVerProductos(null)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  Productos del periodo — {verProductos.periodo.almacen_nombre} · {verProductos.periodo.nombre}
                </h2>
                <p className="text-xs text-gray-500">
                  {verProductos.cerrado ? 'Periodo CERRADO: se muestra la foto de cierre.' : 'Periodo ACTIVO: el stock es el actual.'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => exportarProductosPeriodo(verProductos)}
                  disabled={!verProductos.productos || verProductos.productos.length === 0}
                  className="bg-green-700 hover:bg-green-800 text-white text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                >
                  Exportar Excel
                </button>
                <button onClick={() => setVerProductos(null)} className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">
                  Cerrar
                </button>
              </div>
            </div>
            <div className="overflow-auto">
              {cargandoProd || !verProductos.productos ? (
                <div className="p-8 text-center text-gray-400">Cargando productos...</div>
              ) : verProductos.productos.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Sin productos en este periodo</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-left">Unid.</th>
                      <th className="px-3 py-2 text-right">Apertura</th>
                      <th className="px-3 py-2 text-right">Ingresos</th>
                      <th className="px-3 py-2 text-right">Salidas</th>
                      <th className="px-3 py-2 text-right">{verProductos.cerrado ? 'Cierre' : 'Stock actual'}</th>
                      <th className="px-3 py-2 text-right">Mov. neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verProductos.productos.map(p => {
                      const apertura = Number(p.apertura_nuevo) + Number(p.apertura_devolucion)
                      const stock = Number(p.stock_nuevo) + Number(p.stock_devolucion)
                      const mov = Math.round((stock - apertura) * 1000) / 1000
                      return (
                        <tr key={p.producto_id} className="border-b border-gray-100">
                          <td className="px-3 py-2 text-gray-800">{p.producto_nombre}</td>
                          <td className="px-3 py-2 text-gray-500">{p.unidad || '—'}</td>
                          <td className="px-3 py-2 text-right">{fmtCantidad(apertura)}</td>
                          <td className="px-3 py-2 text-right text-green-700">{fmtCantidad(p.ingresos)}</td>
                          <td className="px-3 py-2 text-right text-red-700">{fmtCantidad(p.salidas)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtCantidad(stock)}</td>
                          <td className={`px-3 py-2 text-right ${mov < 0 ? 'text-red-700' : mov > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                            {mov > 0 ? '+' : ''}{fmtCantidad(mov)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
