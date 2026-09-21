import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { CATEGORIAS_MATERIALES } from '../utils/categoriasMateriales'
import { enPaginas } from '../utils/paginarImpresion'
import PreviewImpresion from '../components/PreviewImpresion'

const colorEstado = {
  PENDIENTE: 'bg-orange-100 text-orange-700',
  ATENDIDA:  'bg-green-100 text-green-700',
  RECHAZADA: 'bg-red-100 text-red-700',
}

// Misma idea que en SolicitudesMateriales.jsx (alta): `otro` = el material
// no esta en el catalogo y se escribe a mano.
const LINEA_VACIA = () => ({ producto: '', cantidad: '', otro: false })

export default function SolicitudMaterialesDetalle() {
  const { id } = useParams()
  const { usuario } = useAuth()
  const [solicitud, setSolicitud] = useState(null)
  const [cargando, setCargando]   = useState(true)
  const [mensaje, setMensaje]     = useState(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [preview, setPreview] = useState(false)
  const [productos, setProductos] = useState([])
  const [editando, setEditando] = useState(false)
  const [formEdit, setFormEdit] = useState(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)

  const puedeGestionar = ['admin', 'almacen', 'almacenero3'].includes(usuario?.rol)
  // Editar es cosa del que la pide (mismos roles que pueden dar de alta), y
  // solo tiene sentido mientras nadie la atendio ni la rechazo todavia.
  const puedeEditar = ['admin', 'mantenimiento'].includes(usuario?.rol) && solicitud?.estado === 'PENDIENTE'

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

  const abrirEdicion = async () => {
    setMensaje(null)
    let catalogo = productos
    if (catalogo.length === 0) {
      try {
        const res = await api.get('/api/productos')
        catalogo = res.data
        setProductos(catalogo)
      } catch (err) {
        setMensaje({ tipo: 'error', texto: 'No se pudo cargar el catalogo de productos' })
        setTimeout(() => setMensaje(null), 4000)
        return
      }
    }
    setFormEdit({
      seccion: solicitud.seccion || '',
      persona_responsable: solicitud.persona_responsable || '',
      categoria: solicitud.categoria,
      categoria_detalle: solicitud.categoria_detalle || '',
      periodo: solicitud.periodo ? String(solicitud.periodo).slice(0, 10) : '',
      observaciones: solicitud.observaciones || '',
      lineas: solicitud.detalle.map(d => ({
        producto: d.producto,
        cantidad: String(d.cantidad),
        otro: !catalogo.some(p => p.nombre === d.producto),
      })),
    })
    setEditando(true)
  }

  const seleccionarMaterialEdit = (i, valor) => {
    setFormEdit(f => {
      const lineas = [...f.lineas]
      if (valor === '__otro__') lineas[i] = { ...lineas[i], otro: true, producto: '' }
      else lineas[i] = { ...lineas[i], otro: false, producto: valor }
      return { ...f, lineas }
    })
  }

  const actualizarLineaEdit = (i, campo, valor) => {
    setFormEdit(f => {
      const lineas = [...f.lineas]
      lineas[i] = { ...lineas[i], [campo]: valor }
      return { ...f, lineas }
    })
  }

  const agregarLineaEdit = () => setFormEdit(f => ({ ...f, lineas: [...f.lineas, LINEA_VACIA()] }))
  const quitarLineaEdit = (i) => setFormEdit(f => ({ ...f, lineas: f.lineas.filter((_, idx) => idx !== i) }))

  const guardarEdicion = async (e) => {
    e.preventDefault()
    setGuardandoEdicion(true)
    try {
      await api.put(`/api/solicitudes-materiales/${id}`, formEdit)
      setMensaje({ tipo: 'ok', texto: 'Solicitud actualizada correctamente' })
      setEditando(false)
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar los cambios' })
    } finally {
      setGuardandoEdicion(false)
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
            {puedeEditar && !editando && (
              <button
                onClick={abrirEdicion}
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

        {editando ? (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Editar Solicitud N.° {solicitud.numero_solicitud}</h2>
            <form onSubmit={guardarEdicion}>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Seccion</label>
                  <input
                    value={formEdit.seccion}
                    onChange={e => setFormEdit({ ...formEdit, seccion: e.target.value })}
                    placeholder="Ej: Mantenimiento, Produccion..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Persona responsable</label>
                  <input
                    required
                    value={formEdit.persona_responsable}
                    onChange={e => setFormEdit({ ...formEdit, persona_responsable: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Periodo</label>
                  <input
                    type="date"
                    value={formEdit.periodo}
                    onChange={e => setFormEdit({ ...formEdit, periodo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className={formEdit.categoria === 'OTROS' ? '' : 'col-span-2'}>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Categoria</label>
                  <select
                    value={formEdit.categoria}
                    onChange={e => setFormEdit({ ...formEdit, categoria: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIAS_MATERIALES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                {formEdit.categoria === 'OTROS' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Especificar</label>
                    <input
                      required
                      value={formEdit.categoria_detalle}
                      onChange={e => setFormEdit({ ...formEdit, categoria_detalle: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Observaciones</label>
                  <input
                    value={formEdit.observaciones}
                    onChange={e => setFormEdit({ ...formEdit, observaciones: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {formEdit.lineas.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 items-end bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="col-span-8">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
                      <select
                        required
                        value={l.otro ? '__otro__' : l.producto}
                        onChange={e => seleccionarMaterialEdit(i, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Seleccionar del catalogo...</option>
                        {productos.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                        <option value="__otro__">+ Escribir otro material</option>
                      </select>
                      {l.otro && (
                        <input
                          required
                          value={l.producto}
                          onChange={e => actualizarLineaEdit(i, 'producto', e.target.value)}
                          placeholder="Nombre del material (no catalogado)..."
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad</label>
                      <input
                        required
                        type="number" min="0.01" step="0.01"
                        value={l.cantidad}
                        onChange={e => actualizarLineaEdit(i, 'cantidad', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-2 flex justify-center">
                      {formEdit.lineas.length > 1 && (
                        <button type="button" onClick={() => quitarLineaEdit(i)} className="text-red-500 hover:text-red-700 text-sm">
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={agregarLineaEdit}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50"
                >
                  + Agregar producto
                </button>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setEditando(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                  <button type="submit" disabled={guardandoEdicion} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                    {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : (
        <>
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
        </>
        )}
      </div>

      {/* Vista de impresion: replica el formato fisico "Solicitud de Materiales"
          (reverso del talonario FT-GE-17). 6 productos por hoja. */}
      <PreviewImpresion abierto={preview} onCerrar={() => setPreview(false)}>
      <div className={preview ? '' : 'hidden print:block'}>
        {enPaginas(solicitud.detalle).map((filas, pi, todas) => {
          const [yy, mm, dd] = String(solicitud.fecha).slice(0, 10).split('-')
          const per = solicitud.periodo ? String(solicitud.periodo).slice(0, 10).split('-') : null
          return (
            <div key={pi} className="border-2 border-gray-800 rounded break-after-page last:break-after-auto">
              <div className="flex items-start justify-between px-4 pt-3">
                <div>
                  <div className="font-bold text-lg text-gray-800 text-center">MANUFACTURA DE ALIMENTOS S.A.</div>
                  <div className="font-semibold text-sm text-gray-700 uppercase tracking-wide text-center">Solicitud de Materiales</div>
                </div>
                <div className="text-xs text-right space-y-0.5">
                  <div><b>FECHA :</b> {dd || ''}/{mm || ''}/{(yy || '').slice(2)}</div>
                  <div><b>PERIODO :</b> {per ? `${per[2]}/${per[1]}/${per[0].slice(2)}` : ''}</div>
                  <div className="text-red-600 font-bold text-sm">
                    N.° {solicitud.numero_solicitud}
                    {todas.length > 1 && <span className="text-gray-500 font-normal text-xs ml-1">Hoja {pi + 1}/{todas.length}</span>}
                  </div>
                </div>
              </div>

              <div className="px-4 py-2 text-xs">
                <b className="uppercase mr-2">Marcar con una X</b>
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

              <table className="w-full text-xs table-fixed border border-gray-800" style={{ width: 'calc(100% - 2rem)', margin: '0 auto' }}>
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-gray-800">
                    <th className="text-center py-1 tracking-wider">P R O D U C T O</th>
                    <th className="text-center py-1 border-l border-gray-800 w-24">CANTIDAD</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((d, ri) => (
                    <tr key={ri} className="border-b border-gray-400 h-8">
                      <td className="py-1 px-2 align-top">{d ? d.producto : ''}</td>
                      <td className="py-1 text-center border-l border-gray-400 align-top">{d ? Number(d.cantidad) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Observaciones y firmas van en CADA hoja (no solo la ultima): cada
                  hoja fisica se imprime y se firma por separado. */}
              <div className="px-4 py-2 text-xs flex">
                <b className="mr-1">OBSERVACIONES</b>
                <span className="border-b border-gray-400 flex-1">{solicitud.observaciones || ''}</span>
              </div>
              <div className="px-4 pt-8 pb-2 text-xs">
                <div className="flex gap-6 mb-2">
                  <span className="flex-1 flex"><b className="mr-1">Solicitado por:</b><span className="border-b border-gray-400 flex-1">&nbsp;</span></span>
                  <span className="flex-1 flex"><b className="mr-1">V°B° Autorizado por:</b><span className="border-b border-gray-400 flex-1">&nbsp;</span></span>
                </div>
                <div className="flex"><b className="w-16 shrink-0">Nombre</b>: <span className="border-b border-gray-400 flex-1 ml-1">{solicitud.persona_responsable}</span></div>
                <div className="flex"><b className="w-16 shrink-0">Cargo</b>: <span className="border-b border-gray-400 flex-1 ml-1">&nbsp;</span></div>
                <div className="flex mt-1"><b className="w-16 shrink-0">Firma:</b><span className="border-b border-gray-400 flex-1 ml-1">&nbsp;</span></div>
              </div>
              <div className="px-4 py-1 text-[11px] italic text-gray-600">
                Nota.- Cuando no hay stock se envia una copia al area de Compras.
              </div>
              <div className="flex justify-between items-end px-4 pb-2 pt-1 text-[10px] text-gray-500 border-t border-gray-300">
                <span>FT-GE-17 ED. - 01</span>
                <span className="text-right">c.c. Almacen Materia Prima, Almacen {solicitud.almacen_nombre}<br />c.c. Compras</span>
              </div>
            </div>
          )
        })}
      </div>
      </PreviewImpresion>
    </div>
  )
}
