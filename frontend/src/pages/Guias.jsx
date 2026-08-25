import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'

const hoy = () => new Date().toISOString().slice(0, 10)
const LINEA_VACIA = () => ({ producto_id: '', producto_nombre: '', nuevo: false, cantidad: '', destino: 'ALMACEN', unidad_medida_id: '', recogido: true })

export default function Guias() {
  const { usuario } = useAuth()
  const [guias, setGuias]         = useState([])
  const [almacenes, setAlmacenes] = useState([])
  const [productos, setProductos] = useState([])
  const [unidades, setUnidades]   = useState([])
  const [cargando, setCargando]   = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje]     = useState(null)
  const [form, setForm] = useState({ numero_guia: '', almacen_id: '', fecha: hoy(), proveedor: '', numero_oc: '', direccion: '', items: [LINEA_VACIA()] })

  const puedeRegistrar = ['admin', 'supervisor', 'operador'].includes(usuario?.rol)

  const cargarDatos = async () => {
    const [g, a, p, u] = await Promise.all([
      api.get('/api/guias'),
      api.get('/api/almacenes'),
      api.get('/api/productos'),
      api.get('/api/unidades-medida'),
    ])
    setGuias(g.data)
    setAlmacenes(a.data)
    setProductos(p.data)
    setUnidades(u.data)
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [])

  const abrirNuevo = () => {
    setForm({ numero_guia: '', almacen_id: '', fecha: hoy(), proveedor: '', numero_oc: '', direccion: '', items: [LINEA_VACIA()] })
    setMostrarForm(true)
  }

  const actualizarLinea = (i, campo, valor) => {
    setForm(f => {
      const items = [...f.items]
      items[i] = { ...items[i], [campo]: valor }
      return { ...f, items }
    })
  }

  // El select de Producto mezcla el catalogo (valor = id) con la opcion
  // "__nuevo__" para digitar un producto que todavia no existe.
  const seleccionarProducto = (i, valorSelect) => {
    setForm(f => {
      const items = [...f.items]
      if (valorSelect === '__nuevo__') {
        items[i] = { ...items[i], producto_id: '', producto_nombre: '', nuevo: true, unidad_medida_id: '' }
      } else if (valorSelect === '') {
        items[i] = { ...items[i], producto_id: '', producto_nombre: '', nuevo: false, unidad_medida_id: '' }
      } else {
        const prod = productos.find(p => p.id === Number(valorSelect))
        items[i] = { ...items[i], producto_id: Number(valorSelect), producto_nombre: prod?.nombre || '', nuevo: false, unidad_medida_id: '' }
      }
      return { ...f, items }
    })
  }

  const agregarLinea = () => setForm(f => ({ ...f, items: [...f.items, LINEA_VACIA()] }))
  const quitarLinea = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))

  const productoDe = (id) => productos.find(p => p.id === Number(id))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const payload = {
        ...form,
        items: form.items.map(it => ({
          ...it,
          producto_id: it.producto_id || null,
          producto_nombre: it.producto_id ? '' : it.producto_nombre.trim(),
        })),
      }
      const { data } = await api.post('/api/guias', payload)
      setMensaje({
        tipo: 'ok',
        texto: data.etiquetas.length > 0
          ? `Guia registrada. Se generaron ${data.etiquetas.length} etiqueta(s), lista(s) para imprimir.`
          : 'Guia registrada correctamente.',
      })
      setMostrarForm(false)
      cargarDatos()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar la guia' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 5000)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Ingreso por Guia</h1>
          <p className="text-gray-500 mt-1">Registro de guias de ingreso con multiples productos</p>
        </div>
        {puedeRegistrar && (
          <button
            onClick={() => mostrarForm ? setMostrarForm(false) : abrirNuevo()}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            {mostrarForm ? 'Cancelar' : '+ Nuevo Ingreso'}
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
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Nuevo Ingreso</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">N° de guia</label>
                <input
                  required
                  value={form.numero_guia}
                  onChange={e => setForm({ ...form, numero_guia: e.target.value })}
                  placeholder="Ej: G-04521"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
                <label className="block text-sm font-medium text-gray-600 mb-1">Fecha de ingreso</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={e => setForm({ ...form, fecha: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Proveedor <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input
                  value={form.proveedor}
                  onChange={e => setForm({ ...form, proveedor: e.target.value })}
                  placeholder="Puede variar por guia, escribir libremente"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">N° de Orden de Compra <span className="text-gray-400 font-normal">(opcional, se puede agregar despues)</span></label>
                <input
                  value={form.numero_oc}
                  onChange={e => setForm({ ...form, numero_oc: e.target.value })}
                  placeholder="Ej: OC-1234"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Direccion <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input
                  value={form.direccion}
                  onChange={e => setForm({ ...form, direccion: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {form.items.map((it, i) => {
                const prod = productoDe(it.producto_id)
                const necesitaUnidad = !prod || !prod.unidad_medida_id
                const selectValue = it.nuevo ? '__nuevo__' : (it.producto_id ? String(it.producto_id) : '')
                const esProductoNuevo = it.nuevo
                return (
                  <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="grid grid-cols-12 gap-3 items-start">
                      <div className="col-span-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Producto</label>
                        <select
                          required
                          value={selectValue}
                          onChange={e => seleccionarProducto(i, e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Seleccionar del catalogo...</option>
                          {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          <option value="__nuevo__">+ Producto nuevo (escribir)</option>
                        </select>
                        {esProductoNuevo && (
                          <input
                            required
                            autoFocus
                            value={it.producto_nombre}
                            onChange={e => actualizarLinea(i, 'producto_nombre', e.target.value)}
                            placeholder="Nombre del producto nuevo..."
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad</label>
                        <input
                          required
                          type="number" min="1"
                          value={it.cantidad}
                          onChange={e => actualizarLinea(i, 'cantidad', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Destino</label>
                        <select
                          value={it.destino}
                          onChange={e => actualizarLinea(i, 'destino', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="ALMACEN">✗ Almacen (genera codigo)</option>
                          <option value="OFICINA">✓ Oficina</option>
                          <option value="LABORATORIO">✓ Laboratorio</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Unidad de medida</label>
                        {necesitaUnidad ? (
                          <select
                            required
                            value={it.unidad_medida_id}
                            onChange={e => actualizarLinea(i, 'unidad_medida_id', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Definir...</option>
                            {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                          </select>
                        ) : (
                          <div className="text-sm text-gray-500 px-2.5 py-2">
                            {prod.unidad_medida_nombre || 'Sin definir'}
                          </div>
                        )}
                      </div>
                      <div className="col-span-1 flex items-end justify-center h-full pt-5">
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => quitarLinea(i)}
                            className="text-red-500 hover:text-red-700 text-sm"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>
                    {it.destino !== 'ALMACEN' && (
                      <label className="flex items-center gap-2 mt-3 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={it.recogido}
                          onChange={e => actualizarLinea(i, 'recogido', e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        Ya lo recogieron (sale de una vez, sin quedar en inventario ni generar codigo)
                        {!it.recogido && (
                          <span className="text-amber-600 font-medium">— Aun no: quedara en inventario con codigo hasta que lo recojan</span>
                        )}
                      </label>
                    )}
                  </div>
                )
              })}
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
                  {guardando ? 'Guardando...' : 'Finalizar y generar codigos'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando guias...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">N° Guia</th>
                <th className="px-6 py-3 text-left">Almacen</th>
                <th className="px-6 py-3 text-left">O.C.</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-left">Registrado por</th>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-right">Lineas</th>
                <th className="px-6 py-3 text-right">Etiquetas</th>
                <th className="px-6 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {guias.map((g, i) => (
                <tr key={g.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-semibold text-gray-800">{g.numero_guia}</td>
                  <td className="px-6 py-3 text-gray-700">{g.almacen_nombre}</td>
                  <td className="px-6 py-3 text-gray-500">{g.numero_oc || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${g.estado === 'CERRADA' ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                      {g.estado || 'CARGADA'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{g.usuario_nombre || '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{new Date(g.fecha).toLocaleDateString('es-GT')}</td>
                  <td className="px-6 py-3 text-right">{g.total_items}</td>
                  <td className="px-6 py-3 text-right">{g.total_etiquetas}</td>
                  <td className="px-6 py-3 text-right">
                    <Link to={`/guias/${g.id}`} className="text-sm border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {guias.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay guias registradas todavia</p>
          )}
        </div>
      )}
    </div>
  )
}
