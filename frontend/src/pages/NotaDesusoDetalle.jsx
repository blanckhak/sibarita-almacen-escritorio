import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { paginarPorItem, ALTO_RENGLON_FIJO } from '../utils/renglonesFijos'
import PreviewImpresion from '../components/PreviewImpresion'
import { fmtCantidad } from '../utils/fmt'

const colorEstado = {
  VIGENTE: 'bg-green-100 text-green-700',
  ANULADA: 'bg-gray-200 text-gray-600',
}

// El talonario fisico (para giarse/desuso.png) trae 8 filas por hoja.
const FILAS_POR_PAGINA = 8

export default function NotaDesusoDetalle() {
  const { id } = useParams()
  const { usuario } = useAuth()
  const [nota, setNota]           = useState(null)
  const [cargando, setCargando]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje]     = useState(null)
  const [preview, setPreview]     = useState(false)

  const [editando, setEditando]           = useState(false)
  const [edPersona, setEdPersona]         = useState('')
  const [edSeccion, setEdSeccion]         = useState('')
  const [edRef, setEdRef]                 = useState('')
  const [edObs, setEdObs]                 = useState('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)

  const [anulando, setAnulando]           = useState(false)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')

  const periodoCerrado = nota?.periodo_estado === 'CERRADO'
  const puedeGestionar = ['admin', 'almacen', 'almacenero3'].includes(usuario?.rol) && !periodoCerrado

  const cargar = () => {
    api.get(`/api/notas-desuso/${id}`)
      .then(res => { setNota(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [id])

  const abrirEdicion = () => {
    setEdPersona(nota.persona_responsable || '')
    setEdSeccion(nota.seccion || '')
    setEdRef(nota.nota_salida_ref || '')
    setEdObs(nota.observaciones || '')
    setEditando(true)
  }

  const guardarEdicion = async () => {
    if (!edPersona.trim()) return
    setGuardandoEdicion(true)
    try {
      await api.put(`/api/notas-desuso/${id}`, {
        persona_responsable: edPersona.trim(),
        seccion: edSeccion.trim(),
        nota_salida_ref: edRef.trim(),
        observaciones: edObs.trim(),
      })
      setMensaje({ tipo: 'ok', texto: 'Nota de desuso actualizada' })
      setEditando(false)
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al actualizar la nota' })
    } finally {
      setGuardandoEdicion(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  const anular = async () => {
    if (!motivoAnulacion.trim()) {
      setMensaje({ tipo: 'error', texto: 'El motivo de anulacion es requerido' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setGuardando(true)
    try {
      await api.post(`/api/notas-desuso/${id}/anular`, { motivo: motivoAnulacion.trim() })
      setMensaje({ tipo: 'ok', texto: 'Nota de desuso anulada' })
      setAnulando(false)
      setMotivoAnulacion('')
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al anular la nota' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  if (cargando) return <div className="p-6 text-center py-12 text-gray-400">Cargando nota de desuso...</div>
  if (!nota) return <div className="p-6 text-center py-12 text-gray-400">Nota de desuso no encontrada</div>

  const [yy, mm, dd] = String(nota.fecha).slice(0, 10).split('-')

  return (
    <div className="p-6">
      <div className="print:hidden">
        <Link to="/notas-desuso" className="text-sm text-blue-700 hover:underline">&larr; Volver a notas de desuso</Link>

        <div className="flex items-center justify-between mt-2 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Nota de Desuso N.° {nota.numero_nota}</h1>
            <p className="text-gray-500 mt-1">
              {nota.persona_responsable} · {nota.seccion || 'Sin seccion'} · {nota.almacen_nombre} · {new Date(nota.fecha).toLocaleDateString('es-GT')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${colorEstado[nota.estado]}`}>{nota.estado}</span>
            {puedeGestionar && nota.estado === 'VIGENTE' && (
              <>
                <button onClick={abrirEdicion} className="border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg font-medium transition">
                  Editar
                </button>
                <button onClick={() => setAnulando(true)} className="border border-red-300 text-red-700 hover:bg-red-50 text-sm px-4 py-2 rounded-lg font-medium transition">
                  Anular
                </button>
              </>
            )}
            <button onClick={() => setPreview(true)} className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition">
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

        {periodoCerrado && (
          <div className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-3 mb-4 text-sm text-gray-700">
            <b>Periodo cerrado.</b> Esta nota pertenece al periodo <b>{nota.periodo_nombre}</b>, que ya esta cerrado:
            queda de solo lectura. Un admin puede reabrir el periodo.
          </div>
        )}

        {nota.estado === 'ANULADA' && (
          <div className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-3 mb-4 text-sm text-gray-700">
            <b>Nota anulada.</b> Motivo: {nota.motivo_anulacion} — {nota.anulado_por_nombre} el {new Date(nota.anulado_en).toLocaleDateString('es-GT')}
          </div>
        )}

        {editando && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Editar encabezado</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Seccion</label>
                <input value={edSeccion} onChange={e => setEdSeccion(e.target.value.toUpperCase())}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Persona responsable</label>
                <input required value={edPersona} onChange={e => setEdPersona(e.target.value.toUpperCase())}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Nota de Salida de Activo (ref.)</label>
                <input value={edRef} onChange={e => setEdRef(e.target.value.toUpperCase())}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Observaciones</label>
                <input value={edObs} onChange={e => setEdObs(e.target.value.toUpperCase())}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditando(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarEdicion} disabled={guardandoEdicion} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                {guardandoEdicion ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}

        {anulando && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-red-100">
            <h2 className="text-lg font-semibold text-gray-700 mb-1">Anular nota de desuso</h2>
            <p className="text-sm text-gray-500 mb-4">Esta accion no se puede deshacer.</p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-600 mb-1">Motivo</label>
                <input value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value.toUpperCase())}
                  placeholder="Por que se anula esta nota..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={() => setAnulando(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={anular} disabled={guardando} className="px-6 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {guardando ? 'Anulando...' : 'Confirmar anulacion'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">Descripcion</th>
                <th className="px-6 py-3 text-right">Cantidad</th>
                <th className="px-6 py-3 text-left">Unidad</th>
                <th className="px-6 py-3 text-left">Area / Maquina</th>
              </tr>
            </thead>
            <tbody>
              {nota.detalle.map((d, i) => (
                <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 text-gray-700">{d.descripcion}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{fmtCantidad(d.cantidad)}</td>
                  <td className="px-6 py-3 text-gray-500">{d.unidad_medida_abreviatura || d.unidad_medida_nombre || '—'}</td>
                  <td className="px-6 py-3 text-gray-500">{d.area_maquina || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PreviewImpresion abierto={preview} onCerrar={() => setPreview(false)}>
        <div className={preview ? '' : 'hidden print:block'}>
          {/* renglonesFijos.js espera `producto_nombre` (forma de Guia/Nota de
              Salida) -- se alias aca nomas para reusar el mismo partidor de
              texto, sin tocar el util compartido. */}
          {paginarPorItem(nota.detalle.map(d => ({ ...d, producto_nombre: d.descripcion })), FILAS_POR_PAGINA).map((filas, pi, todas) => (
            <div key={pi} className="border-2 border-gray-800 rounded break-after-page last:break-after-auto">
              <div className="flex items-start justify-between px-4 pt-3">
                <div>
                  <div className="font-bold text-lg text-gray-800 text-center">MANUFACTURA DE ALIMENTOS S.A.</div>
                  <div className="font-semibold text-sm text-gray-700 uppercase tracking-wide text-center">Nota de Ingreso de Activos - Desuso</div>
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
                <div className="flex"><b className="text-gray-600 w-56 shrink-0">SECCION:</b><span className="border-b border-gray-400 flex-1">{nota.seccion || ''}</span></div>
                <div className="flex"><b className="text-gray-600 w-56 shrink-0">PERSONA RESPONSABLE:</b><span className="border-b border-gray-400 flex-1">{nota.persona_responsable}</span></div>
                <div className="flex"><b className="text-gray-600 w-56 shrink-0">NOTA DE SALIDA DE ACTIVO:</b><span className="border-b border-gray-400 flex-1">{nota.nota_salida_ref || ''}</span></div>
              </div>

              <table className="w-full text-xs table-fixed" style={{ width: 'calc(100% - 2rem)', margin: '0 auto' }}>
                <thead>
                  <tr className="bg-gray-100 border-y-2 border-gray-800">
                    <th className="text-center py-1">DESCRIPCION</th>
                    <th className="text-center py-1 border-l border-gray-800 w-20">CANTIDAD</th>
                    <th className="text-center py-1 border-l border-gray-800 w-20">UNIDAD</th>
                    <th className="text-center py-1 border-l border-gray-800 w-32">AREA - MAQUINA</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Talonario preimpreso: la fila NO crece. Una descripcion larga
                      se parte en varios renglones (paginarPorItem) -- cantidad/
                      unidad/area van solo en el primero, los siguientes son
                      renglones "esContinuacion" con las celdas de al lado en
                      blanco, para no correr el rayado ya impreso en el papel. */}
                  {filas.map((r, ri) => (
                    <tr key={ri} className="border-b border-gray-400" style={{ height: ALTO_RENGLON_FIJO }}>
                      <td className="py-1 px-1 align-top overflow-hidden" style={{ height: ALTO_RENGLON_FIJO, maxHeight: ALTO_RENGLON_FIJO }}>{r ? r.textoLinea : ''}</td>
                      <td className="py-1 text-center border-l border-gray-400 align-top">{r && !r.esContinuacion ? fmtCantidad(r.cantidad) : ''}</td>
                      <td className="py-1 text-center border-l border-gray-400 align-top">{r && !r.esContinuacion ? (r.unidad_medida_abreviatura || r.unidad_medida_nombre || '') : ''}</td>
                      <td className="py-1 px-1 border-l border-gray-400 align-top">{r && !r.esContinuacion ? (r.area_maquina || '') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

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
            </div>
          ))}
        </div>
      </PreviewImpresion>
    </div>
  )
}
