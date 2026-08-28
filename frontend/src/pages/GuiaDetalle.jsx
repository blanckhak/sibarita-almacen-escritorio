import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import CodigoBarras from '../components/CodigoBarras'
import { extraerProveedoresConocidos } from '../utils/proveedores'
import { colorEtiquetaEstado } from '../utils/etiquetaEstados'

const colorDestino = {
  ALMACEN:     'bg-blue-100 text-blue-700',
  OFICINA:     'bg-green-100 text-green-700',
  LABORATORIO: 'bg-purple-100 text-purple-700',
  OTRO:        'bg-amber-100 text-amber-700',
}

export default function GuiaDetalle() {
  const { id } = useParams()
  const { usuario } = useAuth()
  const [guia, setGuia]           = useState(null)
  const [cargando, setCargando]   = useState(true)
  const [imprimiendo, setImprimiendo] = useState(null)
  const [vistaImpresion, setVistaImpresion] = useState(null) // 'etiquetas' | 'nota'
  const [mensaje, setMensaje]     = useState(null)
  const [editando, setEditando]   = useState(false)
  const [formEdicion, setFormEdicion] = useState(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [proveedoresConocidos, setProveedoresConocidos] = useState([])
  const [proveedorOtro, setProveedorOtro] = useState(false)

  const puedeImprimir = ['admin', 'almacen'].includes(usuario?.rol)
  const puedeEditar = ['admin', 'almacen'].includes(usuario?.rol)

  const cargar = () => {
    api.get(`/api/guias/${id}`)
      .then(res => { setGuia(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [id])

  useEffect(() => {
    api.get('/api/guias')
      .then(res => setProveedoresConocidos(extraerProveedoresConocidos(res.data)))
      .catch(() => {})
  }, [])

  const abrirEdicion = () => {
    setFormEdicion({
      proveedor: guia.proveedor || '',
      numero_oc: guia.numero_oc || '',
      direccion: guia.direccion || '',
      estado: guia.estado || 'CARGADA',
      guia_remision: guia.guia_remision || '',
      factura: guia.factura || '',
    })
    setProveedorOtro(!!guia.proveedor && !proveedoresConocidos.includes(guia.proveedor))
    setEditando(true)
  }

  const seleccionarProveedor = (valorSelect) => {
    if (valorSelect === '__otro__') {
      setProveedorOtro(true)
      setFormEdicion(f => ({ ...f, proveedor: '' }))
    } else {
      setProveedorOtro(false)
      setFormEdicion(f => ({ ...f, proveedor: valorSelect }))
    }
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
    if (!vistaImpresion) return
    const t = setTimeout(() => window.print(), 150)
    return () => clearTimeout(t)
  }, [vistaImpresion])

  useEffect(() => {
    const onAfterPrint = () => { setImprimiendo(null); setVistaImpresion(null) }
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
    setVistaImpresion('etiquetas')
  }

  const handleImprimirNota = () => setVistaImpresion('nota')

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
            {puedeImprimir && (
              <button
                onClick={handleImprimirNota}
                className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition"
              >
                Imprimir Nota de Ingreso
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
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Guia de Remision</div>
            <div className="text-gray-800">{guia.guia_remision || '—'}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Factura</div>
            <div className="text-gray-800">{guia.factura || '—'}</div>
          </div>
        </div>

        {editando && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Editar guia</h2>
            <form onSubmit={guardarEdicion}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Proveedor</label>
                  <select
                    value={proveedorOtro ? '__otro__' : formEdicion.proveedor}
                    onChange={e => seleccionarProveedor(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sin proveedor / seleccionar...</option>
                    {proveedoresConocidos.map(p => <option key={p} value={p}>{p}</option>)}
                    <option value="__otro__">+ Otro proveedor (escribir)</option>
                  </select>
                  {proveedorOtro && (
                    <input
                      autoFocus
                      value={formEdicion.proveedor}
                      onChange={e => setFormEdicion(f => ({ ...f, proveedor: e.target.value }))}
                      placeholder="Nombre del proveedor nuevo..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
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
                  <label className="block text-sm font-medium text-gray-600 mb-1">Guia de Remision</label>
                  <input
                    value={formEdicion.guia_remision}
                    onChange={e => setFormEdicion(f => ({ ...f, guia_remision: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Factura</label>
                  <input
                    value={formEdicion.factura}
                    onChange={e => setFormEdicion(f => ({ ...f, factura: e.target.value }))}
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
                    {it.destino === 'OTRO' && it.destino_detalle && (
                      <div className="text-xs text-gray-500 mt-1">{it.destino_detalle}</div>
                    )}
                  </td>
                  <td className="px-6 py-3 font-mono text-gray-700">
                    {it.etiqueta_id
                      ? <Link to={`/etiquetas/${it.etiqueta_id}`} className="text-blue-700 hover:underline">{it.etiqueta_codigo}</Link>
                      : '—'}
                  </td>
                  <td className="px-6 py-3">
                    {it.etiqueta_estado
                      ? <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEtiquetaEstado(it.etiqueta_estado)}`}>{it.etiqueta_estado}</span>
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

      {/* Vista de impresion de etiquetas: solo visible al imprimir etiquetas */}
      <div className={vistaImpresion === 'etiquetas' ? 'hidden print:block' : 'hidden'}>
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

      {/* Vista de impresion de la Nota de Ingresos de Activos: replica el
          formato fisico real de la empresa (talonario "Nota de Ingresos de
          Activos", Fase B). P. Unit./Total quedan en blanco para llenado a
          mano porque el inventario de Sibarita no maneja precios. */}
      <div className={vistaImpresion === 'nota' ? 'hidden print:block border-2 border-gray-800 rounded' : 'hidden'}>
        <div className="flex items-start justify-between px-4 pt-3">
          <div>
            <div className="font-bold text-lg text-gray-800">MANUFACTURA DE ALIMENTOS S.A.</div>
            <div className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Nota de Ingresos de Activos</div>
          </div>
          <div className="border border-gray-800 text-center text-sm">
            <div className="bg-gray-100 px-3 py-0.5 border-b border-gray-800 font-semibold">Fecha</div>
            <div className="px-3 py-1">{new Date(guia.fecha).toLocaleDateString('es-GT')}</div>
          </div>
        </div>
        <div className="text-right px-4 text-sm text-red-600 font-bold">N.° {guia.numero_guia}</div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-sm">
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Proveedor</b> {guia.proveedor || '—'}</div>
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Orden de Compra</b> {guia.numero_oc || '—'}</div>
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Guia de Remision</b> {guia.guia_remision || '—'}</div>
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Factura</b> {guia.factura || '—'}</div>
        </div>

        <table className="w-full text-xs mx-4" style={{ width: 'calc(100% - 2rem)', margin: '0.5rem auto' }}>
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-1">Detalle</th>
              <th className="text-right py-1">Cantidad</th>
              <th className="text-right py-1">P. Unit.</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {guia.items.map(it => (
              <tr key={it.id} className="border-b border-gray-200">
                <td className="py-1">{it.producto_nombre}</td>
                <td className="py-1 text-right">
                  {it.cantidad}{it.unidad_medida_abreviatura ? ` ${it.unidad_medida_abreviatura}` : ''}
                </td>
                <td className="py-1 text-right">&nbsp;</td>
                <td className="py-1 text-right">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="px-4 py-2 text-xs">
          <b className="text-gray-500 uppercase mr-1">Observaciones</b>
          <span className="inline-block border-b border-gray-400" style={{ width: '80%' }}>&nbsp;</span>
        </div>

        <div className="px-4 py-2 text-xs text-gray-600 border-t border-gray-300">
          Por medio de la presente se da conformidad a los siguientes materiales ingresados segun la calidad
          y caracteristicas por Produccion y Dpto. de Compras.
        </div>

        <div className="grid grid-cols-3 gap-x-6 px-4 pt-8 pb-2 text-xs text-gray-500 text-center">
          <div className="border-t border-gray-800 pt-1">V.° B.° Jefe de Mto. {guia.almacen_nombre}</div>
          <div className="border-t border-gray-800 pt-1">Revisado por: Dpto. Compras</div>
          <div className="border-t border-gray-800 pt-1">Revisado por: Dpto. Tesoreria</div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 px-4 pt-8 pb-4 text-xs text-gray-500 text-center">
          <div className="border-t border-gray-800 pt-1">Revisado por: Almacen</div>
          <div className="border-t border-gray-800 pt-1">Aprobado por: Jefe de Produccion</div>
        </div>
      </div>
    </div>
  )
}
