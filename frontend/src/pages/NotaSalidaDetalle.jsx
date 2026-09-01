import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { colorEtiquetaEstado } from '../utils/etiquetaEstados'
import { textoStock } from '../utils/stockResumen'
import { enPaginas } from '../utils/paginarImpresion'
import { claseCodigoAlmacen, estiloCodigoImpreso, codigoAlmacen, numeroCodigo } from '../utils/colorAlmacen'
import PreviewImpresion from '../components/PreviewImpresion'
import CodigoBarras from '../components/CodigoBarras'

const colorEstado = {
  PENDIENTE:     'bg-orange-100 text-orange-700',
  DEVUELTO:      'bg-green-100 text-green-700',
  CERRADO:       'bg-gray-200 text-gray-600',
  EN_APROBACION: 'bg-yellow-100 text-yellow-700',
}

// Encabezado comun del talonario FT-GE-17 (empresa, fecha, referencia y datos
// de la nota). Lo comparten la vista de impresion de salida y la de devolucion.
function CabeceraTalonario({ nota, subtitulo, fecha, refTexto }) {
  return (
    <>
      <div className="flex items-start justify-between px-4 pt-3">
        <div>
          <div className="font-bold text-lg text-gray-800">MANUFACTURA DE ALIMENTOS S.A.</div>
          <div className="font-semibold text-sm text-gray-700 uppercase tracking-wide">{subtitulo}</div>
        </div>
        <div className="border border-gray-800 text-center text-sm">
          <div className="bg-gray-100 px-3 py-0.5 border-b border-gray-800 font-semibold">Fecha</div>
          <div className="px-3 py-1">{fecha}</div>
        </div>
      </div>
      <div className="text-right px-4 text-sm text-red-600 font-bold">{refTexto}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-sm">
        <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Secc.</b> {nota.seccion || '—'}</div>
        <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Orden de Ingreso</b> {nota.numero_guia || '—'}</div>
        <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Persona responsable</b> {nota.persona_responsable}</div>
        <div className="border-b border-gray-200 pb-1"><b className="text-gray-500 text-xs uppercase mr-1">Motivo</b> {nota.motivo}</div>
      </div>
    </>
  )
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
  // Panel de "Devolucion usada": cantidad/peso reales con que vuelve el item.
  const [devCantidad, setDevCantidad] = useState('')
  const [devPeso, setDevPeso]         = useState('')
  const [devObs, setDevObs]           = useState('')
  const [marcandoNoDevuelto, setMarcandoNoDevuelto] = useState(null)
  const [modoImpresion, setModoImpresion] = useState('salida')
  // Previsualizacion: el documento se muestra en pantalla dentro de un overlay
  // con boton Imprimir antes de mandar a la impresora.
  const [preview, setPreview] = useState(false)
  // Linea cuya etiqueta USADA (codigo nuevo de la devolucion) se va a imprimir.
  const [lineaEtiquetaUsada, setLineaEtiquetaUsada] = useState(null)

  const puedeGestionar = ['admin', 'almacen'].includes(usuario?.rol)
  const puedeAprobar    = ['admin', 'almacen'].includes(usuario?.rol)

  const cargar = () => {
    api.get(`/api/notas-salida/${id}`)
      .then(res => { setNota(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [id])

  // Cierra el preview y vuelve el modo a 'salida' para que un Ctrl+P posterior
  // no saque la nota de devolucion por error.
  const cerrarPreview = () => {
    setPreview(false)
    setModoImpresion('salida')
    setLineaEtiquetaUsada(null)
  }

  const abrirConfirmacionDevuelto = (linea) => {
    setLineaDevolucion(linea)
    setCodigoConfirmacion('')
    setDevCantidad(String(linea.cantidad ?? ''))
    setDevPeso('')
    setDevObs('')
  }

  const confirmarDevolucion = async (condicion) => {
    if (!lineaDevolucion) return
    if (numeroCodigo(codigoConfirmacion) !== String(lineaDevolucion.etiqueta_codigo)) {
      setMensaje({ tipo: 'error', texto: 'El codigo escrito no coincide con el de la etiqueta' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    if (condicion === 'USADO') {
      const n = Number(devCantidad)
      if (!Number.isInteger(n) || n <= 0 || n > lineaDevolucion.cantidad) {
        setMensaje({ tipo: 'error', texto: `La cantidad que vuelve debe estar entre 1 y ${lineaDevolucion.cantidad}` })
        setTimeout(() => setMensaje(null), 3000)
        return
      }
      if (devPeso !== '' && (Number.isNaN(Number(devPeso)) || Number(devPeso) <= 0)) {
        setMensaje({ tipo: 'error', texto: 'El peso debe ser un numero mayor a 0' })
        setTimeout(() => setMensaje(null), 3000)
        return
      }
    }
    setGuardando(true)
    try {
      const payload = { etiqueta_ids: [lineaDevolucion.etiqueta_id], condicion }
      if (condicion === 'USADO') {
        payload.devuelto_cantidad = Number(devCantidad)
        if (devPeso !== '') payload.devuelto_peso = Number(devPeso)
        if (devObs.trim()) payload.devuelto_obs = devObs.trim()
      }
      const { data } = await api.post(`/api/notas-salida/${id}/devolucion`, payload)
      const nuevo = data.codigos_nuevos?.[0]?.codigo_nuevo
      setMensaje({
        tipo: 'ok',
        texto: condicion === 'USADO'
          ? `Devolucion usada del codigo ${lineaDevolucion.etiqueta_codigo} registrada. Codigo nuevo: ${nuevo}`
          : `Devolucion del codigo ${lineaDevolucion.etiqueta_codigo} registrada correctamente`,
      })
      setLineaDevolucion(null)
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar la devolucion' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 5000)
    }
  }

  const imprimir = (modo) => {
    setModoImpresion(modo)
    setPreview(true)
  }

  // Imprime la etiqueta fisica del codigo nuevo que genero una devolucion usada
  // (con codigo de barras, marcada USADO). Registra la (re)impresion como en
  // GuiaDetalle.
  const imprimirEtiquetaUsada = async (d) => {
    if (d.etiqueta_devuelta_id) {
      await api.post(`/api/etiquetas/${d.etiqueta_devuelta_id}/imprimir`).catch(() => {})
    }
    setLineaEtiquetaUsada(d)
    imprimir('etiqueta_usada')
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
  const lineasDevueltas = nota.detalle.filter(d => d.devuelto_condicion)
  const hayDevoluciones = lineasDevueltas.length > 0
  // Fecha del documento de devolucion = la mas reciente en que volvio una linea.
  const fechaDevolucion = lineasDevueltas
    .map(d => d.devuelto_en)
    .filter(Boolean)
    .sort()
    .at(-1)

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
              onClick={() => imprimir('salida')}
              className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
            >
              Imprimir
            </button>
            {hayDevoluciones && (
              <button
                onClick={() => imprimir('devolucion')}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
              >
                Imprimir Nota de Devolucion
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
                <th className="px-6 py-3 text-left">Stock actual</th>
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
                    <Link to={`/etiquetas/${d.etiqueta_id}`} className={`hover:underline px-1.5 rounded ${claseCodigoAlmacen(d.almacen_nombre)}`}>{codigoAlmacen(d.etiqueta_codigo, d.almacen_nombre)}</Link>
                    {d.etiqueta_devuelta_codigo && (
                      <div className="text-xs text-amber-700 font-normal mt-0.5 flex items-center gap-2">
                        <span>&rarr; cod. {codigoAlmacen(d.etiqueta_devuelta_codigo, d.almacen_nombre)} (usado)</span>
                        {puedeGestionar && (
                          <button
                            type="button"
                            onClick={() => imprimirEtiquetaUsada(d)}
                            className="text-[11px] border border-amber-300 text-amber-700 rounded px-1.5 py-0.5 hover:bg-amber-50 print:hidden"
                          >
                            Imprimir etiqueta
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-700">{d.producto_nombre}</td>
                  <td className="px-6 py-3 text-gray-500">{d.almacen_nombre}</td>
                  <td className="px-6 py-3 text-right">{d.cantidad}</td>
                  <td className="px-6 py-3 text-gray-500 text-xs">
                    {textoStock(d.stock_agregado_actual, d.codigos_disponibles_actual)}
                  </td>
                  <td className="px-6 py-3 text-right">{d.p_unitario ? Number(d.p_unitario).toFixed(2) : '—'}</td>
                  <td className="px-6 py-3 text-right">{d.total ? Number(d.total).toFixed(2) : '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEtiquetaEstado(d.etiqueta_estado)}`}>{d.etiqueta_estado}</span>
                    {d.devuelto_condicion && (
                      <div className={`text-xs mt-1 font-medium ${d.devuelto_condicion === 'USADO' ? 'text-amber-700' : 'text-green-700'}`}>
                        Devuelta {d.devuelto_condicion === 'USADO' ? 'usada' : 'nueva'}
                        {d.devuelto_condicion === 'USADO' && (d.devuelto_cantidad != null || d.devuelto_peso != null) && (
                          <span className="block font-normal text-gray-500">
                            {d.devuelto_cantidad != null && `volvieron ${d.devuelto_cantidad} de ${d.cantidad}`}
                            {d.devuelto_peso != null && `${d.devuelto_cantidad != null ? ' · ' : ''}${Number(d.devuelto_peso)} de peso`}
                          </span>
                        )}
                        {d.devuelto_obs && <span className="block font-normal text-gray-400 italic">{d.devuelto_obs}</span>}
                      </div>
                    )}
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
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Confirmar devolucion</h2>
            <p className="text-sm text-gray-500 mb-4">
              Verifica el producto y elegi como vuelve: <b>nueva</b> (el mismo codigo
              vuelve al stock) o <b>usada</b> (se retira el codigo y se genera uno
              nuevo, que reingresa como stock de devolucion).
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div><span className="text-gray-500">Producto:</span> <span className="font-medium text-gray-800">{lineaDevolucion.producto_nombre}</span></div>
              <div><span className="text-gray-500">Cantidad esperada:</span> <span className="font-medium text-gray-800">{lineaDevolucion.cantidad}</span></div>
              <div><span className="text-gray-500">Codigo:</span> <span className="font-mono font-bold text-gray-800">{codigoAlmacen(lineaDevolucion.etiqueta_codigo, lineaDevolucion.almacen_nombre)}</span></div>
            </div>

            <label className="block text-sm font-medium text-gray-600 mb-1">Escribe o escanea el codigo para confirmar</label>
            <input
              autoFocus
              value={codigoConfirmacion}
              onChange={e => setCodigoConfirmacion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmarDevolucion('NUEVO') } }}
              placeholder={`Ej: ${codigoAlmacen(lineaDevolucion.etiqueta_codigo, lineaDevolucion.almacen_nombre)}`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />

            {/* Panel de la devolucion USADA: solo se usa al elegir "Devuelta usada" */}
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-4">
              <p className="text-xs font-semibold text-amber-800 mb-2">Datos de la devolucion usada</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad que vuelve</label>
                  <input
                    type="number" min="1" step="1" max={lineaDevolucion.cantidad}
                    value={devCantidad}
                    onChange={e => setDevCantidad(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-[11px] text-gray-400">de {lineaDevolucion.cantidad} que salieron</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Peso (opcional)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={devPeso}
                    onChange={e => setDevPeso(e.target.value)}
                    placeholder="Ej: 32.5"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Observacion (opcional)</label>
                  <input
                    value={devObs}
                    onChange={e => setDevObs(e.target.value)}
                    placeholder="En que estado vuelve..."
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setLineaDevolucion(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmarDevolucion('NUEVO')}
                disabled={guardando || codigoConfirmacion.trim() === ''}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {guardando ? 'Registrando...' : 'Devuelta nueva'}
              </button>
              <button
                type="button"
                onClick={() => confirmarDevolucion('USADO')}
                disabled={guardando || codigoConfirmacion.trim() === ''}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {guardando ? 'Registrando...' : 'Devuelta usada'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PreviewImpresion abierto={preview} onCerrar={cerrarPreview}>
      {modoImpresion === 'salida' && (
        <div className={preview ? '' : 'hidden print:block'}>
          {enPaginas(nota.detalle).map((filas, pi, todas) => {
            const ultima = pi === todas.length - 1
            const [yy, mm, dd] = String(nota.fecha).slice(0, 10).split('-')
            return (
              <div key={pi} className="border-2 border-gray-800 rounded break-after-page last:break-after-auto">
                <div className="flex items-start justify-between px-4 pt-3">
                  <div>
                    <div className="font-bold text-lg text-gray-800 text-center">MANUFACTURA DE ALIMENTOS S.A.</div>
                    <div className="font-semibold text-sm text-gray-700 uppercase tracking-wide text-center">Nota de Salida de Activos</div>
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
                  N.° {nota.numero_nota}
                  {todas.length > 1 && <span className="text-gray-500 font-normal text-xs ml-2">Hoja {pi + 1} de {todas.length}</span>}
                </div>

                <div className="px-4 py-3 text-sm space-y-1">
                  <div className="flex"><b className="text-gray-600 w-44 shrink-0">SECC.:</b><span className="border-b border-gray-400 flex-1">{nota.seccion || ''}</span></div>
                  <div className="flex"><b className="text-gray-600 w-44 shrink-0">PERSONA RESPONSABLE:</b><span className="border-b border-gray-400 flex-1">{nota.persona_responsable}</span></div>
                  <div className="flex"><b className="text-gray-600 w-44 shrink-0">ORDEN DE INGRESO</b><span className="border-b border-gray-400 flex-1">{nota.numero_guia || ''}</span></div>
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
                    {filas.map((d, ri) => (
                      <tr key={ri} className="border-b border-gray-400 h-7 align-top">
                        <td className="py-1 px-1">
                          {d ? (
                            <>
                              <span className="font-mono font-bold px-1 mr-1 rounded" style={estiloCodigoImpreso(d.almacen_nombre)}>{codigoAlmacen(d.etiqueta_codigo, d.almacen_nombre)}</span>
                              {d.producto_nombre}
                              {d.devuelto_condicion === 'USADO' && <span className="text-[10px] text-gray-500"> (devuelto usado)</span>}
                            </>
                          ) : ''}
                        </td>
                        <td className="py-1 text-center border-l border-gray-400">{d ? d.cantidad : ''}</td>
                        <td className="py-1 text-right px-1 border-l border-gray-400">{d?.p_unitario ? Number(d.p_unitario).toFixed(2) : ''}</td>
                        <td className="py-1 text-right px-1 border-l border-gray-400">{d?.total ? Number(d.total).toFixed(2) : ''}</td>
                      </tr>
                    ))}
                    {ultima && (
                      <tr className="border-y-2 border-gray-800 h-7 font-semibold">
                        <td className="py-1 text-right pr-2">TOTAL</td>
                        <td className="border-l border-gray-800">&nbsp;</td>
                        <td className="border-l border-gray-800">&nbsp;</td>
                        <td className="py-1 text-right px-1 border-l border-gray-800">{total > 0 ? total.toFixed(2) : ''}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {ultima && (
                  <>
                    <div className="px-4 py-2 text-xs flex">
                      <b className="text-gray-600 mr-1">OBSERVACIONES</b>
                      <span className="border-b border-gray-400 flex-1">{nota.observaciones || ''}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-x-6 px-4 pt-10 pb-2 text-xs text-gray-600 text-center">
                      <div className="border-t border-gray-800 pt-1">Solicitado por</div>
                      <div className="border-t border-gray-800 pt-1">Revisado por</div>
                      <div className="border-t border-gray-800 pt-1">Revisado por</div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 px-10 pt-10 pb-3 text-xs text-gray-600 text-center">
                      <div className="border-t border-gray-800 pt-1">Revisado por</div>
                      <div className="border-t border-gray-800 pt-1">Aprobado por</div>
                    </div>
                    <div className="border-t-2 border-dashed border-gray-500 mx-4" />
                    <div className="px-4 py-3 text-xs">
                      <div className="flex gap-6 mb-1">
                        <span className="flex-1 flex"><b className="mr-1">Solicitado por:</b><span className="border-b border-gray-400 flex-1">&nbsp;</span></span>
                        <span className="flex-1 flex"><b className="mr-1">V°B° Autorizado por:</b><span className="border-b border-gray-400 flex-1">&nbsp;</span></span>
                      </div>
                      <div className="flex"><b className="w-16 shrink-0">Nombre</b>: <span className="border-b border-gray-400 flex-1 ml-1">{nota.persona_responsable}</span></div>
                      <div className="flex"><b className="w-16 shrink-0">Cargo</b>: <span className="border-b border-gray-400 flex-1 ml-1">&nbsp;</span></div>
                      <div className="flex mt-1"><b className="w-16 shrink-0">Firma:</b><span className="border-b border-gray-400 flex-1 ml-1">&nbsp;</span></div>
                    </div>
                    <div className="px-4 py-1 text-[11px] italic text-gray-600">
                      Nota.- Cuando no hay stock se envia una copia al area de Compras.
                    </div>
                    <div className="flex justify-between items-end px-4 pb-2 pt-1 text-[10px] text-gray-500 border-t border-gray-300">
                      <span>FT-GE-17 ED. - 01</span>
                      <span className="text-right">c.c. Almacen Materia Prima, Almacen {nota.detalle[0]?.almacen_nombre || '—'}<br />c.c. Compras</span>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Nota de Devolucion (Bloque 4): se imprime cuando ya hay lineas
          devueltas. Lista lo que volvio a Mesa, en que condicion y, si volvio
          usada, el codigo nuevo que se le asigno. */}
      {modoImpresion === 'devolucion' && (
      <div className={`${preview ? '' : 'hidden print:block'} border-2 border-gray-800 rounded`}>
        <CabeceraTalonario
          nota={nota}
          subtitulo="Nota de Devolucion de Activos"
          fecha={fechaDevolucion ? new Date(fechaDevolucion).toLocaleDateString('es-GT') : '—'}
          refTexto={`Ref. Nota de Salida N.° ${nota.numero_nota}`}
        />
        <table className="w-full text-xs" style={{ width: 'calc(100% - 2rem)', margin: '0.5rem auto' }}>
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-1 pr-3">Codigo salida</th>
              <th className="text-left py-1 pr-3">Detalle</th>
              <th className="text-right py-1 pr-3">Salio</th>
              <th className="text-right py-1 pr-3">Volvio</th>
              <th className="text-right py-1 pr-3">Peso</th>
              <th className="text-left py-1 pr-3">Condicion</th>
              <th className="text-left py-1 pr-3">Codigo nuevo</th>
              <th className="text-left py-1">Fecha dev.</th>
            </tr>
          </thead>
          <tbody>
            {lineasDevueltas.map(d => (
              <tr key={d.id} className="border-b border-gray-200">
                <td className="py-1 pr-3"><span className="font-mono font-bold px-1 rounded" style={estiloCodigoImpreso(d.almacen_nombre)}>{codigoAlmacen(d.etiqueta_codigo, d.almacen_nombre)}</span></td>
                <td className="py-1 pr-3">{d.producto_nombre}</td>
                <td className="py-1 pr-3 text-right">{d.cantidad}</td>
                <td className="py-1 pr-3 text-right">{d.devuelto_cantidad != null ? d.devuelto_cantidad : d.cantidad}</td>
                <td className="py-1 pr-3 text-right">{d.devuelto_peso != null ? Number(d.devuelto_peso) : '—'}</td>
                <td className="py-1 pr-3">{d.devuelto_condicion === 'USADO' ? 'Usada' : 'Nueva'}</td>
                <td className="py-1 pr-3">
                  {d.etiqueta_devuelta_codigo
                    ? <span className="font-mono font-bold px-1 rounded" style={estiloCodigoImpreso(d.almacen_nombre)}>{codigoAlmacen(d.etiqueta_devuelta_codigo, d.almacen_nombre)}</span>
                    : '—'}
                </td>
                <td className="py-1">{d.devuelto_en ? new Date(d.devuelto_en).toLocaleDateString('es-GT') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-1 text-xs italic text-gray-600 border-t border-gray-300">
          Nota.- Los items devueltos como "usados" reingresan con un codigo nuevo y stock de devolucion.
        </div>
        <div className="flex justify-between px-4 py-6 text-xs text-gray-500 text-center">
          <div className="border-t border-gray-800 pt-1 w-[45%]">Recibido en Mesa por</div>
          <div className="border-t border-gray-800 pt-1 w-[45%]">V.B. Almacen</div>
        </div>
        <div className="flex justify-between items-end px-4 pb-2 pt-1 text-[10px] text-gray-400 border-t border-gray-300">
          <span>FT-GE-17 ED.-01</span>
          <span className="text-right">c.c. Almacen {nota.detalle[0]?.almacen_nombre || '—'}<br />c.c. Compras</span>
        </div>
      </div>
      )}

      {/* Etiqueta fisica del codigo nuevo de una devolucion usada */}
      {modoImpresion === 'etiqueta_usada' && lineaEtiquetaUsada && (
        <div className={preview ? '' : 'hidden print:block'}>
          <div className="border border-gray-800 rounded inline-block">
            <div className="bg-gray-100 text-center font-semibold text-sm py-1.5 border-b border-gray-800 px-4">
              {lineaEtiquetaUsada.producto_nombre} · USADO
            </div>
            <div className="flex">
              <div className="font-bold text-2xl flex items-center justify-center px-4 min-w-[70px]" style={estiloCodigoImpreso(lineaEtiquetaUsada.almacen_nombre)}>
                {codigoAlmacen(lineaEtiquetaUsada.etiqueta_devuelta_codigo, lineaEtiquetaUsada.almacen_nombre)}
              </div>
              <div className="flex-1 border-l border-r border-gray-800 px-3 py-2 text-sm flex items-center">
                {lineaEtiquetaUsada.producto_nombre}
              </div>
              <div className="px-3 py-2 text-sm flex items-center justify-center">
                {lineaEtiquetaUsada.unidad_medida_abreviatura || ''}
              </div>
              <div className="font-bold flex items-center justify-center px-4 min-w-[40px]" style={estiloCodigoImpreso(lineaEtiquetaUsada.almacen_nombre)}>
                {lineaEtiquetaUsada.devuelto_cantidad != null ? lineaEtiquetaUsada.devuelto_cantidad : lineaEtiquetaUsada.cantidad}
              </div>
            </div>
            <div className="flex justify-center py-1.5 border-t border-gray-800">
              <CodigoBarras valor={lineaEtiquetaUsada.etiqueta_devuelta_codigo} height={28} />
            </div>
          </div>
        </div>
      )}
      </PreviewImpresion>
    </div>
  )
}
