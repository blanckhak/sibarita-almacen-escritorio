import { useEffect, useState } from 'react'
import api from '../utils/api'

const ROLES = [
  { id: 1, nombre: 'admin' },
  { id: 2, nombre: 'supervisor' },
  { id: 3, nombre: 'operador' },
  { id: 4, nombre: 'auditor' },
  { id: 5, nombre: 'transportista' },
]

const colorRol = {
  admin:         'bg-purple-100 text-purple-700',
  supervisor:    'bg-blue-100 text-blue-700',
  operador:      'bg-green-100 text-green-700',
  auditor:       'bg-yellow-100 text-yellow-700',
  transportista: 'bg-gray-100 text-gray-700',
}

export default function Usuarios() {
  const [usuarios, setUsuarios]       = useState([])
  const [almacenes, setAlmacenes]     = useState([])
  const [cargando, setCargando]       = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando]     = useState(false)
  const [mensaje, setMensaje]         = useState(null)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol_id: '3', almacen_id: '' })

  const cargarDatos = async () => {
    const [usr, alm] = await Promise.all([
      api.get('/api/usuarios'),
      api.get('/api/almacenes'),
    ])
    setUsuarios(usr.data)
    setAlmacenes(alm.data)
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.post('/api/usuarios', form)
      setMensaje({ tipo: 'ok', texto: 'Usuario creado correctamente' })
      setForm({ nombre: '', email: '', password: '', rol_id: '3', almacen_id: '' })
      setMostrarForm(false)
      cargarDatos()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al crear usuario' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const toggleEstado = async (id, activo) => {
    await api.put(`/api/usuarios/${id}/estado`, { activo: !activo })
    cargarDatos()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Usuarios</h1>
          <p className="text-gray-500 mt-1">Gestion de usuarios y permisos del sistema</p>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-lg font-medium transition"
        >
          {mostrarForm ? 'Cancelar' : '+ Nuevo Usuario'}
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

      {/* Formulario nuevo usuario */}
      {mostrarForm && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Crear nuevo usuario</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Nombre completo</label>
              <input
                required
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Juan Perez"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Correo electronico</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="juan@sibarita.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Contrasena</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Rol</label>
              <select
                value={form.rol_id}
                onChange={e => setForm({ ...form, rol_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLES.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Almacen asignado</label>
              <select
                value={form.almacen_id}
                onChange={e => setForm({ ...form, almacen_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos los almacenes</option>
                {almacenes.map(a => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex justify-end gap-3 pt-2">
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
                {guardando ? 'Guardando...' : 'Crear Usuario'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla usuarios */}
      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando usuarios...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-left">Rol</th>
                <th className="px-6 py-3 text-left">Almacen</th>
                <th className="px-6 py-3 text-center">Estado</th>
                <th className="px-6 py-3 text-center">Accion</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u, i) => (
                <tr key={u.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-semibold text-gray-800">{u.nombre}</td>
                  <td className="px-6 py-3 text-gray-500">{u.email}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorRol[u.rol] || 'bg-gray-100'}`}>
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{u.almacen || 'Global'}</td>
                  <td className="px-6 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button
                      onClick={() => toggleEstado(u.id, u.activo)}
                      className={`text-xs px-3 py-1 rounded-lg font-medium transition ${
                        u.activo
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
