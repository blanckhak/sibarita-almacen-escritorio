import { useEffect, useState, useMemo } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { exportarCSV, exportarPDF } from '../utils/exportar'

const FORM_VACIO = { nombre: '', categoria: '', unidad_medida_id: '', codigo_interno: '', metrica: 'ENTERO' }

const METRICA_LABEL = { ENTERO: 'Entero', EN_PARTIDA: 'En partida' }

export default function Productos() {
  const { usuario } = useAuth()
  const [productos, setProductos]         = useState([])
  const [unidades, setUnidades]           = useState([])
  const [cargando, setCargando]           = useState(true)
  const [mostrarForm, setMostrarForm]     = useState(false)
  const [editando, setEditando]           = useState(null)
  const [guardando, setGuardando]         = useState(false)
  const [mensaje, setMensaje]             = useState(null)
  const [busqueda, setBusqueda]           = useState('')
  const [form, setForm]                   = useState(FORM_VACIO)

  const esAdmin = usuario?.rol === 'admin'

  const cargarDatos = async () => {
    const [prod, uni] = await Promise.all([
      api.get('/api/productos'),
      api.get('/api/unidades-medida'),
    ])
    setProductos(prod.data)
    setUnidades(uni.data)
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [])

  const filtrados = useMemo(() => {
    if (!busqueda) return productos
    const q = busqueda.toLowerCase()
    return productos.filter(p =>
      p.nombre?.toLowerCase().includes(q) ||
      p.categoria?.toLowerCase().includes(q) ||
      p.codigo_interno?.toLowerCase().includes(q)
    )
  }, [productos, busqueda])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(FORM_VACIO)
    setMostrarForm(true)
  }

  const abrirEditar = (p) => {
    setEditando(p)
    setForm({
      nombre: p.nombre,
      categoria: p.categoria || '',
      unidad_medida_id: p.unidad_medida_id || '',
      codigo_interno: p.codigo_interno || '',
      metrica: p.metrica || 'ENTERO',
    })
    setMostrarForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    const payload = {
      nombre: form.nombre,
      categoria: form.categoria || null,
      unidad_medida_id: form.unidad_medida_id || null,
      codigo_interno: form.codigo_interno || null,
      metrica: form.metrica || 'ENTERO',
    }
    try {
      if (editando) {
        await api.put(`/api/productos/${editando.id}`, payload)
        setMensaje({ tipo: 'ok', texto: 'Producto actualizado' })
      } else {
        await api.post('/api/productos', payload)
        setMensaje({ tipo: 'ok', texto: 'Producto creado correctamente' })
      }
      setMostrarForm(false)
      cargarDatos()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const columnasExport = [
    { titulo: 'Nombre',          campo: 'nombre' },
    { titulo: 'Categoria',       campo: 'categoria' },
    { titulo: 'Unidad de medida', campo: 'unidad_medida_nombre' },
    { titulo: 'Codigo interno',  campo: 'codigo_interno' },
    { titulo: 'Metrica',         campo: 'metrica' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Catalogo de Productos</h1>
          <p className="text-gray-500 mt-1">Catalogo maestro: nombre, categoria, unidad de medida y codigo interno</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportarCSV(filtrados, columnasExport, 'productos')}
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Excel
          </button>
          <button
            onClick={() => exportarPDF(filtrados, columnasExport, 'Catalogo de Productos', 'productos')}
            className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            PDF
          </button>
          {esAdmin && (
            <button
              onClick={abrirNuevo}
              className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
            >
              + Nuevo Producto
            </button>
          )}
        </div>
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
      {mostrarForm && esAdmin && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">
            {editando ? `Editar — ${editando.nombre}` : 'Nuevo Producto'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Nombre</label>
              <input
                required
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre estandarizado del producto"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Categoria</label>
              <input
                value={form.categoria}
                onChange={e => setForm({ ...form, categoria: e.target.value })}
                placeholder="Ej: Materia prima, Insumo, Activo..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Unidad de medida</label>
              <select
                value={form.unidad_medida_id}
                onChange={e => setForm({ ...form, unidad_medida_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin definir...</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Codigo interno (opcional)</label>
              <input
                value={form.codigo_interno}
                onChange={e => setForm({ ...form, codigo_interno: e.target.value })}
                placeholder="Referencia interna..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Metrica</label>
              <select
                value={form.metrica}
                onChange={e => setForm({ ...form, metrica: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ENTERO">Entero (se ingresa una cantidad)</option>
                <option value="EN_PARTIDA">En partida (se desglosa al ingresar en una guia)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                "En partida": al cargarlo en una guia se abre un desglose de partidas (ej. 3 cajas de 12) que suman la cantidad total.
              </p>
            </div>
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                {guardando ? 'Guardando...' : editando ? 'Actualizar' : 'Crear Producto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow p-4 mb-4 flex gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nombre, categoria o codigo interno..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            className="text-sm text-red-500 hover:text-red-700 px-2"
          >
            Limpiar
          </button>
        )}
        <span className="text-xs text-gray-400 whitespace-nowrap">{filtrados.length} resultados</span>
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando catalogo...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">#</th>
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">Categoria</th>
                <th className="px-6 py-3 text-left">Unidad de medida</th>
                <th className="px-6 py-3 text-left">Codigo interno</th>
                <th className="px-6 py-3 text-left">Metrica</th>
                {esAdmin && <th className="px-6 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => (
                <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 text-gray-400">{p.id}</td>
                  <td className="px-6 py-3 font-semibold text-gray-800">{p.nombre}</td>
                  <td className="px-6 py-3 text-gray-600">{p.categoria || '—'}</td>
                  <td className="px-6 py-3 text-gray-600">
                    {p.unidad_medida_nombre
                      ? `${p.unidad_medida_nombre}${p.unidad_medida_abreviatura ? ` (${p.unidad_medida_abreviatura})` : ''}`
                      : '—'}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{p.codigo_interno || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      p.metrica === 'EN_PARTIDA' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {METRICA_LABEL[p.metrica] || 'Entero'}
                    </span>
                  </td>
                  {esAdmin && (
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => abrirEditar(p)}
                        className="text-sm border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition"
                      >
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length === 0 && (
            <p className="text-center text-gray-400 py-8">No se encontraron resultados</p>
          )}
        </div>
      )}
    </div>
  )
}
