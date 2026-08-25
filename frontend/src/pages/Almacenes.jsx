import { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'

export default function Almacenes() {
  const { usuario } = useAuth()
  const [almacenes, setAlmacenes]     = useState([])
  const [cargando, setCargando]       = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando]       = useState(null)
  const [guardando, setGuardando]     = useState(false)
  const [mensaje, setMensaje]         = useState(null)
  const [form, setForm] = useState({ nombre: '', ubicacion: '' })

  const cargarAlmacenes = async () => {
    const res = await api.get('/api/almacenes')
    setAlmacenes(res.data)
    setCargando(false)
  }

  useEffect(() => { cargarAlmacenes() }, [])

  const abrirNuevo = () => {
    setEditando(null)
    setForm({ nombre: '', ubicacion: '' })
    setMostrarForm(true)
  }

  const abrirEditar = (a) => {
    setEditando(a)
    setForm({ nombre: a.nombre, ubicacion: a.ubicacion || '' })
    setMostrarForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      if (editando) {
        await api.put(`/api/almacenes/${editando.id}`, form)
        setMensaje({ tipo: 'ok', texto: 'Almacen actualizado' })
      } else {
        await api.post('/api/almacenes', form)
        setMensaje({ tipo: 'ok', texto: 'Almacen creado correctamente' })
      }
      setMostrarForm(false)
      cargarAlmacenes()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const esAdmin = usuario?.rol === 'admin'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Almacenes</h1>
          <p className="text-gray-500 mt-1">Gestion de almacenes del sistema</p>
        </div>
        {esAdmin && (
          <button
            onClick={abrirNuevo}
            className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-lg font-medium transition"
          >
            + Nuevo Almacen
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

      {/* Formulario */}
      {mostrarForm && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">
            {editando ? `Editar — ${editando.nombre}` : 'Nuevo Almacen'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Nombre del almacen</label>
              <input
                required
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: MALSA"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Ubicacion</label>
              <input
                value={form.ubicacion}
                onChange={e => setForm({ ...form, ubicacion: e.target.value })}
                placeholder="Ej: Zona Norte, Bodega 3"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                {guardando ? 'Guardando...' : editando ? 'Actualizar' : 'Crear Almacen'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tarjetas */}
      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando almacenes...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {almacenes.map(a => (
            <div key={a.id} className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">{a.nombre}</h3>
                  <p className="text-sm text-gray-400 mt-0.5">{a.ubicacion || 'Sin ubicacion registrada'}</p>
                </div>
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">#{a.id}</span>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Creado: {new Date(a.creado_en).toLocaleDateString('es-GT')}
              </p>
              {esAdmin && (
                <button
                  onClick={() => abrirEditar(a)}
                  className="w-full text-sm border border-blue-200 text-blue-700 rounded-lg py-2 hover:bg-blue-50 transition"
                >
                  Editar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
