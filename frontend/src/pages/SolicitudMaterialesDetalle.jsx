import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { CATEGORIAS_MATERIALES } from '../utils/categoriasMateriales'

const colorEstado = {
  PENDIENTE: 'bg-orange-100 text-orange-700',
  ATENDIDA:  'bg-green-100 text-green-700',
  RECHAZADA: 'bg-red-100 text-red-700',
}

export default function SolicitudMaterialesDetalle() {
  const { id } = useParams()
  const { usuario } = useAuth()
  const [solicitud, setSolicitud] = useState(null)
  const [cargando, setCargando]   = useState(true)
  const [mensaje, setMensaje]     = useState(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [procesando, setProcesando] = useState(false)

  const puedeGestionar = ['admin', 'almacen'].includes(usuario?.rol)

  const cargar = () => {
    api.get(`/api/solicitudes-materiales/${id}`)
      .then(res => { setSolicitud(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [id])

  const atender = async () => {
    setProcesando(true)
    try {
      await api.post(`/api/solicitudes-materiales/${id}/atender`)
      setMensaje({ tipo: 'ok', texto: 'Solicitud marcada como atendida' })
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al atender la solicitud' })
    } finally {
      setProcesando(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  const rechazar = async () => {
    setProcesando(true)
    try {
      await api.post(`/api/solicitudes-materiales/${id}/rechazar`, { motivo: motivoRechazo })
      setMensaje({ tipo: 'ok', texto: 'Solicitud rechazada' })
      setMotivoRechazo('')
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al rechazar la solicitud' })
    } finally {
      setProcesando(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  if (cargando) return <div className="p-6 text-center py-12 text-gray-400">Cargando solicitud...</div>
  if (!solicitud) return <div className="p-6 text-center py-12 text-gray-400">Solicitud no encontrada</div>

  return (
    <div className="p-6">
      <div className="print:hidden">
        <Link to="/solicitudes-materiales" className="text-sm text-blue-700 hover:underline">&larr; Volver a solicitudes</Link>

        <div className="flex items-center justify-between mt-2 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Solicitud N.° {solicitud.numero_solicitud}</h1>
            <p className="text-gray-500 mt-1">
              {solicitud.persona_responsable} · {solicitud.almacen_nombre} · {solicitud.seccion || 'Sin seccion'} · {new Date(solicitud.fecha).toLocaleDateString('es-GT')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${colorEstado[solicitud.estado]}`}>{solicitud.estado}</span>
            <button
              onClick={() => window.print()}
              className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
            >
              Imprimir
            </button>
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

        {solicitud.estado === 'PENDIENTE' && puedeGestionar && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-bold text-yellow-800 mb-3">Pendiente de atencion</h2>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de rechazo (opcional)</label>
                <input
                  value={motivoRechazo}
                  onChange={e => setMotivoRechazo(e.target.value)}
                  placeholder="Solo necesario si vas a rechazar..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button onClick={atender} disabled={procesando} className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition disabled:opacity-50">
                Atender
              </button>
              <button onClick={rechazar} disabled={procesando} className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition disabled:opacity-50">
                Rechazar
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Categoria</div>
            <div className="text-gray-800">
              {CATEGORIAS_MATERIALES.find(c => c.value === solicitud.categoria)?.label || solicitud.categoria}
              {solicitud.categoria === 'OTROS' && solicitud.categoria_detalle ? ` — ${solicitud.categoria_detalle}` : ''}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Periodo</div>
            <div className="text-gray-800">{solicitud.periodo ? new Date(solicitud.periodo).toLocaleDateString('es-GT') : '—'}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-gray-400 text-xs font-medium mb-1">Registrado por</div>
            <div className="text-gray-800">{solicitud.usuario_nombre || '—'}</div>
          </div>
        </div>

        {solicitud.observaciones && (
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 mb-6 text-sm">
            <div className="text-gray-400 text-xs font-medium mb-1">Observaciones</div>
            <div className="text-gray-800">{solicitud.observaciones}</div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {solicitud.detalle.map((d, i) => (
                <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 text-gray-700">{d.producto}</td>
                  <td className="px-6 py-3 text-right">{Number(d.cantidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vista de impresion: replica el formato fisico real "Solicitud de
          Materiales" (reverso del talonario FT-GE-17, Fase B) */}
      <div className="hidden print:block border-2 border-gray-800 rounded">
        <div className="flex items-start justify-between px-4 pt-3">
          <div>
            <div className="font-bold text-lg text-gray-800">MANUFACTURA DE ALIMENTOS S.A.</div>
            <div className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Solicitud de Materiales</div>
          </div>
          <div className="border border-gray-800 text-center text-sm">
            <div className="bg-gray-100 px-3 py-0.5 border-b border-gray-800 font-semibold">Fecha</div>
            <div className="px-3 py-1">{new Date(solicitud.fecha).toLocaleDateString('es-GT')}</div>
          </div>
        </div>
        <div className="text-right px-4 text-sm text-red-600 font-bold">N.° {solicitud.numero_solicitud}</div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-sm">
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Secc.</b> {solicitud.seccion || '—'}</div>
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Periodo</b> {solicitud.periodo ? new Date(solicitud.periodo).toLocaleDateString('es-GT') : '—'}</div>
          <div className="border-b border-gray-200 pb-1 col-span-2"><b className="text-gray-500 text-xs uppercase mr-1">Persona responsable</b> {solicitud.persona_responsable}</div>
        </div>

        <div className="px-4 py-2 text-xs">
          <b className="text-gray-500 uppercase mr-2">Marcar con una X</b>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {CATEGORIAS_MATERIALES.map(c => (
              <span key={c.value} className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 border border-gray-800 text-center leading-3">
                  {solicitud.categoria === c.value ? 'X' : ''}
                </span>
                {c.label}{c.value === 'OTROS' && solicitud.categoria === 'OTROS' && solicitud.categoria_detalle ? ` (${solicitud.categoria_detalle})` : ''}
              </span>
            ))}
          </div>
        </div>

        <table className="w-full text-xs mx-4" style={{ width: 'calc(100% - 2rem)', margin: '0.5rem auto' }}>
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-1">Producto</th>
              <th className="text-right py-1">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {solicitud.detalle.map(d => (
              <tr key={d.id} className="border-b border-gray-200">
                <td className="py-1">{d.producto}</td>
                <td className="py-1 text-right">{Number(d.cantidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="px-4 py-2 text-xs">
          <b className="text-gray-500 uppercase mr-1">Observaciones</b> {solicitud.observaciones || ''}
        </div>

        <div className="flex justify-between px-4 py-6 text-xs text-gray-500 text-center">
          <div className="border-t border-gray-800 pt-1 w-[45%]">Solicitado por</div>
          <div className="border-t border-gray-800 pt-1 w-[45%]">V.° B.° Autorizado por</div>
        </div>
        <div className="flex justify-between items-end px-4 pb-2 pt-1 text-[10px] text-gray-400 border-t border-gray-300">
          <span>FT-GE-17 ED.-01</span>
          <span className="text-right">c.c. Almacen Materia Prima, Almacen {solicitud.almacen_nombre}<br />c.c. Compras</span>
        </div>
      </div>
    </div>
  )
}
