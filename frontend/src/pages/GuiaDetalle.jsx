import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import CodigoBarras from '../components/CodigoBarras'
import { extraerProveedoresConocidos } from '../utils/proveedores'
import { colorEtiquetaEstado } from '../utils/etiquetaEstados'
import { TIPOS_DOCUMENTO, tipoDocumentoLabel } from '../utils/tiposDocumento'
import { enPaginas } from '../utils/paginarImpresion'
import { claseCodigoAlmacen, estiloCodigoImpreso, codigoAlmacen } from '../utils/colorAlmacen'
import PreviewImpresion from '../components/PreviewImpresion'

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
  const [preview, setPreview] = useState(false) // previsualizacion antes de imprimir
  const [mensaje, setMensaje]     = useState(null)
  const [editando, setEditando]   = useState(false)
  const [formEdicion, setFormEdicion] = useState(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [proveedoresConocidos, setProveedoresConocidos] = useState([])
  const [proveedorOtro, setProveedorOtro] = useState(false)
  // Ediciones locales de la ubicacion fisica de cada codigo, por etiqueta_id.
  const [ubicEdits, setUbicEdits] = useState({})
  const [mostrarAnular, setMostrarAnular] = useState(false)
  const [motivoAnular, setMotivoAnular]   = useState('')
  const [procesandoAnular, setProcesandoAnular] = useState(false)
  // "Marcar retirado" (Bloque 6): item de Oficina/Laboratorio pendiente de
  // recoger, se genera su Nota de Salida recien cuando se sabe quien lo retira.
  const [itemRetirando, setItemRetirando] = useState(null)
  const [personaRetira, setPersonaRetira] = useState('')
  const [retiraObs, setRetiraObs]         = useState('')
  const [procesandoRetiro, setProcesandoRetiro] = useState(false)

  const puedeImprimir = ['admin', 'almacen'].includes(usuario?.rol)
  const puedeEditar = ['admin', 'almacen'].includes(usuario?.rol)

  const cargar = () => {
    api.get(`/api/guias/${id}`)
      .then(res => {
        setGuia(res.data)
        // Se siembra el estado de edicion con lo que ya tiene cada codigo, para
        // que enfocar y salir sin escribir no lo borre.
        setUbicEdits(Object.fromEntries(
          res.data.items.filter(it => it.etiqueta_id).map(it => [it.etiqueta_id, it.etiqueta_ubicacion || ''])
        ))
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }

  // Guarda la ubicacion de un codigo si cambio respecto a lo que trae el detalle.
  // Actualiza solo esa linea en el estado local (no recarga toda la guia) para
  // no pisar lo que se este escribiendo en otra fila.
  const guardarUbicacion = async (it) => {
    const nuevo = (ubicEdits[it.etiqueta_id] ?? '').trim()
    if (nuevo === (it.etiqueta_ubicacion || '')) return
    try {
      await api.put(`/api/etiquetas/${it.etiqueta_id}/ubicacion`, { ubicacion: nuevo })
      setMensaje({ tipo: 'ok', texto: `Ubicacion del codigo ${it.etiqueta_codigo} guardada` })
      setGuia(g => ({
        ...g,
        items: g.items.map(x => x.etiqueta_id === it.etiqueta_id ? { ...x, etiqueta_ubicacion: nuevo || null } : x),
      }))
      setUbicEdits(u => ({ ...u, [it.etiqueta_id]: nuevo }))
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar la ubicacion' })
    } finally {
      setTimeout(() => setMensaje(null), 3000)
    }
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
      tipo_documento: guia.tipo_documento || 'GUIA',
      // Fase 8: correccion de cantidad por linea. Una linea no se puede editar
      // si su producto es EN_PARTIDA (cantidad = suma de partidas) o si su
      // codigo ya salio del almacen.
      items: guia.items.map(it => {
        const bloqueadaPartida = it.producto_metrica === 'EN_PARTIDA' && it.tipo !== 'SERVICIO'
        const bloqueadaSalida = it.etiqueta_id && it.etiqueta_estado !== 'EN_ALMACEN'
        return {
          id: it.id,
          producto_nombre: it.producto_nombre,
          tipo: it.tipo,
          cantidad: String(it.cantidad),
          cantidadOriginal: it.cantidad,
          editable: !bloqueadaPartida && !bloqueadaSalida,
          motivo: bloqueadaPartida
            ? 'cantidad por partidas'
            : bloqueadaSalida ? `codigo ${it.etiqueta_codigo} ya salio` : null,
        }
      }),
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

  const cerrada = (guia?.estado || 'CARGADA') === 'CERRADA'
  const anulada = (guia?.estado || 'CARGADA') === 'ANULADA'

  const anularGuia = async () => {
    if (!motivoAnular.trim()) return
    setProcesandoAnular(true)
    try {
      const { data } = await api.post(`/api/guias/${id}/anular`, { motivo: motivoAnular.trim() })
      setMensaje({ tipo: 'ok', texto: `Guia anulada. ${data.codigos_retirados} codigo(s) retirado(s) y stock revertido.` })
      setMostrarAnular(false)
      setMotivoAnular('')
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al anular la guia' })
    } finally {
      setProcesandoAnular(false)
      setTimeout(() => setMensaje(null), 5000)
    }
  }

  const abrirRetirar = (it) => {
    setItemRetirando(it)
    setPersonaRetira('')
    setRetiraObs('')
  }

  const confirmarRetiro = async () => {
    if (!itemRetirando || !personaRetira.trim()) return
    setProcesandoRetiro(true)
    try {
      const { data } = await api.post(`/api/guias/${id}/items/${itemRetirando.id}/retirar`, {
        persona_retira: personaRetira.trim(),
        retira_obs: retiraObs.trim(),
      })
      setMensaje({ tipo: 'ok', texto: `Retiro registrado. Nota de salida ${data.numero_nota} generada.` })
      setItemRetirando(null)
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar el retiro' })
    } finally {
      setProcesandoRetiro(false)
      setTimeout(() => setMensaje(null), 5000)
    }
  }

  const guardarEdicion = async (e) => {
    e.preventDefault()
    setGuardandoEdicion(true)
    try {
      const itemsCambiados = formEdicion.items
        .filter(li => li.editable && Number(li.cantidad) > 0 && Number(li.cantidad) !== li.cantidadOriginal)
        .map(li => ({ id: li.id, cantidad: Number(li.cantidad) }))

      // Guia CERRADA: el backend solo admite numero_oc / estado / items.
      const body = cerrada
        ? { numero_oc: formEdicion.numero_oc, estado: formEdicion.estado, items: itemsCambiados }
        : {
            proveedor: formEdicion.proveedor,
            numero_oc: formEdicion.numero_oc,
            direccion: formEdicion.direccion,
            estado: formEdicion.estado,
            guia_remision: formEdicion.guia_remision,
            factura: formEdicion.factura,
            tipo_documento: formEdicion.tipo_documento,
            items: itemsCambiados,
          }
      await api.put(`/api/guias/${id}`, body)
      setEditando(false)
      setMensaje({ tipo: 'ok', texto: 'Guia actualizada correctamente.' })
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudo actualizar la guia' })
    } finally {
      setGuardandoEdicion(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  // Al elegir un formato para imprimir se abre la previsualizacion; el envio a
  // la impresora lo dispara el boton "Imprimir" del overlay.
  useEffect(() => {
    if (vistaImpresion) setPreview(true)
  }, [vistaImpresion])

  const cerrarPreview = () => {
    setPreview(false)
    setVistaImpresion(null)
    setImprimiendo(null)
  }

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
              <h1 className="text-3xl font-bold text-gray-800">{tipoDocumentoLabel(guia.tipo_documento)} {guia.numero_guia}</h1>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                anulada ? 'bg-red-100 text-red-700'
                : guia.estado === 'CERRADA' ? 'bg-gray-200 text-gray-600'
                : 'bg-blue-100 text-blue-700'
              }`}>
                {guia.estado || 'CARGADA'}
              </span>
            </div>
            <p className="text-gray-500 mt-1">
              {guia.almacen_nombre} · {new Date(guia.fecha).toLocaleDateString('es-GT')} · Registrado por {guia.usuario_nombre || '—'}
            </p>
          </div>
          <div className="flex gap-3">
            {puedeEditar && !anulada && (
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
            {puedeImprimir && !anulada && conEtiqueta.length > 0 && (
              <button
                onClick={() => handleImprimir(conEtiqueta.map(it => it.etiqueta_id))}
                className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
              >
                Imprimir todas las etiquetas
              </button>
            )}
            {puedeEditar && !anulada && (
              <button
                onClick={() => setMostrarAnular(true)}
                className="border border-red-300 text-red-700 text-sm px-4 py-2 rounded-lg font-medium hover:bg-red-50 transition"
              >
                Anular guia
              </button>
            )}
          </div>
        </div>

        {anulada && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-800">
            <b>Guia anulada.</b> Motivo: {guia.motivo_anulacion || '—'}
            {guia.anulada_en && ` · ${new Date(guia.anulada_en).toLocaleString('es-GT')}`}
            {guia.anulada_por_nombre && ` · por ${guia.anulada_por_nombre}`}
            <div className="text-xs text-red-600 mt-1">El stock que sumo esta guia se revirtio y sus codigos quedaron retirados.</div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Proveedor</div>
            <div className="text-gray-800">{guia.proveedor || '—'}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Orden de Compra</div>
            {guia.numero_oc ? (
              <div className="text-gray-800">{guia.numero_oc}</div>
            ) : puedeEditar && !anulada ? (
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
              {cerrada && (
                <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Guia CERRADA: solo se puede corregir la cantidad de las lineas y el N° de O.C.
                  Para editar el resto, cambiala a CARGADA primero.
                </p>
              )}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {!cerrada && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Tipo de documento</label>
                    <select
                      value={formEdicion.tipo_documento}
                      onChange={e => setFormEdicion(f => ({ ...f, tipo_documento: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                )}
                {!cerrada && (
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
                        onChange={e => setFormEdicion(f => ({ ...f, proveedor: e.target.value.toUpperCase() }))}
                        placeholder="Nombre del proveedor nuevo..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">N° de Orden de Compra</label>
                  <input
                    value={formEdicion.numero_oc}
                    onChange={e => setFormEdicion(f => ({ ...f, numero_oc: e.target.value.toUpperCase() }))}
                    placeholder="Ej: OC-1234"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {!cerrada && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Direccion</label>
                    <input
                      value={formEdicion.direccion}
                      onChange={e => setFormEdicion(f => ({ ...f, direccion: e.target.value.toUpperCase() }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {!cerrada && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Guia de Remision</label>
                    <input
                      value={formEdicion.guia_remision}
                      onChange={e => setFormEdicion(f => ({ ...f, guia_remision: e.target.value.toUpperCase() }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {!cerrada && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Factura</label>
                    <input
                      value={formEdicion.factura}
                      onChange={e => setFormEdicion(f => ({ ...f, factura: e.target.value.toUpperCase() }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
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

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-600 mb-2">Cantidad por linea</label>
                <div className="space-y-2 border border-gray-200 rounded-lg p-3">
                  {formEdicion.items.map((li, idx) => (
                    <div key={li.id} className="flex items-center gap-3 text-sm">
                      <span className="flex-1 text-gray-700">
                        {li.producto_nombre}
                        {li.tipo === 'SERVICIO' && <span className="ml-2 text-[10px] font-bold text-slate-500">SERVICIO</span>}
                      </span>
                      {li.editable ? (
                        <input
                          type="number" min="1" step="1"
                          value={li.cantidad}
                          onChange={e => setFormEdicion(f => {
                            const items = [...f.items]
                            items[idx] = { ...items[idx], cantidad: e.target.value }
                            return { ...f, items }
                          })}
                          className="w-24 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-gray-400 text-xs text-right">
                          {li.cantidad} · {li.motivo}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Cambiar la cantidad de una linea con codigo ajusta tambien el inventario del almacen.
                  Las lineas cuyo codigo ya salio no se pueden modificar.
                </p>
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
                <th className="px-6 py-3 text-left">Ubicacion</th>
                <th className="px-6 py-3 text-left">Estado</th>
                {puedeImprimir && <th className="px-6 py-3 text-right">Etiqueta</th>}
              </tr>
            </thead>
            <tbody>
              {guia.items.map((it, i) => (
                <tr key={it.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-semibold text-gray-800">
                    {it.producto_nombre}
                    {it.tipo === 'SERVICIO' && (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 align-middle">
                        SERVICIO
                      </span>
                    )}
                    {it.producto_metrica === 'EN_PARTIDA' && it.tipo !== 'SERVICIO' && (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 align-middle">
                        EN PARTIDA
                      </span>
                    )}
                    {it.partidas?.length > 0 && (
                      <ul className="mt-1 text-xs font-normal text-gray-500 list-disc list-inside">
                        {it.partidas.map(pt => (
                          <li key={pt.id}>{pt.cantidad}{pt.referencia ? ` — ${pt.referencia}` : ''}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">{it.cantidad}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {it.unidad_medida_nombre
                      ? `${it.unidad_medida_nombre}${it.unidad_medida_abreviatura ? ` (${it.unidad_medida_abreviatura})` : ''}`
                      : '—'}
                  </td>
                  <td className="px-6 py-3">
                    {it.destino ? (
                      <>
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorDestino[it.destino]}`}>
                          {it.destino}
                        </span>
                        {it.destino === 'OTRO' && it.destino_detalle && (
                          <div className="text-xs text-gray-500 mt-1">{it.destino_detalle}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 font-mono text-gray-700">
                    {it.etiqueta_id
                      ? <Link to={`/etiquetas/${it.etiqueta_id}`} className={`hover:underline px-1.5 rounded ${claseCodigoAlmacen(guia.almacen_nombre)}`}>{codigoAlmacen(it.etiqueta_codigo, guia.almacen_nombre)}</Link>
                      : '—'}
                  </td>
                  <td className="px-6 py-3">
                    {it.etiqueta_id ? (
                      puedeEditar && !anulada ? (
                        <input
                          value={ubicEdits[it.etiqueta_id] ?? ''}
                          onChange={e => setUbicEdits(u => ({ ...u, [it.etiqueta_id]: e.target.value }))}
                          onBlur={() => guardarUbicacion(it)}
                          placeholder="—"
                          maxLength={100}
                          className="w-36 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-gray-600 text-xs">{it.etiqueta_ubicacion || '—'}</span>
                      )
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {it.etiqueta_estado
                      ? <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEtiquetaEstado(it.etiqueta_estado)}`}>{it.etiqueta_estado}</span>
                      : <span className="text-gray-400 text-xs">{it.tipo === 'SERVICIO' ? 'Servicio' : 'Salida automatica'}</span>}
                    {it.recogido === false && ['OFICINA', 'LABORATORIO'].includes(it.destino) && it.etiqueta_estado === 'EN_ALMACEN' && puedeEditar && !anulada && (
                      <button
                        type="button"
                        onClick={() => abrirRetirar(it)}
                        className="block mt-1 text-[11px] text-blue-600 hover:underline"
                      >
                        Marcar retirado
                      </button>
                    )}
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

      {mostrarAnular && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden" onClick={() => setMostrarAnular(false)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Anular guia {guia.numero_guia}</h2>
            <p className="text-sm text-gray-500 mb-4">
              Se revierte el stock que sumo esta guia y sus codigos quedan retirados.
              La guia queda visible en el historial. No se puede deshacer.
            </p>
            <label className="block text-sm font-medium text-gray-600 mb-1">Motivo de la anulacion</label>
            <input
              autoFocus
              value={motivoAnular}
              onChange={e => setMotivoAnular(e.target.value.toUpperCase())}
              maxLength={200}
              placeholder="Ej: cambio de guia del proveedor, error de carga..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMostrarAnular(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={anularGuia}
                disabled={procesandoAnular || !motivoAnular.trim()}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {procesandoAnular ? 'Anulando...' : 'Anular guia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {itemRetirando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden" onClick={() => setItemRetirando(null)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Marcar retirado</h2>
            <p className="text-sm text-gray-500 mb-4">
              Genera la Nota de Salida de <b>{itemRetirando.producto_nombre}</b> ({itemRetirando.destino === 'OFICINA' ? 'Oficina' : 'Laboratorio'}).
            </p>
            <label className="block text-sm font-medium text-gray-600 mb-1">Quien retira</label>
            <input
              autoFocus
              value={personaRetira}
              onChange={e => setPersonaRetira(e.target.value.toUpperCase())}
              maxLength={150}
              placeholder="Nombre de quien retira"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            />
            <label className="block text-sm font-medium text-gray-600 mb-1">Observacion (opcional)</label>
            <input
              value={retiraObs}
              onChange={e => setRetiraObs(e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setItemRetirando(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRetiro}
                disabled={procesandoRetiro || !personaRetira.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {procesandoRetiro ? 'Guardando...' : 'Confirmar retiro'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PreviewImpresion abierto={preview} onCerrar={cerrarPreview}>
      {/* Vista de impresion de etiquetas: solo visible al imprimir etiquetas */}
      <div className={vistaImpresion === 'etiquetas' ? (preview ? '' : 'hidden print:block') : 'hidden'}>
        <div className="grid grid-cols-2 gap-4">
          {itemsAImprimir.map(it => (
            <div key={it.etiqueta_id} className="border border-gray-800 rounded print:break-inside-avoid">
              <div className="bg-gray-100 text-center font-semibold text-sm py-1.5 border-b border-gray-800">
                {it.producto_nombre}
              </div>
              <div className="flex">
                <div className="font-bold text-2xl flex items-center justify-center px-4 min-w-[70px]" style={estiloCodigoImpreso(guia.almacen_nombre)}>
                  {codigoAlmacen(it.etiqueta_codigo, guia.almacen_nombre)}
                </div>
                <div className="flex-1 border-l border-r border-gray-800 px-3 py-2 text-sm flex items-center">
                  {it.producto_nombre}
                </div>
                <div className="px-3 py-2 text-sm flex items-center justify-center">
                  {it.unidad_medida_abreviatura || it.unidad_medida_nombre || ''}
                </div>
                <div className="font-bold flex items-center justify-center px-4 min-w-[40px]" style={estiloCodigoImpreso(guia.almacen_nombre)}>
                  {it.cantidad}
                </div>
              </div>
              {it.etiqueta_ubicacion && (
                <div className="text-center text-xs py-1 border-t border-gray-800 truncate px-2">
                  Ubicacion: <b>{it.etiqueta_ubicacion.slice(0, 45)}</b>
                </div>
              )}
              <div className="flex justify-center py-1.5 border-t border-gray-800">
                <CodigoBarras valor={it.etiqueta_codigo} height={28} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {vistaImpresion === 'nota' && (
        <div className={preview ? '' : 'hidden print:block'}>
          {enPaginas(guia.items).map((filas, pi, todas) => {
            const ultima = pi === todas.length - 1
            const [yy, mm, dd] = String(guia.fecha).slice(0, 10).split('-')
            return (
              <div key={pi} className="border-2 border-gray-800 rounded break-after-page last:break-after-auto">
                <div className="flex items-start justify-between px-4 pt-3">
                  <div>
                    <div className="font-bold text-lg text-gray-800 text-center">MANUFACTURA DE ALIMENTOS S.A.</div>
                    <div className="font-semibold text-sm text-gray-700 uppercase tracking-wide text-center">Nota de Ingresos de Activos</div>
                  </div>
                  <table className="border border-gray-800 text-center text-xs">
                    <tbody>
                      <tr><td colSpan={3} className="bg-gray-100 border-b border-gray-800 font-semibold px-2 py-0.5">FECHA</td></tr>
                      <tr>
                        <td className="border-r border-gray-800 px-3 py-1 w-8">{dd || ''}</td>
                        <td className="border-r border-gray-800 px-3 py-1 w-8">{mm || ''}</td>
                        <td className="px-3 py-1 w-8">{(yy || '').slice(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-right px-4 text-sm text-red-600 font-bold">
                  {tipoDocumentoLabel(guia.tipo_documento)} N.° {guia.numero_guia}
                  {todas.length > 1 && <span className="text-gray-500 font-normal text-xs ml-2">Hoja {pi + 1} de {todas.length}</span>}
                </div>

                <div className="px-4 py-3 text-sm space-y-1">
                  <div className="flex"><b className="text-gray-600 w-40 shrink-0">PROVEEDOR:</b><span className="border-b border-gray-400 flex-1">{guia.proveedor || ''}</span></div>
                  <div className="flex"><b className="text-gray-600 w-40 shrink-0">ORDEN DE COMPRA:</b><span className="border-b border-gray-400 flex-1">{guia.numero_oc || ''}</span></div>
                  <div className="flex"><b className="text-gray-600 w-40 shrink-0">GUIA DE REMISION:</b><span className="border-b border-gray-400 flex-1">{guia.guia_remision || ''}</span></div>
                  <div className="flex"><b className="text-gray-600 w-40 shrink-0">FACTURA:</b><span className="border-b border-gray-400 flex-1">{guia.factura || ''}</span></div>
                </div>

                <table className="w-full text-xs table-fixed" style={{ width: 'calc(100% - 2rem)', margin: '0 auto' }}>
                  <thead>
                    <tr className="bg-gray-100 border-y-2 border-gray-800">
                      <th className="text-center py-1 tracking-widest">D E T A L L E</th>
                      <th className="text-center py-1 border-l border-gray-800 w-20">CANTIDAD</th>
                      <th className="text-center py-1 border-l border-gray-800 w-16">P. UNIT.</th>
                      <th className="text-center py-1 border-l border-gray-800 w-20">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((it, ri) => (
                      <tr key={ri} className="border-b border-gray-400 h-7 align-top">
                        <td className="py-1 px-1">
                          {it?.etiqueta_codigo && (
                            <span className="font-mono font-bold px-1 mr-1 rounded" style={estiloCodigoImpreso(guia.almacen_nombre)}>
                              {codigoAlmacen(it.etiqueta_codigo, guia.almacen_nombre)}
                            </span>
                          )}
                          {it ? it.producto_nombre : ''}
                          {it?.tipo === 'SERVICIO' && <span className="text-[10px] text-gray-500"> (servicio)</span>}
                          {it?.partidas?.length > 0 && (
                            <span className="block text-[10px] text-gray-500">
                              {it.partidas.map(pt => `${pt.cantidad}${pt.referencia ? ` (${pt.referencia})` : ''}`).join(' · ')}
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-center border-l border-gray-400">{it ? `${it.cantidad}${it.unidad_medida_abreviatura ? ` ${it.unidad_medida_abreviatura}` : ''}` : ''}</td>
                        <td className="py-1 border-l border-gray-400">&nbsp;</td>
                        <td className="py-1 border-l border-gray-400">&nbsp;</td>
                      </tr>
                    ))}
                    {ultima && (
                      <tr className="border-y-2 border-gray-800 h-7 font-semibold">
                        <td className="py-1 text-right pr-2">TOTAL</td>
                        <td className="border-l border-gray-800">&nbsp;</td>
                        <td className="border-l border-gray-800">&nbsp;</td>
                        <td className="border-l border-gray-800">&nbsp;</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Observaciones y firmas van en CADA hoja (no solo la ultima): cada
                    hoja fisica se imprime y se firma por separado. */}
                <div className="px-4 py-2 text-xs flex">
                  <b className="text-gray-600 mr-1">OBSERVACIONES:</b>
                  <span className="border-b border-gray-400 flex-1">{guia.observaciones || ''}</span>
                </div>
                <div className="px-4 py-2 text-xs text-gray-600 border-t border-gray-300">
                  Por medio de la presente se da conformidad a los siguientes materiales ingresados segun la calidad
                  y caracteristicas por Produccion y Dpto. de Compras.
                  <div className="mt-1">
                    Documento: {tipoDocumentoLabel(guia.tipo_documento)} N° {guia.numero_guia}
                    &nbsp;&nbsp;Guia de Remision N° {guia.guia_remision || '.........'}
                    &nbsp;&nbsp;.......... CONFORME.
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-6 px-4 pt-10 pb-2 text-xs text-gray-600 text-center">
                  <div className="border-t border-gray-800 pt-1">V.° B.° Jefe de Mto. {guia.almacen_nombre}</div>
                  <div className="border-t border-gray-800 pt-1">Revisado por: Dpto. Compras</div>
                  <div className="border-t border-gray-800 pt-1">Revisado por: Dpto. Tesoreria</div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 px-10 pt-10 pb-4 text-xs text-gray-600 text-center">
                  <div className="border-t border-gray-800 pt-1">Revisado por: Almacen</div>
                  <div className="border-t border-gray-800 pt-1">Aprobado por: Jefe de Produccion</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </PreviewImpresion>
    </div>
  )
}
