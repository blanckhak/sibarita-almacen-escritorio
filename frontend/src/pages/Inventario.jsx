import { useEffect, useState, useMemo } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { exportarCSV, exportarPDF } from '../utils/exportar'

const TIPOS = ['NUEVO', 'DEVOLUCION']

export default function Inventario() {
  const { usuario } = useAuth()
  const [inventario, setInventario]   = useState([])
  const [almacenes, setAlmacenes]     = useState([])
  const [productos, setProductos]     = useState([])
  const [cargando, setCargando]       = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando]     = useState(false)
  const [mensaje, setMensaje]         = useState(null)
  const [busqueda, setBusqueda]       = useState('')
  const [filtroAlmacen, setFiltroAlmacen] = useState('')
  const [filtroTipo, setFiltroTipo]       = useState('')
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)
  const [form, setForm] = useState({ almacen_id: '', producto_id: '', tipo: 'NUEVO', cantidad: '', descripcion: '' })
  const [nuevoProducto, setNuevoProducto] = useState('')
  const [mostrarNuevoProducto, setMostrarNuevoProducto] = useState(false)

  const cargarDatos = async () => {
    const [inv, alm, prod] = await Promise.all([
      api.get('/api/inventario'),
      api.get('/api/almacenes'),
      api.get('/api/productos'),
    ])
    setInventario(inv.data)
    setAlmacenes(alm.data)
    setProductos(prod.data)
    setCargando(false)
  }

  const crearProducto = async () => {
    if (!nuevoProducto.trim()) return
    try {
      const { data } = await api.post('/api/productos', { nombre: nuevoProducto.trim() })
      setProductos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setForm(f => ({ ...f, producto_id: data.id }))
      setNuevoProducto('')
      setMostrarNuevoProducto(false)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al crear producto' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  useEffect(() => { cargarDatos() }, [])

  const filtrado = useMemo(() => {
    return inventario.filter(item => {
      const matchBusqueda = !busqueda ||
        item.almacen_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
        item.producto_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
        item.descripcion?.toLowerCase().includes(busqueda.toLowerCase())
      const matchAlmacen = !filtroAlmacen || item.almacen_nombre === filtroAlmacen
      const matchTipo    = !filtroTipo    || item.tipo === filtroTipo
      return matchBusqueda && matchAlmacen && matchTipo
    })
  }, [inventario, busqueda, filtroAlmacen, filtroTipo])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.post('/api/inventario', form)
      setMensaje({ tipo: 'ok', texto: 'Item registrado correctamente' })
      setForm({ almacen_id: '', producto_id: '', tipo: 'NUEVO', cantidad: '', descripcion: '' })
      setMostrarForm(false)
      cargarDatos()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const puedeAgregar = ['admin', 'almacen', 'almacenero3'].includes(usuario?.rol)

  const resumenPorAlmacen = useMemo(() => {
    if (!productoSeleccionado) return []
    const filas = inventario.filter(i => i.producto_id === productoSeleccionado.id)
    return almacenes.map(a => {
      const deEsteAlmacen = filas.filter(i => i.almacen_id === a.id)
      const nuevos = deEsteAlmacen.filter(i => i.tipo === 'NUEVO').reduce((s, i) => s + Number(i.cantidad), 0)
      const devoluciones = deEsteAlmacen.filter(i => i.tipo === 'DEVOLUCION').reduce((s, i) => s + Number(i.cantidad), 0)
      return { almacen: a.nombre, nuevos, devoluciones, total: nuevos + devoluciones }
    })
  }, [productoSeleccionado, inventario, almacenes])

  const columnasExport = [
    { titulo: 'Almacen',     campo: 'almacen_nombre'  },
    { titulo: 'Producto',    campo: 'producto_nombre' },
    { titulo: 'Tipo',        campo: 'tipo'            },
    { titulo: 'Cantidad',    campo: 'cantidad'        },
    { titulo: 'Descripcion', campo: 'descripcion'     },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Inventario</h1>
          <p className="text-gray-500 mt-1">Registro detallado de items por almacen</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportarCSV(filtrado, columnasExport, 'inventario')}
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Excel
          </button>
          <button
            onClick={() => exportarPDF(filtrado, columnasExport, 'Reporte de Inventario', 'inventario')}
            className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            PDF
          </button>
          {puedeAgregar && (
            <button
              onClick={() => setMostrarForm(!mostrarForm)}
              className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
            >
              {mostrarForm ? 'Cancelar' : '+ Nuevo Item'}
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
      {mostrarForm && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Registrar nuevo item</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
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
              <label className="block text-sm font-medium text-gray-600 mb-1">Producto</label>
              {!mostrarNuevoProducto ? (
                <div className="flex gap-2">
                  <select
                    required
                    value={form.producto_id}
                    onChange={e => setForm({ ...form, producto_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar producto...</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  {usuario?.rol === 'admin' && (
                    <button
                      type="button"
                      onClick={() => setMostrarNuevoProducto(true)}
                      className="shrink-0 px-3 py-2.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                    >
                      + Nuevo
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={nuevoProducto}
                    onChange={e => setNuevoProducto(e.target.value)}
                    placeholder="Nombre del producto..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={crearProducto}
                    className="shrink-0 px-3 py-2.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800"
                  >
                    Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMostrarNuevoProducto(false); setNuevoProducto('') }}
                    className="shrink-0 px-3 py-2.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
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
                type="number" required min="1"
                value={form.cantidad}
                onChange={e => setForm({ ...form, cantidad: e.target.value })}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Descripcion</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={e => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Descripcion opcional..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow p-4 mb-4 flex gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por almacen o descripcion..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filtroAlmacen}
          onChange={e => setFiltroAlmacen(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los almacenes</option>
          {almacenes.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
        </select>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(busqueda || filtroAlmacen || filtroTipo) && (
          <button
            onClick={() => { setBusqueda(''); setFiltroAlmacen(''); setFiltroTipo('') }}
            className="text-sm text-red-500 hover:text-red-700 px-2"
          >
            Limpiar
          </button>
        )}
        <span className="text-xs text-gray-400 whitespace-nowrap">{filtrado.length} resultados</span>
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando inventario...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">#</th>
                <th className="px-6 py-3 text-left">Almacen</th>
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-left">Tipo</th>
                <th className="px-6 py-3 text-right">Cantidad</th>
                <th className="px-6 py-3 text-left">Descripcion</th>
                <th className="px-6 py-3 text-left">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtrado.map((item, i) => (
                <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 text-gray-400">{item.id}</td>
                  <td className="px-6 py-3 font-semibold text-gray-800">{item.almacen_nombre}</td>
                  <td className="px-6 py-3">
                    {item.producto_id ? (
                      <button
                        type="button"
                        onClick={() => setProductoSeleccionado({ id: item.producto_id, nombre: item.producto_nombre })}
                        className="text-blue-700 hover:underline text-left"
                        title="Ver cuanto hay de este producto en cada almacen"
                      >
                        {item.producto_nombre}
                      </button>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.tipo === 'NUEVO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {item.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-medium">{Number(item.cantidad).toLocaleString()}</td>
                  <td className="px-6 py-3 text-gray-500">{item.descripcion || '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{new Date(item.creado_en).toLocaleDateString('es-GT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrado.length === 0 && (
            <p className="text-center text-gray-400 py-8">No se encontraron resultados</p>
          )}
        </div>
      )}

      {productoSeleccionado && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setProductoSeleccionado(null)}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{productoSeleccionado.nombre}</h2>
                <p className="text-sm text-gray-500">Cuanto hay en cada almacen</p>
              </div>
              <button
                onClick={() => setProductoSeleccionado(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2">Almacen</th>
                  <th className="py-2 text-right">Nuevo</th>
                  <th className="py-2 text-right">Devolucion</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumenPorAlmacen.map(r => (
                  <tr key={r.almacen} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-gray-800">{r.almacen}</td>
                    <td className="py-2 text-right text-gray-600">{r.nuevos.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-600">{r.devoluciones.toLocaleString()}</td>
                    <td className="py-2 text-right font-semibold text-gray-800">{r.total.toLocaleString()}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold text-gray-800">Total general</td>
                  <td className="py-2 text-right text-gray-500">
                    {resumenPorAlmacen.reduce((s, r) => s + r.nuevos, 0).toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-gray-500">
                    {resumenPorAlmacen.reduce((s, r) => s + r.devoluciones, 0).toLocaleString()}
                  </td>
                  <td className="py-2 text-right font-bold text-gray-900">
                    {resumenPorAlmacen.reduce((s, r) => s + r.total, 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
