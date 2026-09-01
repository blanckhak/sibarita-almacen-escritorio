import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import CodigoBarras from '../components/CodigoBarras'
import { colorEtiquetaEstado } from '../utils/etiquetaEstados'
import { claseCodigoAlmacen, estiloCodigoImpreso, codigoAlmacen } from '../utils/colorAlmacen'
import PreviewImpresion from '../components/PreviewImpresion'

const colorEvento = {
  GENERADA:    'bg-blue-100 text-blue-700',
  IMPRESA:     'bg-gray-200 text-gray-700',
  REIMPRESA:   'bg-yellow-100 text-yellow-700',
  SALIO:       'bg-orange-100 text-orange-700',
  DEVOLVIO:    'bg-green-100 text-green-700',
  TRANSFERIDA: 'bg-purple-100 text-purple-700',
  REEMPLAZADA: 'bg-gray-200 text-gray-500',
}

export default function EtiquetaDetalle() {
  const { id } = useParams()
  const { usuario } = useAuth()
  const [etiqueta, setEtiqueta]   = useState(null)
  const [historial, setHistorial] = useState([])
  const [almacenes, setAlmacenes] = useState([])
  const [cargando, setCargando]   = useState(true)
  const [mensaje, setMensaje]     = useState(null)
  const [almacenDestino, setAlmacenDestino] = useState('')
  const [transfiriendo, setTransfiriendo]   = useState(false)
  const [ubicacion, setUbicacion]           = useState('')
  const [guardandoUbic, setGuardandoUbic]   = useState(false)
  const [preview, setPreview]               = useState(false)

  const puedeGestionar = ['admin', 'almacen'].includes(usuario?.rol)

  const cargar = () => {
    Promise.all([
      api.get(`/api/etiquetas/${id}`),
      api.get(`/api/etiquetas/${id}/historial`),
      api.get('/api/almacenes'),
    ]).then(([e, h, a]) => {
      setEtiqueta(e.data)
      setUbicacion(e.data.ubicacion || '')
      setHistorial(h.data)
      setAlmacenes(a.data)
      setCargando(false)
    }).catch(() => setCargando(false))
  }

  const guardarUbicacion = async () => {
    setGuardandoUbic(true)
    try {
      await api.put(`/api/etiquetas/${id}/ubicacion`, { ubicacion })
      setMensaje({ tipo: 'ok', texto: 'Ubicacion guardada' })
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar la ubicacion' })
    } finally {
      setGuardandoUbic(false)
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  useEffect(() => { cargar() }, [id])

  // Abre la previsualizacion; la (re)impresion se registra recien cuando el
  // usuario aprieta "Imprimir" en el overlay.
  const imprimir = () => setPreview(true)

  const confirmarImpresion = async () => {
    try {
      await api.post(`/api/etiquetas/${id}/imprimir`)
    } catch (_) {}
    window.print()
    cargar()
  }

  const transferir = async () => {
    if (!almacenDestino) return
    setTransfiriendo(true)
    try {
      await api.post(`/api/etiquetas/${id}/transferir`, { almacen_destino_id: almacenDestino })
      setMensaje({ tipo: 'ok', texto: 'Codigo transferido correctamente' })
      setAlmacenDestino('')
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al transferir' })
    } finally {
      setTransfiriendo(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  if (cargando) return <div className="p-6 text-center py-12 text-gray-400">Cargando codigo...</div>
  if (!etiqueta) return <div className="p-6 text-center py-12 text-gray-400">Codigo no encontrado</div>

  const otrosAlmacenes = almacenes.filter(a => a.id !== etiqueta.almacen_id)

  return (
    <div className="p-6">
      <div className="print:hidden">
        <Link to="/consulta-productos" className="text-sm text-blue-700 hover:underline">&larr; Volver a consulta de productos</Link>

        <div className="flex items-center justify-between mt-2 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 font-mono">
              Codigo <span className={`px-2 rounded ${claseCodigoAlmacen(etiqueta.almacen_nombre)}`}>{codigoAlmacen(etiqueta.codigo, etiqueta.almacen_nombre)}</span>
            </h1>
            <p className="text-gray-500 mt-1">
              {etiqueta.producto_nombre} · Guia {etiqueta.numero_guia} · {etiqueta.almacen_nombre}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {etiqueta.condicion === 'USADO' && (
              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">USADO</span>
            )}
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${colorEtiquetaEstado(etiqueta.estado)}`}>{etiqueta.estado}</span>
            {puedeGestionar && (
              <button onClick={imprimir} className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition">
                Imprimir / Reimprimir
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

        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-xs text-gray-400 uppercase font-semibold">Cantidad</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{etiqueta.cantidad} {etiqueta.unidad_medida_abreviatura || ''}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-xs text-gray-400 uppercase font-semibold">Almacen actual</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{etiqueta.almacen_nombre}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <p className="text-xs text-gray-400 uppercase font-semibold">Generado</p>
            <p className="text-sm font-medium text-gray-700 mt-2">{new Date(etiqueta.fecha_generacion).toLocaleString('es-GT')}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Ubicacion fisica</h2>
          <p className="text-xs text-gray-400 mb-3">Donde esta el codigo dentro del almacen (estante, rack, pasillo...). Se completa despues del ingreso.</p>
          {puedeGestionar ? (
            <div className="flex gap-3">
              <input
                value={ubicacion}
                onChange={e => setUbicacion(e.target.value)}
                placeholder="Ej: Estante A-3, Rack 12, Pasillo 2 Nivel 1"
                maxLength={100}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={guardarUbicacion}
                disabled={guardandoUbic || ubicacion === (etiqueta.ubicacion || '')}
                className="px-5 py-2.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                {guardandoUbic ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-700">{etiqueta.ubicacion || '— sin ubicacion —'}</p>
          )}
        </div>

        {puedeGestionar && etiqueta.estado === 'EN_ALMACEN' && (
          <div className="bg-white rounded-xl shadow p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Transferir a otro almacen</h2>
            <div className="flex gap-3">
              <select
                value={almacenDestino}
                onChange={e => setAlmacenDestino(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar almacen destino...</option>
                {otrosAlmacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <button
                onClick={transferir}
                disabled={!almacenDestino || transfiriendo}
                className="px-5 py-2.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {transfiriendo ? 'Transfiriendo...' : 'Transferir'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-3 bg-gray-800 text-white text-sm font-semibold">Historial de vida del codigo</div>
          <div className="divide-y divide-gray-100">
            {historial.map(h => (
              <div key={h.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEvento[h.evento]}`}>{h.evento}</span>
                  <span className="text-gray-600">
                    {h.usuario_nombre || 'Sistema'}
                    {h.almacen_origen_nombre && h.almacen_destino_nombre && ` — ${h.almacen_origen_nombre} → ${h.almacen_destino_nombre}`}
                    {h.detalle && ` — ${h.detalle}`}
                  </span>
                </div>
                <span className="text-gray-400 text-xs">{new Date(h.fecha).toLocaleString('es-GT')}</span>
              </div>
            ))}
            {historial.length === 0 && (
              <p className="text-center text-gray-400 py-6 text-sm">Sin eventos registrados</p>
            )}
          </div>
        </div>
      </div>

      {/* Vista de impresion de la etiqueta */}
      <PreviewImpresion abierto={preview} onCerrar={() => setPreview(false)} onImprimir={confirmarImpresion}>
      <div className={preview ? '' : 'hidden print:block'}>
        <div className="border border-gray-800 rounded inline-block">
          <div className="bg-gray-100 text-center font-semibold text-sm py-1.5 border-b border-gray-800 px-4">
            {etiqueta.producto_nombre}
          </div>
          <div className="flex">
            <div className="font-bold text-2xl flex items-center justify-center px-4 min-w-[70px]" style={estiloCodigoImpreso(etiqueta.almacen_nombre)}>
              {codigoAlmacen(etiqueta.codigo, etiqueta.almacen_nombre)}
            </div>
            <div className="flex-1 border-l border-r border-gray-800 px-3 py-2 text-sm flex items-center">
              {etiqueta.producto_nombre}
            </div>
            <div className="px-3 py-2 text-sm flex items-center justify-center">
              {etiqueta.unidad_medida_abreviatura || etiqueta.unidad_medida_nombre || ''}
            </div>
            <div className="font-bold flex items-center justify-center px-4 min-w-[40px]" style={estiloCodigoImpreso(etiqueta.almacen_nombre)}>
              {etiqueta.cantidad}
            </div>
          </div>
          {etiqueta.ubicacion && (
            <div className="text-center text-xs py-1 border-t border-gray-800 truncate px-2">
              Ubicacion: <b>{etiqueta.ubicacion.slice(0, 45)}</b>
            </div>
          )}
          <div className="flex justify-center py-1.5 border-t border-gray-800">
            <CodigoBarras valor={etiqueta.codigo} height={28} />
          </div>
        </div>
      </div>
      </PreviewImpresion>
    </div>
  )
}
