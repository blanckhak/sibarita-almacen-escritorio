import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'

const colorEstado = {
  PENDIENTE:     'bg-orange-100 text-orange-700',
  DEVUELTO:      'bg-green-100 text-green-700',
  CERRADO:       'bg-gray-200 text-gray-600',
  EN_APROBACION: 'bg-yellow-100 text-yellow-700',
}

const colorEtiqueta = {
  EN_ALMACEN: 'bg-blue-100 text-blue-700',
  SALIO:      'bg-orange-100 text-orange-700',
}

export default function NotaSalidaDetalle() {
  const { id } = useParams()
  const { usuario } = useAuth()
  const [nota, setNota]           = useState(null)
  const [cargando, setCargando]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje]     = useState(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [procesandoAprobacion, setProcesandoAprobacion] = useState(false)
  const [lineaDevolucion, setLineaDevolucion] = useState(null)
  const [codigoConfirmacion, setCodigoConfirmacion] = useState('')
  const [marcandoNoDevuelto, setMarcandoNoDevuelto] = useState(null)

  const puedeGestionar = ['admin', 'supervisor', 'operador'].includes(usuario?.rol)
  const puedeAprobar    = ['admin', 'supervisor'].includes(usuario?.rol)

  const cargar = () => {
    api.get(`/api/notas-salida/${id}`)
      .then(res => { setNota(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [id])

  const abrirConfirmacionDevuelto = (linea) => {
    setLineaDevolucion(linea)
    setCodigoConfirmacion('')
  }

  const confirmarDevolucion = async () => {
    if (!lineaDevolucion) return
    if (codigoConfirmacion.trim() !== String(lineaDevolucion.etiqueta_codigo)) {
      setMensaje({ tipo: 'error', texto: 'El codigo escrito no coincide con el de la etiqueta' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setGuardando(true)
    try {
      await api.post(`/api/notas-salida/${id}/devolucion`, { etiqueta_ids: [lineaDevolucion.etiqueta_id] })
      setMensaje({ tipo: 'ok', texto: `Devolucion del codigo ${lineaDevolucion.etiqueta_codigo} registrada correctamente` })
      setLineaDevolucion(null)
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar la devolucion' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  const marcarNoDevuelto = async (linea) => {
    setMarcandoNoDevuelto(linea.etiqueta_id)
    try {
      await api.post(`/api/notas-salida/${id}/lineas/${linea.etiqueta_id}/no-devuelto`)
      setMensaje({ tipo: 'ok', texto: `Codigo ${linea.etiqueta_codigo} anotado como no devuelto todavia` })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al anotar' })
    } finally {
      setMarcandoNoDevuelto(null)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  const aprobar = async () => {
    setProcesandoAprobacion(true)
    try {
      await api.post(`/api/notas-salida/${id}/aprobar`)
      setMensaje({ tipo: 'ok', texto: 'Nota de salida aprobada' })
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al aprobar' })
    } finally {
      setProcesandoAprobacion(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  const rechazar = async () => {
    setProcesandoAprobacion(true)
    try {
      await api.post(`/api/notas-salida/${id}/rechazar`, { motivo: motivoRechazo })
      setMensaje({ tipo: 'ok', texto: 'Nota de salida rechazada' })
      setMotivoRechazo('')
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al rechazar' })
    } finally {
      setProcesandoAprobacion(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  if (cargando) return <div className="p-6 text-center py-12 text-gray-400">Cargando nota de salida...</div>
  if (!nota) return <div className="p-6 text-center py-12 text-gray-400">Nota de salida no encontrada</div>

  const total = nota.detalle.reduce((s, d) => s + (Number(d.total) || 0), 0)

  return (
    <div className="p-6">
      <div className="print:hidden">
        <Link to="/notas-salida" className="text-sm text-blue-700 hover:underline">&larr; Volver a notas de salida</Link>

        <div className="flex items-center justify-between mt-2 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Nota de Salida N.° {nota.numero_nota}</h1>
            <p className="text-gray-500 mt-1">
              {nota.persona_responsable} · {nota.seccion || 'Sin seccion'} · {new Date(nota.fecha).toLocaleDateString('es-GT')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${colorEstado[nota.estado]}`}>{nota.estado}</span>
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

        {nota.estado === 'EN_APROBACION' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-bold text-yellow-800 mb-1">Pendiente de aprobacion (CU-05)</h2>
            <p className="text-sm text-yellow-700 mb-3">
              Esta nota supera el umbral configurado para salidas de alto valor. El producto todavia no ha salido fisicamente del almacen.
            </p>
            {puedeAprobar ? (
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
                <button onClick={aprobar} disabled={procesandoAprobacion} className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition disabled:opacity-50">
                  Aprobar
                </button>
                <button onClick={rechazar} disabled={procesandoAprobacion} className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition disabled:opacity-50">
                  Rechazar
                </button>
              </div>
            ) : (
              <p className="text-xs text-yellow-600">Solo un supervisor o administrador puede aprobar o rechazar esta nota.</p>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                {puedeGestionar && nota.estado === 'PENDIENTE' && <th className="px-4 py-3 text-left">Devolucion</th>}
                <th className="px-6 py-3 text-left">Codigo</th>
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-left">Almacen</th>
                <th className="px-6 py-3 text-right">Cantidad</th>
                <th className="px-6 py-3 text-right">P. Unitario</th>
                <th className="px-6 py-3 text-right">Total</th>
                <th className="px-6 py-3 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {nota.detalle.map((d, i) => (
                <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {puedeGestionar && nota.estado === 'PENDIENTE' && (
                    <td className="px-4 py-3">
                      {d.etiqueta_estado === 'SALIO' && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirConfirmacionDevuelto(d)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium transition"
                          >
                            Devuelto
                          </button>
                          <button
                            type="button"
                            onClick={() => marcarNoDevuelto(d)}
                            disabled={marcandoNoDevuelto === d.etiqueta_id}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium transition disabled:opacity-50"
                          >
                            {marcandoNoDevuelto === d.etiqueta_id ? '...' : 'No devuelto'}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-3 font-mono font-semibold text-gray-800">
                    <Link to={`/etiquetas/${d.etiqueta_id}`} className="text-blue-700 hover:underline">{d.etiqueta_codigo}</Link>
                  </td>
                  <td className="px-6 py-3 text-gray-700">{d.producto_nombre}</td>
                  <td className="px-6 py-3 text-gray-500">{d.almacen_nombre}</td>
                  <td className="px-6 py-3 text-right">{d.cantidad}</td>
                  <td className="px-6 py-3 text-right">{d.p_unitario ? Number(d.p_unitario).toFixed(2) : '—'}</td>
                  <td className="px-6 py-3 text-right">{d.total ? Number(d.total).toFixed(2) : '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEtiqueta[d.etiqueta_estado]}`}>{d.etiqueta_estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {lineaDevolucion && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden"
          onClick={() => setLineaDevolucion(null)}
        >
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Confirmar devolucion</h2>
            <p className="text-sm text-gray-500 mb-4">Verifica el producto antes de registrar la devolucion.</p>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div><span className="text-gray-500">Producto:</span> <span className="font-medium text-gray-800">{lineaDevolucion.producto_nombre}</span></div>
              <div><span className="text-gray-500">Cantidad esperada:</span> <span className="font-medium text-gray-800">{lineaDevolucion.cantidad}</span></div>
              <div><span className="text-gray-500">Codigo:</span> <span className="font-mono font-bold text-gray-800">{lineaDevolucion.etiqueta_codigo}</span></div>
            </div>

            <label className="block text-sm font-medium text-gray-600 mb-1">Escribe o escanea el codigo para confirmar</label>
            <input
              autoFocus
              value={codigoConfirmacion}
              onChange={e => setCodigoConfirmacion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmarDevolucion() } }}
              placeholder={`Ej: ${lineaDevolucion.etiqueta_codigo}`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setLineaDevolucion(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarDevolucion}
                disabled={guardando || codigoConfirmacion.trim() === ''}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {guardando ? 'Registrando...' : 'Confirmar devolucion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vista de impresion: replica el formato fisico de Nota de Salida (seccion 10.2) */}
      <div className="hidden print:block border-2 border-gray-800 rounded">
        <div className="bg-gray-800 text-white text-center font-bold py-2 tracking-wide">
          SIBARITA — NOTA DE SALIDA DE PRODUCTOS
        </div>
        <div className="text-center text-xs text-gray-500 py-1.5 border-b border-gray-300">
          N.° {nota.numero_nota} &nbsp;|&nbsp; Fecha: {new Date(nota.fecha).toLocaleDateString('es-GT')}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-sm">
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Seccion</b> {nota.seccion || '—'}</div>
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Guia relacionada</b> {nota.numero_guia || '—'}</div>
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Persona responsable</b> {nota.persona_responsable}</div>
          <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Motivo</b> {nota.motivo}</div>
        </div>
        <table className="w-full text-xs mx-4" style={{ width: 'calc(100% - 2rem)', margin: '0.5rem auto' }}>
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-1">Codigo</th>
              <th className="text-left py-1">Detalle</th>
              <th className="text-right py-1">Cantidad</th>
              <th className="text-right py-1">P. Unit.</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {nota.detalle.map(d => (
              <tr key={d.id} className="border-b border-gray-200">
                <td className="py-1">{d.etiqueta_codigo}</td>
                <td className="py-1">{d.producto_nombre}</td>
                <td className="py-1 text-right">{d.cantidad}</td>
                <td className="py-1 text-right">{d.p_unitario ? Number(d.p_unitario).toFixed(2) : '—'}</td>
                <td className="py-1 text-right">{d.total ? Number(d.total).toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
          {total > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} className="text-right font-bold py-1">Total</td>
                <td className="text-right font-bold py-1">{total.toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        <div className="px-4 py-2 text-xs">
          <b className="text-gray-500 uppercase mr-1">Observaciones</b> {nota.observaciones || ''}
        </div>
        <div className="flex justify-between px-4 py-6 text-xs text-gray-500 text-center">
          <div className="border-t border-gray-800 pt-1 w-[30%]">Solicitado por</div>
          <div className="border-t border-gray-800 pt-1 w-[30%]">Revisado por</div>
          <div className="border-t border-gray-800 pt-1 w-[30%]">Aprobado por</div>
        </div>
      </div>
    </div>
  )
}
