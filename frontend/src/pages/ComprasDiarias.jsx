import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { hoyLocal } from '../utils/fecha'

const LINEA_VACIA = () => ({ descripcion: '', cantidad: '', monto_unitario: '' })

const FORM_VACIO = () => ({
  fecha: hoyLocal(), oficina: '', proveedor: '', solicitud_id: '', observaciones: '',
  lineas: [LINEA_VACIA()],
})

const money = (n) => Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ComprasDiarias() {
  const { usuario } = useAuth()
  const [compras, setCompras]         = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [cargando, setCargando]       = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando]     = useState(false)
  const [mensaje, setMensaje]         = useState(null)
  const [form, setForm]               = useState(FORM_VACIO())

  const puedeRegistrar = ['admin', 'compras'].includes(usuario?.rol)

  const cargarDatos = async () => {
    try {
      const [c, s] = await Promise.all([
        api.get('/api/compras-diarias'),
        api.get('/api/solicitudes-materiales'),
      ])
      setCompras(c.data)
      setSolicitudes(s.data)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudieron cargar las compras diarias' })
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargarDatos() }, [])

  const abrirNuevo = () => {
    setForm(FORM_VACIO())
    setMostrarForm(true)
  }

  const actualizarLinea = (i, campo, valor) => {
    setForm(f => {
      const lineas = [...f.lineas]
      lineas[i] = { ...lineas[i], [campo]: valor }
      return { ...f, lineas }
    })
  }

  const agregarLinea = () => setForm(f => ({ ...f, lineas: [...f.lineas, LINEA_VACIA()] }))
  const quitarLinea = (i) => setForm(f => ({ ...f, lineas: f.lineas.filter((_, idx) => idx !== i) }))

  const totalForm = form.lineas.reduce(
    (s, l) => s + (Number(l.cantidad) || 0) * (Number(l.monto_unitario) || 0),
    0,
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.post('/api/compras-diarias', {
        ...form,
        solicitud_id: form.solicitud_id || null,
      })
      setMensaje({ tipo: 'ok', texto: 'Compra diaria registrada correctamente' })
      setMostrarForm(false)
      cargarDatos()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar la compra' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Compras Diarias</h1>
          <p className="text-gray-500 mt-1">Registro de compras del dia por oficina, con su solicitud asociada</p>
        </div>
        {puedeRegistrar && (
          <button
            onClick={() => mostrarForm ? setMostrarForm(false) : abrirNuevo()}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            {mostrarForm ? 'Cancelar' : '+ Nueva Compra'}
          </button>
        )}
      </div>

      {mensaje && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {mostrarForm && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Nueva Compra Diaria</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Fecha</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={e => setForm({ ...form, fecha: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Oficina</label>
                <input
                  required
                  value={form.oficina}
                  onChange={e => setForm({ ...form, oficina: e.target.value })}
                  placeholder="Ej: Oficina Central, Planta..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Proveedor (opcional)</label>
                <input
                  value={form.proveedor}
                  onChange={e => setForm({ ...form, proveedor: e.target.value })}
                  placeholder="Nombre del proveedor..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-600 mb-1">Solicitud de Materiales asociada (opcional)</label>
                <select
                  value={form.solicitud_id}
                  onChange={e => setForm({ ...form, solicitud_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin solicitud asociada</option>
                  {solicitudes.map(s => (
                    <option key={s.id} value={s.id}>
                      N.° {s.numero_solicitud} — {s.persona_responsable} ({s.almacen_nombre})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Observaciones</label>
                <input
                  value={form.observaciones}
                  onChange={e => setForm({ ...form, observaciones: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2 mb-3">
              {form.lineas.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 items-end bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="col-span-6">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Descripcion</label>
                    <input
                      required
                      value={l.descripcion}
                      onChange={e => actualizarLinea(i, 'descripcion', e.target.value)}
                      placeholder="Que se compro..."
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad</label>
                    <input
                      required
                      type="number" min="0.01" step="0.01"
                      value={l.cantidad}
                      onChange={e => actualizarLinea(i, 'cantidad', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Monto unit.</label>
                    <input
                      required
                      type="number" min="0" step="0.01"
                      value={l.monto_unitario}
                      onChange={e => actualizarLinea(i, 'monto_unitario', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-1 text-right text-sm text-gray-600 pb-2">
                    {money((Number(l.cantidad) || 0) * (Number(l.monto_unitario) || 0))}
                  </div>
                  <div className="col-span-1 flex justify-center pb-1.5">
                    {form.lineas.length > 1 && (
                      <button type="button" onClick={() => quitarLinea(i)} className="text-red-500 hover:text-red-700 text-sm">
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={agregarLinea}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50"
              >
                + Agregar linea
              </button>
              <div className="text-sm font-semibold text-gray-700">Total: {money(totalForm)}</div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Registrar Compra'}
              </button>
            </div>
          </form>
        </div>
      )}

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando compras diarias...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">N° Compra</th>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-left">Oficina</th>
                <th className="px-6 py-3 text-left">Proveedor</th>
                <th className="px-6 py-3 text-left">Solicitud</th>
                <th className="px-6 py-3 text-right">Lineas</th>
                <th className="px-6 py-3 text-right">Monto total</th>
                <th className="px-6 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-mono font-semibold text-gray-800">{c.numero_compra}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{new Date(c.fecha).toLocaleDateString('es-GT')}</td>
                  <td className="px-6 py-3 text-gray-700">{c.oficina}</td>
                  <td className="px-6 py-3 text-gray-500">{c.proveedor || '—'}</td>
                  <td className="px-6 py-3 text-gray-500">{c.numero_solicitud ? `N.° ${c.numero_solicitud}` : '—'}</td>
                  <td className="px-6 py-3 text-right">{c.total_lineas}</td>
                  <td className="px-6 py-3 text-right font-medium text-gray-700">{money(c.monto_total)}</td>
                  <td className="px-6 py-3 text-right">
                    <Link to={`/compras-diarias/${c.id}`} className="text-sm border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {compras.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay compras diarias registradas todavia</p>
          )}
        </div>
      )}
    </div>
  )
}
