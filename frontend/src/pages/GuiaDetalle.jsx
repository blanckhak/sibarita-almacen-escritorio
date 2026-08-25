import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import CodigoBarras from '../components/CodigoBarras'

const colorDestino = {
  ALMACEN:     'bg-blue-100 text-blue-700',
  OFICINA:     'bg-green-100 text-green-700',
  LABORATORIO: 'bg-purple-100 text-purple-700',
}

const colorEstado = {
  EN_ALMACEN: 'bg-blue-100 text-blue-700',
  SALIO:      'bg-orange-100 text-orange-700',
}

export default function GuiaDetalle() {
  const { id } = useParams()
  const { usuario } = useAuth()
  const [guia, setGuia]           = useState(null)
  const [cargando, setCargando]   = useState(true)
  const [imprimiendo, setImprimiendo] = useState(null)
  const [mensaje, setMensaje]     = useState(null)
  const [editando, setEditando]   = useState(false)
  const [formEdicion, setFormEdicion] = useState(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)

  const puedeImprimir = ['admin', 'supervisor', 'operador'].includes(usuario?.rol)
  const puedeEditar = ['admin', 'supervisor', 'operador'].includes(usuario?.rol)

  const cargar = () => {
    api.get(`/api/guias/${id}`)
      .then(res => { setGuia(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [id])

  const abrirEdicion = () => {
    setFormEdicion({
      proveedor: guia.proveedor || '',
      numero_oc: guia.numero_oc || '',
      direccion: guia.direccion || '',
      estado: guia.estado || 'CARGADA',
    })
    setEditando(true)
  }

  const guardarEdicion = async (e) => {
    e.preventDefault()
    setGuardandoEdicion(true)
    try {
      const { data } = await api.put(`/api/guias/${id}`, formEdicion)
      setGuia(g => ({ ...g, ...data }))
      setEditando(false)
      setMensaje({ tipo: 'ok', texto: 'Guia actualizada correctamente.' })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudo actualizar la guia' })
    } finally {
      setGuardandoEdicion(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  useEffect(() => {
    if (!imprimiendo) return
    const t = setTimeout(() => window.print(), 150)
    return () => clearTimeout(t)
  }, [imprimiendo])

  useEffect(() => {
    const onAfterPrint = () => setImprimiendo(null)
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  const handleImprimir = async (etiquetaIds) => {
    try {
      await Promise.all(etiquetaIds.map(eid => api.post(`/api/etiquetas/${eid}/imprimir`)))
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se pudo registrar la impresion, pero se abrira igual.' })
      setTimeout(() => setMensaje(null), 4000)
    }
    setImprimiendo(etiquetaIds)
  }

  if (cargando) {
    return <div className="p-6 text-center py-12 text-gray-400">Cargando guia...</div>
  }
  if (!guia) {
    return <div className="p-6 text-center py-12 text-gray-400">Guia no encontrada</div>
  }

  const conEtiqueta = guia.items.filter(it => it.etiqueta_id)
  const itemsAImprimir = imprimiendo ? guia.items.filter(it => imprimiendo.includes(it.etiqueta_id)) : []

  return (
    <div className="p-6">
      <div className="print:hidden">
        <Link to="/guias" className="text-sm text-blue-700 hover:underline">&larr; Volver a guias</Link>

        <div className="flex items-center justify-between mt-2 mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-800">Guia {guia.numero_guia}</h1>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${guia.estado === 'CERRADA' ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                {guia.estado || 'CARGADA'}
              </span>
            </div>
            <p className="text-gray-500 mt-1">
              {guia.almacen_nombre} · {new Date(guia.fecha).toLocaleDateString('es-GT')} · Registrado por {guia.usuario_nombre || '—'}
            </p>
          </div>
          <div className="flex gap-3">
            {puedeEditar && (
              <button
                onClick={abrirEdicion}
                className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition"
              >
                Editar
              </button>
            )}
            {puedeImprimir && conEtiqueta.length > 0 && (
              <button
                onClick={() => handleImprimir(conEtiqueta.map(it => it.etiqueta_id))}
                className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
              >
                Imprimir todas las etiquetas
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Proveedor</div>
            <div className="text-gray-800">{guia.proveedor || '—'}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Orden de Compra</div>
            {guia.numero_oc ? (
              <div className="text-gray-800">{guia.numero_oc}</div>
            ) : puedeEditar ? (
              <button onClick={abrirEdicion} className="text-blue-700 hover:underline text-sm font-medium">
                + Agregar Orden de Compra
              </button>
            ) : (
              <div className="text-gray-400">—</div>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Direccion</div>
            <div className="text-gray-800">{guia.direccion || '—'}</div>
          </div>
        </div>

        {editando && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Editar guia</h2>
            <form onSubmit={guardarEdicion}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Proveedor</label>
                  <input
                    value={formEdicion.proveedor}
                    onChange={e => setFormEdicion(f => ({ ...f, proveedor: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">N° de Orden de Compra</label>
                  <input
                    value={formEdicion.numero_oc}
                    onChange={e => setFormEdicion(f => ({ ...f, numero_oc: e.target.value }))}
                    placeholder="Ej: OC-1234"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Direccion</label>
                  <input
                    value={formEdicion.direccion}
                    onChange={e => setFormEdicion(f => ({ ...f, direccion: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Estado</label>
                  <select
                    value={formEdicion.estado}
                    onChange={e => setFormEdicion(f => ({ ...f, estado: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CARGADA">CARGADA</option>
                    <option value="CERRADA">CERRADA</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditando(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={guardandoEdicion} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                  {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        )}

        {mensaje && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            mensaje.tipo === 'ok'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {mensaje.texto}
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-right">Cantidad</th>
                <th className="px-6 py-3 text-left">Unidad</th>
                <th className="px-6 py-3 text-left">Destino</th>
                <th className="px-6 py-3 text-left">Codigo</th>
                <th className="px-6 py-3 text-left">Estado</th>
                {puedeImprimir && <th className="px-6 py-3 text-right">Etiqueta</th>}
              </tr>
            </thead>
            <tbody>
              {guia.items.map((it, i) => (
                <tr key={it.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-semibold text-gray-800">{it.producto_nombre}</td>
                  <td className="px-6 py-3 text-right">{it.cantidad}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {it.unidad_medida_nombre
                      ? `${it.unidad_medida_nombre}${it.unidad_medida_abreviatura ? ` (${it.unidad_medida_abreviatura})` : ''}`
                      : '—'}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorDestino[it.destino]}`}>
                      {it.destino}
                    </span>
                  </td>
                  <td className="px-6 py-3 font-mono text-gray-700">
                    {it.etiqueta_id
                      ? <Link to={`/etiquetas/${it.etiqueta_id}`} className="text-blue-700 hover:underline">{it.etiqueta_codigo}</Link>
                      : '—'}
                  </td>
                  <td className="px-6 py-3">
                    {it.etiqueta_estado
                      ? <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEstado[it.etiqueta_estado]}`}>{it.etiqueta_estado}</span>
                      : <span className="text-gray-400 text-xs">Salida automatica</span>}
                  </td>
                  {puedeImprimir && (
                    <td className="px-6 py-3 text-right">
                      {it.etiqueta_id && (
                        <button
                          onClick={() => handleImprimir([it.etiqueta_id])}
                          className="text-sm border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition"
                        >
                          Imprimir
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vista de impresion: solo visible al imprimir */}
      <div className="hidden print:block">
        <div className="grid grid-cols-2 gap-4">
          {itemsAImprimir.map(it => (
            <div key={it.etiqueta_id} className="border border-gray-800 rounded print:break-inside-avoid">
              <div className="bg-gray-100 text-center font-semibold text-sm py-1.5 border-b border-gray-800">
                {it.producto_nombre}
              </div>
              <div className="flex">
                <div className="bg-amber-500 text-white font-bold text-2xl flex items-center justify-center px-4 min-w-[70px]">
                  {it.etiqueta_codigo}
                </div>
                <div className="flex-1 border-l border-r border-gray-800 px-3 py-2 text-sm flex items-center">
                  {it.producto_nombre}
                </div>
                <div className="px-3 py-2 text-sm flex items-center justify-center">
                  {it.unidad_medida_abreviatura || it.unidad_medida_nombre || ''}
                </div>
                <div className="bg-amber-500 text-white font-bold flex items-center justify-center px-4 min-w-[40px]">
                  {it.cantidad}
                </div>
              </div>
              <div className="flex justify-center py-1.5 border-t border-gray-800">
                <CodigoBarras valor={it.etiqueta_codigo} height={28} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
