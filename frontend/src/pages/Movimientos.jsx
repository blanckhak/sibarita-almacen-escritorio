import { useEffect, useState } from 'react'
import api from '../utils/api'

const TIPOS = ['TRASLADO', 'ENTRADA', 'SALIDA', 'DEVOLUCION']

export default function Movimientos() {
  const [movimientos, setMovimientos] = useState([])
  const [almacenes, setAlmacenes]     = useState([])
  const [productosOrigen, setProductosOrigen] = useState([])
  const [cargando, setCargando]       = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando]     = useState(false)
  const [mensaje, setMensaje]         = useState(null)
  const [form, setForm] = useState({
    almacen_origen_id: '', almacen_destino_id: '', producto_id: '', tipo: 'TRASLADO', cantidad: '', descripcion: ''
  })

  const cargarDatos = async () => {
    const [mov, alm] = await Promise.all([
      api.get('/api/movimientos'),
      api.get('/api/almacenes'),
    ])
    setMovimientos(mov.data)
    setAlmacenes(alm.data)
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [])

  useEffect(() => {
    if (!form.almacen_origen_id) {
      setProductosOrigen([])
      return
    }
    api.get('/api/inventario/disponible', { params: { almacen_id: form.almacen_origen_id } })
      .then(({ data }) => setProductosOrigen(data))
      .catch(() => setProductosOrigen([]))
  }, [form.almacen_origen_id])

  const productoSeleccionado = productosOrigen.find(p => p.producto_id === Number(form.producto_id))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.almacen_origen_id === form.almacen_destino_id) {
      setMensaje({ tipo: 'error', texto: 'El origen y destino no pueden ser el mismo almacen' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    if (productoSeleccionado && Number(form.cantidad) > Number(productoSeleccionado.cantidad)) {
      setMensaje({ tipo: 'error', texto: `Stock insuficiente en el origen (disponible: ${productoSeleccionado.cantidad})` })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setGuardando(true)
    try {
      await api.post('/api/movimientos', form)
      setMensaje({ tipo: 'ok', texto: 'Movimiento registrado correctamente' })
      setForm({ almacen_origen_id: '', almacen_destino_id: '', producto_id: '', tipo: 'TRASLADO', cantidad: '', descripcion: '' })
      setMostrarForm(false)
      cargarDatos()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const colorTipo = {
    TRASLADO:    'bg-blue-100 text-blue-700',
    ENTRADA:     'bg-green-100 text-green-700',
    SALIDA:      'bg-red-100 text-red-600',
    DEVOLUCION:  'bg-orange-100 text-orange-700',
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Movimientos</h1>
          <p className="text-gray-500 mt-1">Traslados y movimientos entre almacenes</p>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-lg font-medium transition"
        >
          {mostrarForm ? 'Cancelar' : '+ Nuevo Movimiento'}
        </button>
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

      {/* Formulario */}
      {mostrarForm && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Registrar movimiento</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Almacen Origen</label>
              <select
                required
                value={form.almacen_origen_id}
                onChange={e => setForm({ ...form, almacen_origen_id: e.target.value, producto_id: '' })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar origen...</option>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Almacen Destino</label>
              <select
                required
                value={form.almacen_destino_id}
                onChange={e => setForm({ ...form, almacen_destino_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar destino...</option>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Producto</label>
              <select
                required
                disabled={!form.almacen_origen_id}
                value={form.producto_id}
                onChange={e => setForm({ ...form, producto_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="">
                  {form.almacen_origen_id ? 'Seleccionar producto...' : 'Primero elige el origen'}
                </option>
                {productosOrigen.map(p => (
                  <option key={p.producto_id} value={p.producto_id}>
                    {p.producto_nombre} (disponible: {p.cantidad})
                  </option>
                ))}
              </select>
              {form.almacen_origen_id && productosOrigen.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Este almacen no tiene productos con stock</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={e => setForm({ ...form, tipo: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Cantidad</label>
              <input
                required
                type="number"
                min="1"
                max={productoSeleccionado?.cantidad}
                value={form.cantidad}
                onChange={e => setForm({ ...form, cantidad: e.target.value })}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">Descripcion</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={e => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Motivo del movimiento..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                {guardando ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla */}
      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando movimientos...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">#</th>
                <th className="px-6 py-3 text-left">Tipo</th>
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-left">Origen</th>
                <th className="px-6 py-3 text-left">Destino</th>
                <th className="px-6 py-3 text-right">Cantidad</th>
                <th className="px-6 py-3 text-left">Descripcion</th>
                <th className="px-6 py-3 text-left">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m, i) => (
                <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 text-gray-400">{m.id}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorTipo[m.tipo] || 'bg-gray-100'}`}>
                      {m.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-700">{m.producto_nombre || '—'}</td>
                  <td className="px-6 py-3 font-medium text-gray-700">{m.origen || '—'}</td>
                  <td className="px-6 py-3 font-medium text-gray-700">{m.destino || '—'}</td>
                  <td className="px-6 py-3 text-right font-bold">{Number(m.cantidad).toLocaleString()}</td>
                  <td className="px-6 py-3 text-gray-500">{m.descripcion || '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">
                    {new Date(m.fecha).toLocaleDateString('es-GT')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {movimientos.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay movimientos registrados aun</p>
          )}
        </div>
      )}
    </div>
  )
}
