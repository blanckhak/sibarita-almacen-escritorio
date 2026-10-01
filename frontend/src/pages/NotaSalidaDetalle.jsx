import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { colorEtiquetaEstado, labelEtiquetaEstado } from '../utils/etiquetaEstados'
import { textoStock } from '../utils/stockResumen'
import { paginarPorItem, ALTO_RENGLON_FIJO } from '../utils/renglonesFijos'
import { cargarParamsImpresion, PARAMS_IMPRESION_DEFAULT } from '../utils/parametrosImpresion'
import { claseCodigoAlmacen, estiloCodigoImpreso, codigoAlmacen } from '../utils/colorAlmacen'
import { presentacionLabel } from '../utils/presentaciones'
import PreviewImpresion from '../components/PreviewImpresion'
import { fmtCantidad } from '../utils/fmt'

const colorEstado = {
  PENDIENTE:     'bg-orange-100 text-orange-700',
  DEVUELTO:      'bg-green-100 text-green-700',
  CERRADO:       'bg-gray-200 text-gray-600',
  EN_APROBACION: 'bg-yellow-100 text-yellow-700',
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
  // Previsualizacion: el documento se muestra en pantalla dentro de un overlay
  // con boton Imprimir antes de mandar a la impresora.
  const [preview, setPreview] = useState(false)
  // Edicion del encabezado de la nota (persona responsable / seccion / obs).
  // Sobre todo para las notas automaticas de guias a Oficina/Laboratorio.
  const [editandoEncabezado, setEditandoEncabezado] = useState(false)
  const [edPersona, setEdPersona] = useState('')
  const [edSeccion, setEdSeccion] = useState('')
  const [edObs, setEdObs]         = useState('')
  const [guardandoEncabezado, setGuardandoEncabezado] = useState(false)

  // Fase 15 (R7-b): una nota de un periodo CERRADO queda de solo lectura.
  const periodoCerrado = nota?.periodo_estado === 'CERRADO'
  const puedeGestionar = ['admin', 'almacen', 'almacenero'].includes(usuario?.rol) && !periodoCerrado
  const puedeAprobar    = ['admin', 'almacen', 'almacenero'].includes(usuario?.rol) && !periodoCerrado

  const cargar = () => {
    api.get(`/api/notas-salida/${id}`)
      .then(res => { setNota(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [id])
  // Fase 13 (R1): que mostrar en las notas de Salida / Devolucion impresas.
  const [paramsImp, setParamsImp] = useState(null)
  useEffect(() => { cargarParamsImpresion().then(setParamsImp) }, [])

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

  const abrirEdicionEncabezado = () => {
    setEdPersona(nota.persona_responsable || '')
    setEdSeccion(nota.seccion || '')
    setEdObs(nota.observaciones || '')
    setEditandoEncabezado(true)
  }

  const guardarEncabezado = async () => {
    if (!edPersona.trim()) return
    setGuardandoEncabezado(true)
    try {
      await api.put(`/api/notas-salida/${id}`, {
        persona_responsable: edPersona.trim(),
        seccion: edSeccion.trim(),
        observaciones: edObs.trim(),
      })
      setMensaje({ tipo: 'ok', texto: 'Nota de salida actualizada' })
      setEditandoEncabezado(false)
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al actualizar la nota' })
    } finally {
      setGuardandoEncabezado(false)
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
            {puedeGestionar && nota.estado !== 'EN_APROBACION' && (
              <button
                onClick={abrirEdicionEncabezado}
                className="border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg font-medium transition"
              >
                Editar
              </button>
            )}
            <button
              onClick={() => setPreview(true)}
              className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
            >
              Imprimir
            </button>
            {/* La devolucion se registra en la pantalla Notas de Devolucion. */}
            {puedeGestionar && nota.estado === 'PENDIENTE' && (
              <Link
                to={`/notas-desuso?salida=${nota.id}`}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
              >
                Registrar devolucion
              </Link>
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

        {periodoCerrado && (
          <div className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-3 mb-4 text-sm text-gray-700">
            <b>Periodo cerrado.</b> Esta nota pertenece al periodo <b>{nota.periodo_nombre}</b>, que ya esta cerrado:
            queda de solo lectura (no se puede editar ni registrar devoluciones). Un admin puede reabrir el periodo.
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
                    onChange={e => setMotivoRechazo(e.target.value.toUpperCase())}
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
                <th className="px-6 py-3 text-left">Codigo</th>
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-left">Almacen</th>
                <th className="px-6 py-3 text-right">Cantidad</th>
                <th className="px-6 py-3 text-left">Stock actual</th>
                <th className="px-6 py-3 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {nota.detalle.map((d, i) => (
                <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-mono font-semibold text-gray-800">
                    <Link to={`/etiquetas/${d.etiqueta_id}`} className={`hover:underline px-1.5 rounded ${claseCodigoAlmacen(d.almacen_nombre)}`}>{codigoAlmacen(d.etiqueta_codigo, d.almacen_nombre)}</Link>
                    {d.etiqueta_devuelta_codigo && (
                      <div className="text-xs text-amber-700 font-normal mt-0.5 flex items-center gap-2">
                        <span>&rarr; cod. {codigoAlmacen(d.etiqueta_devuelta_codigo, d.almacen_nombre)} (usado)</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-700">{d.producto_nombre}</td>
                  <td className="px-6 py-3 text-gray-500">{d.almacen_nombre}</td>
                  <td className="px-6 py-3 text-right">{fmtCantidad(d.cantidad)}</td>
                  <td className="px-6 py-3 text-gray-500 text-xs">
                    {textoStock(d.stock_agregado_actual, d.codigos_disponibles_actual)}
                  </td>
                  <td className="px-6 py-3">
                    {(() => {
                      // Linea que salio y no volvio: se muestra SALIDA aunque el
                      // codigo siga EN_ALMACEN con el resto (salida parcial).
                      const afuera = d.etiqueta_id && !d.devuelto_condicion && nota.fecha_salida
                      const estado = afuera ? 'SALIO' : d.etiqueta_estado
                      return (
                        <>
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEtiquetaEstado(estado)}`}>{labelEtiquetaEstado(estado)}</span>
                          {afuera && d.stock_codigo > 0 && (
                            <span className="block text-xs text-gray-500 mt-1">quedan {fmtCantidad(d.stock_codigo)} en almacen</span>
                          )}
                        </>
                      )
                    })()}
                    {d.devuelto_condicion && (
                      <div className={`text-xs mt-1 font-medium ${d.devuelto_condicion === 'USADO' ? 'text-amber-700' : 'text-green-700'}`}>
                        Devuelta {d.devuelto_condicion === 'USADO' ? 'usada' : 'nueva'}
                        {d.devuelto_condicion === 'USADO' && (d.devuelto_cantidad != null || d.devuelto_presentacion || d.devuelto_unidad_medida_nombre) && (
                          <span className="block font-normal text-gray-500">
                            {d.devuelto_cantidad != null && `volvieron ${fmtCantidad(d.devuelto_cantidad)} de ${fmtCantidad(d.cantidad)}`}
                            {d.devuelto_presentacion && `${d.devuelto_cantidad != null ? ' · ' : ''}${presentacionLabel(d.devuelto_presentacion)}`}
                            {d.devuelto_unidad_medida_nombre && `${(d.devuelto_cantidad != null || d.devuelto_presentacion) ? ' · ' : ''}${d.devuelto_unidad_medida_nombre}`}
                          </span>
                        )}
                        {d.devuelto_obs && <span className="block font-normal text-gray-400 italic">{d.devuelto_obs}</span>}
                        {d.cantidad_consumida != null && Number(d.cantidad_consumida) > 0 && (
                          <span className="block font-normal text-gray-600">
                            consumido {fmtCantidad(d.cantidad_consumida)}
                          </span>
                        )}
                        {d.nota_devolucion_id && (
                          <Link to={`/notas-desuso/${d.nota_devolucion_id}`} className="block font-normal text-blue-600 hover:underline">
                            Nota de Devolucion N.° {d.nota_devolucion_numero}
                          </Link>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notas de Devolucion generadas al registrar lo que volvio
            (pantalla Notas de Devolucion). */}
        {nota.notas_devolucion?.length > 0 && (
          <div className="bg-white rounded-xl shadow p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Notas de Devolucion</h2>
            <div className="flex flex-wrap gap-2">
              {nota.notas_devolucion.map(nd => (
                <Link
                  key={nd.id}
                  to={`/notas-desuso/${nd.id}`}
                  className="text-sm border border-emerald-200 text-emerald-800 rounded-lg px-3 py-1.5 hover:bg-emerald-50 transition"
                >
                  N.° {nd.numero_nota} · {new Date(nd.fecha).toLocaleDateString('es-GT')} · {nd.total_lineas} linea(s)
                  {nd.estado === 'ANULADA' && <span className="ml-1 text-gray-500">(anulada)</span>}
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>

      {editandoEncabezado && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden"
          onClick={() => setEditandoEncabezado(false)}
        >
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Editar nota de salida</h2>
            <p className="text-sm text-gray-500 mb-4">
              Nota N.° {nota.numero_nota}. Corrige quien retira, la seccion (Compras Diarias / Servicios) o la observacion. No cambia los productos ni el inventario.
            </p>
            <label className="block text-sm font-medium text-gray-600 mb-1">Persona responsable (quien retira)</label>
            <input
              autoFocus
              value={edPersona}
              onChange={e => setEdPersona(e.target.value.toUpperCase())}
              maxLength={150}
              placeholder="Nombre de quien retira"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            />
            <label className="block text-sm font-medium text-gray-600 mb-1">Seccion (opcional)</label>
            <input
              value={edSeccion}
              onChange={e => setEdSeccion(e.target.value.toUpperCase())}
              maxLength={100}
              placeholder="Compras Diarias / Servicios..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            />
            <label className="block text-sm font-medium text-gray-600 mb-1">Observacion (opcional)</label>
            <input
              value={edObs}
              onChange={e => setEdObs(e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditandoEncabezado(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarEncabezado}
                disabled={guardandoEncabezado || !edPersona.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {guardandoEncabezado ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PreviewImpresion abierto={preview} onCerrar={() => setPreview(false)}>
      {(() => {
        const pS = paramsImp?.SALIDA || PARAMS_IMPRESION_DEFAULT
        return (
        <div className={preview ? '' : 'hidden print:block'}>
          {paginarPorItem(nota.detalle, pS.lineas_por_pagina).map((filas, pi, todas) => {
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
                      {pS.mostrar_precio && <>
                        <th className="text-center py-1 border-l border-gray-800 w-16">P. UNIT.</th>
                        <th className="text-center py-1 border-l border-gray-800 w-20">TOTAL</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Talonario preimpreso: la fila NO crece. Un nombre largo se
                        parte en varios renglones (paginarPorItem) -- codigo/
                        cantidad van solo en el primero, los siguientes son
                        renglones "esContinuacion" con las celdas de al lado en
                        blanco, para no correr el rayado ya impreso en el papel. */}
                    {filas.map((r, ri) => (
                      <tr key={ri} className="border-b border-gray-400" style={{ height: ALTO_RENGLON_FIJO }}>
                        <td className="py-1 px-1 align-top overflow-hidden" style={{ height: ALTO_RENGLON_FIJO, maxHeight: ALTO_RENGLON_FIJO }}>
                          {r && (
                            <>
                              {!r.esContinuacion && r.etiqueta_codigo && <span className="font-mono font-bold px-1 mr-1 rounded" style={estiloCodigoImpreso(r.almacen_nombre)}>{codigoAlmacen(r.etiqueta_codigo, r.almacen_nombre)}</span>}
                              <span>{r.textoLinea}</span>
                              {!r.esContinuacion && r.devuelto_condicion === 'USADO' && <span className="text-[10px] text-gray-500"> (devuelto usado)</span>}
                            </>
                          )}
                        </td>
                        <td className="py-1 text-center border-l border-gray-400 align-top">
                          {r && !r.esContinuacion
                            ? `${fmtCantidad(r.cantidad)}${!pS.mostrar_precio && r.unidad_medida_abreviatura ? ` ${r.unidad_medida_abreviatura}` : ''}`
                            : ''}
                        </td>
                        {/* Igual que la Nota de Ingreso (pedido del usuario 24/09):
                            no se imprime ningun precio; la columna preimpresa
                            "P. UNIT." lleva la UNIDAD y TOTAL queda en blanco. */}
                        {pS.mostrar_precio && <>
                          <td className="py-1 text-center border-l border-gray-400 align-top">{r && !r.esContinuacion ? (r.unidad_medida_abreviatura || '') : ''}</td>
                          <td className="py-1 border-l border-gray-400 align-top">&nbsp;</td>
                        </>}
                      </tr>
                    ))}
                    {ultima && (
                      <tr className="border-y-2 border-gray-800 h-7 font-semibold">
                        <td className="py-1 text-right pr-2">TOTAL</td>
                        <td className="border-l border-gray-800">&nbsp;</td>
                        {pS.mostrar_precio && <>
                          <td className="border-l border-gray-800">&nbsp;</td>
                          <td className="border-l border-gray-800">&nbsp;</td>
                        </>}
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Observaciones y firmas van en CADA hoja (no solo la ultima): cada
                    hoja fisica se imprime y se firma por separado. */}
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
                {pS.pie_texto && (
                  <div className="px-4 pb-1 text-[10px] text-gray-500">{pS.pie_texto}</div>
                )}
                <div className="flex justify-between items-end px-4 pb-2 pt-1 text-[10px] text-gray-500 border-t border-gray-300">
                  <span>FT-GE-17 ED. - 01</span>
                  <span className="text-right">c.c. Almacen Materia Prima, Almacen {nota.detalle[0]?.almacen_nombre || '—'}<br />c.c. Compras</span>
                </div>
              </div>
            )
          })}
        </div>
        )
      })()}

      </PreviewImpresion>
    </div>
  )
}
