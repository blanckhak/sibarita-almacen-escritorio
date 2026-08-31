import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { CATEGORIAS_MATERIALES } from '../utils/categoriasMateriales'
import { hoyLocal as hoy } from '../utils/fecha'

const colorEstado = {
  PENDIENTE: 'bg-orange-100 text-orange-700',
  ATENDIDA:  'bg-green-100 text-green-700',
  RECHAZADA: 'bg-red-100 text-red-700',
}

const LINEA_VACIA = () => ({ producto: '', cantidad: '' })

const FORM_VACIO = () => ({
  almacen_id: '', seccion: '', persona_responsable: '', categoria: 'INSUMOS',
  categoria_detalle: '', periodo: hoy(), observaciones: '', lineas: [LINEA_VACIA()],
})

export default function SolicitudesMateriales() {
  const { usuario } = useAuth()
  const [solicitudes, setSolicitudes] = useState([])
  const [almacenes, setAlmacenes]     = useState([])
  const [cargando, setCargando]       = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando]     = useState(false)
  const [mensaje, setMensaje]         = useState(null)
  const [form, setForm]               = useState(FORM_VACIO())

  const puedeRegistrar = ['admin', 'mantenimiento'].includes(usuario?.rol)

  const cargarDatos = async () => {
    try {
      const [s, a] = await Promise.all([
        api.get('/api/solicitudes-materiales'),
        api.get('/api/almacenes'),
      ])
      setSolicitudes(s.data)
      setAlmacenes(a.data)
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.post('/api/solicitudes-materiales', form)
      setMensaje({ tipo: 'ok', texto: 'Solicitud de materiales registrada correctamente' })
      setMostrarForm(false)
      cargarDatos()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar la solicitud' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Solicitud de Materiales</h1>
          <p className="text-gray-500 mt-1">Registro de solicitudes de muestras, insumos, repuestos y herramientas</p>
        </div>
        {puedeRegistrar && (
          <button
            onClick={() => mostrarForm ? setMostrarForm(false) : abrirNuevo()}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            {mostrarForm ? 'Cancelar' : '+ Nueva Solicitud'}
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
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Nueva Solicitud de Materiales</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Almacen</label>
                <select
                  required
                  value={form.almacen_id}
                  onChange={e => setForm({ ...form, almacen_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar almacen...</option>
                  {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Seccion</label>
                <input
                  value={form.seccion}
                  onChange={e => setForm({ ...form, seccion: e.target.value })}
                  placeholder="Ej: Mantenimiento, Produccion..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Persona responsable</label>
                <input
                  required
                  value={form.persona_responsable}
                  onChange={e => setForm({ ...form, persona_responsable: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Periodo</label>
                <input
                  type="date"
                  value={form.periodo}
                  onChange={e => setForm({ ...form, periodo: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className={form.categoria === 'OTROS' ? '' : 'col-span-2'}>
                <label className="block text-sm font-medium text-gray-600 mb-1">Categoria</label>
                <select
                  value={form.categoria}
                  onChange={e => setForm({ ...form, categoria: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIAS_MATERIALES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              {form.categoria === 'OTROS' && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Especificar</label>
                  <input
                    required
                    value={form.categoria_detalle}
                    onChange={e => setForm({ ...form, categoria_detalle: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-600 mb-1">Observaciones</label>
                <input
                  value={form.observaciones}
                  onChange={e => setForm({ ...form, observaciones: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {form.lineas.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 items-end bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="col-span-8">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Producto</label>
                    <input
                      required
                      value={l.producto}
                      onChange={e => actualizarLinea(i, 'producto', e.target.value)}
                      placeholder="Nombre del producto o material..."
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
                  <div className="col-span-2 flex justify-center">
                    {form.lineas.length > 1 && (
                      <button type="button" onClick={() => quitarLinea(i)} className="text-red-500 hover:text-red-700 text-sm">
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={agregarLinea}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50"
              >
                + Agregar producto
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={guardando} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Registrar Solicitud'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando solicitudes...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">N° Solicitud</th>
                <th className="px-6 py-3 text-left">Almacen</th>
                <th className="px-6 py-3 text-left">Responsable</th>
                <th className="px-6 py-3 text-left">Categoria</th>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-right">Lineas</th>
                <th className="px-6 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map((s, i) => (
                <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-mono font-semibold text-gray-800">{s.numero_solicitud}</td>
                  <td className="px-6 py-3 text-gray-700">{s.almacen_nombre}</td>
                  <td className="px-6 py-3 text-gray-700">{s.persona_responsable}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {CATEGORIAS_MATERIALES.find(c => c.value === s.categoria)?.label || s.categoria}
                  </td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{new Date(s.fecha).toLocaleDateString('es-GT')}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEstado[s.estado]}`}>{s.estado}</span>
                  </td>
                  <td className="px-6 py-3 text-right">{s.total_lineas}</td>
                  <td className="px-6 py-3 text-right">
                    <Link to={`/solicitudes-materiales/${s.id}`} className="text-sm border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {solicitudes.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay solicitudes de materiales registradas todavia</p>
          )}
        </div>
      )}
    </div>
  )
}
