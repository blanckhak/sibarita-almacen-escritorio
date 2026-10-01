import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { colorEtiquetaEstado, labelEtiquetaEstado } from '../utils/etiquetaEstados'
import { claseCodigoAlmacen, estiloCodigoImpreso, codigoAlmacen, numeroCodigo } from '../utils/colorAlmacen'
import { PRESENTACIONES } from '../utils/presentaciones'
import PreviewImpresion from './PreviewImpresion'
import CodigoBarras from './CodigoBarras'
import { fmtCantidad } from '../utils/fmt'

// Registro de la devolucion de una Nota de Salida, desde la pantalla de Notas
// de Devolucion: por cada linea que salio, Devuelto (nueva / usada) o No
// devuelto. Cada linea devuelta queda en la Nota de Devolucion del dia
// (backend utils/notaDevolucion.js); `onRegistrada(notaDevolucion)` avisa cual.
export default function DevolucionNotaSalida({ notaSalidaId, puedeGestionar, onRegistrada }) {
  const [nota, setNota]           = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje]     = useState(null)
  const [unidades, setUnidades]   = useState([])

  const [lineaDevolucion, setLineaDevolucion] = useState(null)
  const [codigoConfirmacion, setCodigoConfirmacion] = useState('')
  // Panel de "Devolucion usada": cantidad/presentacion/unidad reales con que
  // vuelve el item. Presentacion (Caja/Rollo/Bolsa/Saco) es como vino
  // fisicamente; Unidad (del catalogo Unidades de Medida) es la medida.
  const [devCantidad, setDevCantidad] = useState('')
  const [devPresentacion, setDevPresentacion] = useState('')
  const [devUnidadMedidaId, setDevUnidadMedidaId] = useState('')
  const [devObs, setDevObs]           = useState('')
  // AREA - MAQUINA de la Nota de Devolucion impresa (vale para nueva y usada).
  const [devArea, setDevArea]         = useState('')

  // Edicion de una devolucion usada ya registrada (cantidad/presentacion/unidad/obs).
  const [lineaEditando, setLineaEditando]     = useState(null)
  const [editCantidad, setEditCantidad]       = useState('')
  const [editPresentacion, setEditPresentacion] = useState('')
  const [editUnidadMedidaId, setEditUnidadMedidaId] = useState('')
  const [editObs, setEditObs]                 = useState('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [marcandoNoDevuelto, setMarcandoNoDevuelto] = useState(null)
  // Linea cuya etiqueta USADA (codigo nuevo de la devolucion) se va a imprimir.
  const [lineaEtiquetaUsada, setLineaEtiquetaUsada] = useState(null)

  const cargar = () => {
    api.get(`/api/notas-salida/${notaSalidaId}`)
      .then(res => setNota(res.data))
      .catch(() => setNota(null))
  }

  useEffect(() => { cargar() }, [notaSalidaId])
  useEffect(() => { api.get('/api/unidades-medida').then(res => setUnidades(res.data)).catch(() => {}) }, [])

  const avisar = (m, ms = 5000) => {
    setMensaje(m)
    setTimeout(() => setMensaje(null), ms)
  }

  const abrirConfirmacionDevuelto = (linea) => {
    setLineaDevolucion(linea)
    setCodigoConfirmacion('')
    setDevCantidad(String(linea.cantidad ?? ''))
    setDevPresentacion('')
    setDevUnidadMedidaId('')
    setDevObs('')
    setDevArea('')
  }

  const confirmarDevolucion = async (condicion) => {
    if (!lineaDevolucion) return
    if (numeroCodigo(codigoConfirmacion) !== String(lineaDevolucion.etiqueta_codigo)) {
      avisar({ tipo: 'error', texto: 'El codigo escrito no coincide con el de la etiqueta' }, 3000)
      return
    }
    if (condicion === 'USADO') {
      const n = Number(devCantidad)
      if (!Number.isFinite(n) || n <= 0 || n > lineaDevolucion.cantidad) {
        avisar({ tipo: 'error', texto: `La cantidad que vuelve debe ser mayor a 0 y hasta ${fmtCantidad(lineaDevolucion.cantidad)}` }, 3000)
        return
      }
    }
    setGuardando(true)
    try {
      const payload = { etiqueta_ids: [lineaDevolucion.etiqueta_id], condicion }
      if (devArea.trim()) payload.area_maquina = devArea.trim()
      if (condicion === 'USADO') {
        payload.devuelto_cantidad = Number(devCantidad)
        if (devPresentacion !== '') payload.devuelto_presentacion = devPresentacion
        if (devUnidadMedidaId !== '') payload.devuelto_unidad_medida_id = Number(devUnidadMedidaId)
        if (devObs.trim()) payload.devuelto_obs = devObs.trim()
      }
      const { data } = await api.post(`/api/notas-salida/${notaSalidaId}/devolucion`, payload)
      const nuevo = data.codigos_nuevos?.[0]?.codigo_nuevo
      const nd = data.nota_devolucion
      avisar({
        tipo: 'ok',
        texto: `${condicion === 'USADO'
          ? `Devolucion usada del codigo ${codigoAlmacen(lineaDevolucion.etiqueta_codigo, lineaDevolucion.almacen_nombre)} registrada. Codigo nuevo: ${codigoAlmacen(nuevo, lineaDevolucion.almacen_nombre)}.`
          : `Devolucion del codigo ${codigoAlmacen(lineaDevolucion.etiqueta_codigo, lineaDevolucion.almacen_nombre)} registrada.`}${nd ? ` Va en la Nota de Devolucion N.° ${nd.numero_nota}.` : ''}`,
      })
      setLineaDevolucion(null)
      cargar()
      onRegistrada?.(nd)
    } catch (err) {
      avisar({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar la devolucion' })
    } finally {
      setGuardando(false)
    }
  }

  const abrirEdicionDevolucion = (linea) => {
    setLineaEditando(linea)
    setEditCantidad(String(linea.devuelto_cantidad ?? ''))
    setEditPresentacion(linea.devuelto_presentacion || '')
    setEditUnidadMedidaId(linea.devuelto_unidad_medida_id ? String(linea.devuelto_unidad_medida_id) : '')
    setEditObs(linea.devuelto_obs || '')
  }

  const guardarEdicionDevolucion = async () => {
    if (!lineaEditando) return
    const n = Number(editCantidad)
    if (!Number.isFinite(n) || n <= 0 || n > lineaEditando.cantidad) {
      avisar({ tipo: 'error', texto: `La cantidad que vuelve debe ser mayor a 0 y hasta ${fmtCantidad(lineaEditando.cantidad)}` }, 3000)
      return
    }
    setGuardandoEdicion(true)
    try {
      await api.put(`/api/notas-salida/${notaSalidaId}/lineas/${lineaEditando.etiqueta_id}/devolucion-usada`, {
        devuelto_cantidad: n,
        devuelto_presentacion: editPresentacion || null,
        devuelto_unidad_medida_id: editUnidadMedidaId !== '' ? Number(editUnidadMedidaId) : null,
        devuelto_obs: editObs.trim(),
      })
      avisar({ tipo: 'ok', texto: 'Devolucion corregida correctamente' })
      setLineaEditando(null)
      cargar()
      onRegistrada?.(null)
    } catch (err) {
      avisar({ tipo: 'error', texto: err.response?.data?.error || 'Error al corregir la devolucion' })
    } finally {
      setGuardandoEdicion(false)
    }
  }

  const marcarNoDevuelto = async (linea) => {
    setMarcandoNoDevuelto(linea.etiqueta_id)
    try {
      await api.post(`/api/notas-salida/${notaSalidaId}/lineas/${linea.etiqueta_id}/no-devuelto`)
      avisar({ tipo: 'ok', texto: `Codigo ${codigoAlmacen(linea.etiqueta_codigo, linea.almacen_nombre)} anotado como no devuelto todavia` }, 4000)
    } catch (err) {
      avisar({ tipo: 'error', texto: err.response?.data?.error || 'Error al anotar' }, 4000)
    } finally {
      setMarcandoNoDevuelto(null)
    }
  }

  // Imprime la etiqueta fisica del codigo nuevo que genero una devolucion usada
  // (con codigo de barras, marcada USADO). Registra la (re)impresion como en
  // GuiaDetalle.
  const imprimirEtiquetaUsada = async (d) => {
    if (d.etiqueta_devuelta_id) {
      await api.post(`/api/etiquetas/${d.etiqueta_devuelta_id}/imprimir`).catch(() => {})
    }
    setLineaEtiquetaUsada(d)
  }

  // La etiqueta se imprime desde un portal en <body>: al imprimir se oculta
  // #root (index.css), asi no sale la pagina de atras aunque este componente
  // viva dentro de un bloque print:hidden.
  useEffect(() => {
    document.body.classList.toggle('print-solo-portal', !!lineaEtiquetaUsada)
    return () => document.body.classList.remove('print-solo-portal')
  }, [lineaEtiquetaUsada])

  if (!nota) return <div className="text-sm text-gray-400 py-4">Cargando nota de salida...</div>

  const periodoCerrado = nota.periodo_estado === 'CERRADO'
  const gestiona = puedeGestionar && !periodoCerrado
  const lineas = nota.detalle.filter(d => d.etiqueta_id)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-600">
          Nota de Salida{' '}
          <Link to={`/notas-salida/${nota.id}`} className="font-mono font-semibold text-blue-700 hover:underline">N.° {nota.numero_nota}</Link>
          {' '}· {nota.persona_responsable} · {nota.seccion || 'Sin seccion'} · {new Date(nota.fecha).toLocaleDateString('es-GT')}
        </p>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${nota.estado === 'DEVUELTO' ? 'bg-green-100 text-green-700' : nota.estado === 'PENDIENTE' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}`}>{nota.estado}</span>
      </div>

      {mensaje && (
        <div className={`mb-3 px-4 py-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {periodoCerrado && (
        <p className="text-xs text-gray-500 mb-2">El periodo de esta nota de salida esta cerrado: no se pueden registrar devoluciones.</p>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-white">
            <tr>
              {gestiona && nota.estado === 'PENDIENTE' && <th className="px-4 py-3 text-left">Devolucion</th>}
              <th className="px-6 py-3 text-left">Codigo</th>
              <th className="px-6 py-3 text-left">Producto</th>
              <th className="px-6 py-3 text-left">Almacen</th>
              <th className="px-6 py-3 text-right">Salio</th>
              <th className="px-6 py-3 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((d, i) => {
              // Linea que salio y no volvio: se muestra SALIDA aunque el codigo
              // siga EN_ALMACEN con el resto (salida parcial).
              const afuera = !d.devuelto_condicion && nota.fecha_salida
              const estado = afuera ? 'SALIO' : d.etiqueta_estado
              return (
                <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {gestiona && nota.estado === 'PENDIENTE' && (
                    <td className="px-4 py-3">
                      {!d.devuelto_condicion && (
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
                        {gestiona && (
                          <button
                            type="button"
                            onClick={() => imprimirEtiquetaUsada(d)}
                            className="text-[11px] border border-amber-300 text-amber-700 rounded px-1.5 py-0.5 hover:bg-amber-50"
                          >
                            Imprimir etiqueta
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-700">{d.producto_nombre}</td>
                  <td className="px-6 py-3 text-gray-500">{d.almacen_nombre}</td>
                  <td className="px-6 py-3 text-right">{fmtCantidad(d.cantidad)}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEtiquetaEstado(estado)}`}>{labelEtiquetaEstado(estado)}</span>
                    {d.devuelto_condicion && (
                      <div className={`text-xs mt-1 font-medium ${d.devuelto_condicion === 'USADO' ? 'text-amber-700' : 'text-green-700'}`}>
                        Devuelta {d.devuelto_condicion === 'USADO' ? 'usada' : 'nueva'}
                        {d.devuelto_condicion === 'USADO' && d.devuelto_cantidad != null && (
                          <span className="block font-normal text-gray-500">volvieron {fmtCantidad(d.devuelto_cantidad)} de {fmtCantidad(d.cantidad)}</span>
                        )}
                        {d.devuelto_obs && <span className="block font-normal text-gray-400 italic">{d.devuelto_obs}</span>}
                        {d.devuelto_condicion === 'USADO' && gestiona && (
                          <button
                            type="button"
                            onClick={() => abrirEdicionDevolucion(d)}
                            className="text-[11px] text-blue-600 hover:underline mt-0.5"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {lineas.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-sm">Esta nota de salida no tiene codigos para devolver</p>
        )}
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
              <div><span className="text-gray-500">Cantidad esperada:</span> <span className="font-medium text-gray-800">{fmtCantidad(lineaDevolucion.cantidad)}</span></div>
              <div><span className="text-gray-500">Codigo:</span> <span className="font-mono font-bold text-gray-800">{codigoAlmacen(lineaDevolucion.etiqueta_codigo, lineaDevolucion.almacen_nombre)}</span></div>
            </div>

            <label className="block text-sm font-medium text-gray-600 mb-1">Escribe o escanea el codigo para confirmar</label>
            <input
              autoFocus
              value={codigoConfirmacion}
              onChange={e => setCodigoConfirmacion(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmarDevolucion('NUEVO') } }}
              placeholder={`Ej: ${codigoAlmacen(lineaDevolucion.etiqueta_codigo, lineaDevolucion.almacen_nombre)}`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            />

            <label className="block text-sm font-medium text-gray-600 mb-1">Area / Maquina (opcional)</label>
            <input
              value={devArea}
              onChange={e => setDevArea(e.target.value.toUpperCase())}
              maxLength={150}
              placeholder="Ej: MOLINO 03"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />

            {/* Panel de la devolucion USADA: solo se usa al elegir "Devuelta usada" */}
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-4">
              <p className="text-xs font-semibold text-amber-800 mb-2">Datos de la devolucion usada</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad que vuelve</label>
                  <input
                    type="number" min="0.001" step="0.001" max={lineaDevolucion.cantidad}
                    value={devCantidad}
                    onChange={e => setDevCantidad(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-[11px] text-gray-400">de {fmtCantidad(lineaDevolucion.cantidad)} que salieron</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Presentacion (opcional)</label>
                  <select
                    value={devPresentacion}
                    onChange={e => setDevPresentacion(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Sin definir...</option>
                    {PRESENTACIONES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unidad de medida (opcional)</label>
                  <select
                    value={devUnidadMedidaId}
                    onChange={e => setDevUnidadMedidaId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Sin definir...</option>
                    {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Observacion (opcional)</label>
                  <input
                    value={devObs}
                    onChange={e => setDevObs(e.target.value.toUpperCase())}
                    placeholder="En que estado vuelve..."
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                {/* Fase 11 (R6): lo que se consume si se devuelve usada esta
                    cantidad. Sin montos: en la devolucion no se muestra ningun
                    precio (pedido del usuario 24/09). */}
                {(() => {
                  const salio = Number(lineaDevolucion.cantidad)
                  const vuelve = Number(devCantidad || 0)
                  const consumido = Math.max(0, Math.round((salio - vuelve) * 1000) / 1000)
                  return (
                    <div className="col-span-2 border-t border-amber-200 pt-2 text-xs text-amber-800">
                      Consumido: <b>{fmtCantidad(consumido)}</b>
                    </div>
                  )
                })()}
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

      {lineaEditando && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden"
          onClick={() => setLineaEditando(null)}
        >
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Corregir devolucion usada</h2>
            <p className="text-sm text-gray-500 mb-4">
              Corrige la cantidad, unidad u observacion de esta devolucion ya registrada.
              El codigo generado no cambia; si la cantidad cambia, se ajusta el inventario
              por la diferencia.
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div><span className="text-gray-500">Producto:</span> <span className="font-medium text-gray-800">{lineaEditando.producto_nombre}</span></div>
              <div><span className="text-gray-500">Codigo nuevo:</span> <span className="font-mono font-bold text-gray-800">{codigoAlmacen(lineaEditando.etiqueta_devuelta_codigo, lineaEditando.almacen_nombre)}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad que vuelve</label>
                <input
                  type="number" min="0.001" step="0.001" max={lineaEditando.cantidad}
                  value={editCantidad}
                  onChange={e => setEditCantidad(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[11px] text-gray-400">de {fmtCantidad(lineaEditando.cantidad)} que salieron</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Presentacion (opcional)</label>
                <select
                  value={editPresentacion}
                  onChange={e => setEditPresentacion(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin definir...</option>
                  {PRESENTACIONES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Unidad de medida (opcional)</label>
                <select
                  value={editUnidadMedidaId}
                  onChange={e => setEditUnidadMedidaId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin definir...</option>
                  {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Observacion (opcional)</label>
                <input
                  value={editObs}
                  onChange={e => setEditObs(e.target.value.toUpperCase())}
                  placeholder="En que estado vuelve..."
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setLineaEditando(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarEdicionDevolucion}
                disabled={guardandoEdicion}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {guardandoEdicion ? 'Guardando...' : 'Guardar correccion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Etiqueta fisica del codigo nuevo de una devolucion usada */}
      {lineaEtiquetaUsada && createPortal(
      <PreviewImpresion abierto onCerrar={() => setLineaEtiquetaUsada(null)}>
        {lineaEtiquetaUsada && (
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
                {lineaEtiquetaUsada.devuelto_unidad_medida_abreviatura || lineaEtiquetaUsada.unidad_medida_abreviatura || ''}
              </div>
              <div className="font-bold flex items-center justify-center px-4 min-w-[40px]" style={estiloCodigoImpreso(lineaEtiquetaUsada.almacen_nombre)}>
                {fmtCantidad(lineaEtiquetaUsada.devuelto_cantidad != null ? lineaEtiquetaUsada.devuelto_cantidad : lineaEtiquetaUsada.cantidad)}
              </div>
            </div>
            <div className="flex justify-center py-1.5 border-t border-gray-800">
              <CodigoBarras valor={lineaEtiquetaUsada.etiqueta_devuelta_codigo} height={28} />
            </div>
          </div>
        )}
      </PreviewImpresion>,
      document.body)}
    </div>
  )
}
