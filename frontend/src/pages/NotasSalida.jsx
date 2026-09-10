import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { MOTIVOS } from '../utils/motivos'
import { textoStock } from '../utils/stockResumen'
import { codigoAlmacen, numeroCodigo } from '../utils/colorAlmacen'

const colorEstado = {
  PENDIENTE:     'bg-orange-100 text-orange-700',
  DEVUELTO:      'bg-green-100 text-green-700',
  CERRADO:       'bg-gray-200 text-gray-600',
  EN_APROBACION: 'bg-yellow-100 text-yellow-700',
}

const FORM_VACIO = {
  seccion: '', persona_responsable: '', motivo: 'USO_INTERNO',
  requiere_devolucion: true, observaciones: '', lineas: [],
}

export default function NotasSalida() {
  const { usuario } = useAuth()
  const [notas, setNotas]         = useState([])
  const [cargando, setCargando]   = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje]     = useState(null)
  const [form, setForm]           = useState(FORM_VACIO)
  const [buscarCodigo, setBuscarCodigo] = useState('')
  const [buscando, setBuscando]   = useState(false)
  const [sugerencias, setSugerencias] = useState([])
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  // Fase 9: id de etiqueta que el backend rechazo por 409 (otro usuario la saco
  // mientras se armaba la nota). Marca esa linea en rojo.
  const [conflicto, setConflicto] = useState(null)
  // Contador para forzar un refetch de la lista de codigos disponibles aunque
  // el texto del buscador no cambie (p. ej. tras un 409).
  const [recargarSugerencias, setRecargarSugerencias] = useState(0)
  const [parametro, setParametro] = useState({ monto_minimo: '', activo: false })
  const [mostrarConfig, setMostrarConfig] = useState(false)
  const [guardandoConfig, setGuardandoConfig] = useState(false)

  const puedeRegistrar = ['admin', 'almacen', 'almacenero3'].includes(usuario?.rol)
  const esAdmin = usuario?.rol === 'admin'

  const cargarNotas = () => {
    api.get('/api/notas-salida')
      .then(res => { setNotas(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => {
    cargarNotas()
    if (esAdmin) {
      api.get('/api/parametros-aprobacion').then(res => setParametro({
        monto_minimo: res.data.monto_minimo ?? '',
        activo: !!res.data.activo,
      }))
    }
  }, [])

  const guardarConfig = async (e) => {
    e.preventDefault()
    setGuardandoConfig(true)
    try {
      await api.put('/api/parametros-aprobacion', parametro)
      setMensaje({ tipo: 'ok', texto: 'Umbral de aprobacion actualizado' })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar el umbral' })
    } finally {
      setGuardandoConfig(false)
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const abrirNuevo = () => {
    setForm(FORM_VACIO)
    setBuscarCodigo('')
    setSugerencias([])
    setMostrarSugerencias(false)
    setConflicto(null)
    setMostrarForm(true)
  }

  // Lista en vivo de todos los codigos disponibles en almacen (o filtrados por
  // lo que se va escribiendo), con producto, cantidad y stock del producto,
  // para elegir sin tener que saber el codigo exacto de memoria. El stock que
  // trae cada fila (Fase 9) tambien alimenta el hint de las lineas ya
  // agregadas, para que no queden con un numero viejo.
  useEffect(() => {
    if (!mostrarForm) return
    let cancelado = false
    setBuscando(true)
    const params = { estado: 'EN_ALMACEN' }
    // Acepta el codigo con o sin la letra del almacen (M9001 o 9001).
    if (numeroCodigo(buscarCodigo)) params.codigo = numeroCodigo(buscarCodigo)
    const t = setTimeout(() => {
      api.get('/api/etiquetas', { params })
        .then(({ data }) => { if (!cancelado) setSugerencias(data) })
        .finally(() => { if (!cancelado) setBuscando(false) })
    }, 200)
    return () => { cancelado = true; clearTimeout(t) }
  }, [buscarCodigo, mostrarForm, recargarSugerencias])

  const agregarEtiqueta = (encontrado) => {
    if (form.lineas.some(l => l.etiqueta_id === encontrado.id)) {
      setMensaje({ tipo: 'error', texto: 'Ese codigo ya esta agregado a la nota' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setForm(f => ({ ...f, lineas: [...f.lineas, { etiqueta_id: encontrado.id, etiqueta: encontrado, p_unitario: '', observaciones: '' }] }))
    setBuscarCodigo('')
    setMostrarSugerencias(false)
  }

  const buscarYAgregar = async () => {
    if (!buscarCodigo.trim()) return
    setBuscando(true)
    try {
      const numero = numeroCodigo(buscarCodigo)
      const { data } = await api.get('/api/etiquetas', { params: { codigo: numero, estado: 'EN_ALMACEN' } })
      const encontrado = data.find(e => String(e.codigo) === numero)
      if (!encontrado) {
        setMensaje({ tipo: 'error', texto: `No se encontro un codigo "${buscarCodigo.trim()}" disponible en almacen` })
        setTimeout(() => setMensaje(null), 3000)
        return
      }
      agregarEtiqueta(encontrado)
    } finally {
      setBuscando(false)
    }
  }

  const quitarLinea = (etiquetaId) => {
    setForm(f => ({ ...f, lineas: f.lineas.filter(l => l.etiqueta_id !== etiquetaId) }))
    if (conflicto === etiquetaId) setConflicto(null)
  }

  const actualizarLinea = (etiquetaId, campo, valor) => {
    setForm(f => ({
      ...f,
      lineas: f.lineas.map(l => l.etiqueta_id === etiquetaId ? { ...l, [campo]: valor } : l),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.lineas.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agrega al menos un codigo a la nota de salida' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setGuardando(true)
    try {
      const payload = {
        seccion: form.seccion,
        persona_responsable: form.persona_responsable,
        motivo: form.motivo,
        requiere_devolucion: form.requiere_devolucion,
        observaciones: form.observaciones,
        lineas: form.lineas.map(l => ({ etiqueta_id: l.etiqueta_id, p_unitario: l.p_unitario || null, observaciones: l.observaciones })),
      }
      await api.post('/api/notas-salida', payload)
      setMensaje({ tipo: 'ok', texto: 'Nota de salida generada correctamente' })
      setMostrarForm(false)
      setConflicto(null)
      cargarNotas()
    } catch (err) {
      // Fase 9: si otro usuario saco ese codigo primero, el backend responde
      // 409 con el codigo en conflicto -> se marca esa linea y se refresca la
      // lista de disponibles, en vez de solo un aviso generico.
      const data = err.response?.data
      if (err.response?.status === 409 && data?.etiqueta_id_conflicto) {
        setConflicto(data.etiqueta_id_conflicto)
        setRecargarSugerencias(n => n + 1)
        setMensaje({ tipo: 'error', texto: `${data.error}. Quita esa linea (marcada en rojo) y vuelve a intentar.` })
      } else {
        setMensaje({ tipo: 'error', texto: data?.error || 'Error al guardar la nota de salida' })
      }
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Notas de Salida</h1>
          <p className="text-gray-500 mt-1">Salida multiple de productos y control de devoluciones</p>
        </div>
        <div className="flex gap-2">
          {esAdmin && (
            <button
              onClick={() => setMostrarConfig(!mostrarConfig)}
              className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              {mostrarConfig ? 'Cerrar' : 'Configurar aprobacion'}
            </button>
          )}
          {puedeRegistrar && (
            <button
              onClick={() => mostrarForm ? setMostrarForm(false) : abrirNuevo()}
              className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
            >
              {mostrarForm ? 'Cancelar' : '+ Nueva Salida'}
            </button>
          )}
        </div>
      </div>

      {mostrarConfig && esAdmin && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-yellow-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-1">Aprobacion previa para salidas de alto valor</h2>
          <p className="text-sm text-gray-500 mb-4">Si el monto total de una nota de salida supera este umbral, quedara "En aprobacion" hasta que un supervisor la valide (CU-05).</p>
          <form onSubmit={guardarConfig} className="flex items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Monto minimo</label>
              <input
                type="number" min="0" step="0.01"
                value={parametro.monto_minimo}
                onChange={e => setParametro({ ...parametro, monto_minimo: e.target.value })}
                placeholder="Ej: 5000"
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 pb-2.5">
              <input
                type="checkbox"
                checked={parametro.activo}
                onChange={e => setParametro({ ...parametro, activo: e.target.checked })}
              />
              Activo
            </label>
            <button type="submit" disabled={guardandoConfig} className="px-6 py-2.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {guardandoConfig ? 'Guardando...' : 'Guardar'}
            </button>
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

      {mostrarForm && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Nueva Salida de Productos</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Seccion / destino</label>
                <input
                  value={form.seccion}
                  onChange={e => setForm({ ...form, seccion: e.target.value.toUpperCase() })}
                  placeholder="Ej: Produccion, Oficina..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Persona responsable</label>
                <input
                  required
                  value={form.persona_responsable}
                  onChange={e => setForm({ ...form, persona_responsable: e.target.value.toUpperCase() })}
                  placeholder="Quien retira los productos"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Motivo de salida</label>
                <select
                  value={form.motivo}
                  onChange={e => setForm({ ...form, motivo: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-2.5">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={form.requiere_devolucion}
                    onChange={e => setForm({ ...form, requiere_devolucion: e.target.checked })}
                  />
                  Requiere devolucion
                </label>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-600 mb-1">Observaciones</label>
                <input
                  value={form.observaciones}
                  onChange={e => setForm({ ...form, observaciones: e.target.value.toUpperCase() })}
                  placeholder="Notas adicionales..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-2">Buscar codigo de etiqueta</label>
              <div className="relative mb-3">
                <div className="relative z-20 flex gap-2">
                  <input
                    value={buscarCodigo}
                    onChange={e => setBuscarCodigo(e.target.value.toUpperCase())}
                    onFocus={() => setMostrarSugerencias(true)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarYAgregar() } }}
                    placeholder="Filtra por codigo (con o sin letra: M9001 o 9001), o dejalo vacio para ver todos..."
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={buscarYAgregar}
                    disabled={buscando}
                    className="px-4 py-2.5 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                  >
                    {buscando ? 'Buscando...' : 'Agregar'}
                  </button>
                </div>

                {mostrarSugerencias && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                    {(() => {
                      const disponibles = sugerencias.filter(e => !form.lineas.some(l => l.etiqueta_id === e.id))
                      if (buscando) {
                        return <div className="px-4 py-3 text-sm text-gray-400">Buscando...</div>
                      }
                      if (disponibles.length === 0) {
                        return <div className="px-4 py-3 text-sm text-gray-400">Sin codigos disponibles en almacen{buscarCodigo.trim() ? ' con ese filtro' : ''}</div>
                      }
                      return disponibles.map(e => (
                        <button
                          type="button"
                          key={e.id}
                          onClick={() => agregarEtiqueta(e)}
                          className="w-full grid grid-cols-12 gap-3 items-center px-4 py-2 text-left text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                        >
                          <span className="col-span-2 font-mono font-bold text-gray-800">{codigoAlmacen(e.codigo, e.almacen_nombre)}</span>
                          <span className="col-span-6 text-gray-700 truncate">
                            {e.producto_nombre}
                            {e.condicion === 'USADO' && <span className="ml-1 text-xs text-amber-600 font-medium">(usado)</span>}
                            <span className="block text-xs text-gray-400">
                              {textoStock(e.stock_agregado, e.codigos_disponibles, { abreviatura: e.unidad_medida_abreviatura })} en {e.almacen_nombre}
                            </span>
                          </span>
                          <span className="col-span-3 text-gray-500 text-right">
                            {e.cantidad} {e.unidad_medida_abreviatura || ''} <span className="text-gray-400">saliendo</span>
                          </span>
                          <span className="col-span-1 text-blue-700 text-right font-medium">+</span>
                        </button>
                      ))
                    })()}
                  </div>
                )}
                {mostrarSugerencias && (
                  <div className="fixed inset-0 z-0" onClick={() => setMostrarSugerencias(false)} />
                )}
              </div>

              {form.lineas.length > 0 && (
                <div className="space-y-2">
                  {form.lineas.map(l => (
                    <div
                      key={l.etiqueta_id}
                      className={`grid grid-cols-12 gap-3 items-center rounded-lg p-3 border ${
                        conflicto === l.etiqueta_id
                          ? 'bg-red-50 border-red-300'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="col-span-2 font-mono font-bold text-gray-800">{codigoAlmacen(l.etiqueta.codigo, l.etiqueta.almacen_nombre)}</div>
                      <div className="col-span-4 text-sm text-gray-700">
                        {l.etiqueta.producto_nombre}
                        {conflicto === l.etiqueta_id ? (
                          <span className="block text-xs text-red-600 font-medium">Ya no esta disponible en almacen — quitala</span>
                        ) : (() => {
                          // Toma el stock del ultimo fetch si el codigo sigue en
                          // la lista; si no, cae al valor con que se agrego.
                          const fresco = sugerencias.find(s => s.id === l.etiqueta_id) || l.etiqueta
                          return (
                            <span className="block text-xs text-gray-400">
                              {textoStock(fresco.stock_agregado, fresco.codigos_disponibles, { abreviatura: fresco.unidad_medida_abreviatura })} en {fresco.almacen_nombre}
                            </span>
                          )
                        })()}
                      </div>
                      <div className="col-span-2 text-sm text-gray-500">
                        {l.etiqueta.cantidad} {l.etiqueta.unidad_medida_abreviatura || ''}
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number" min="0" step="0.01"
                          value={l.p_unitario}
                          onChange={e => actualizarLinea(l.etiqueta_id, 'p_unitario', e.target.value)}
                          placeholder="P. unitario"
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2 text-right">
                        <button type="button" onClick={() => quitarLinea(l.etiqueta_id)} className="text-red-500 hover:text-red-700 text-sm">
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Generar Nota de Salida'}
              </button>
            </div>
          </form>
        </div>
      )}

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando notas de salida...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">N° Nota</th>
                <th className="px-6 py-3 text-left">Seccion</th>
                <th className="px-6 py-3 text-left">Responsable</th>
                <th className="px-6 py-3 text-left">Motivo</th>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-right">Lineas</th>
                <th className="px-6 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n, i) => (
                <tr key={n.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-3 font-mono font-semibold text-gray-800">{n.numero_nota}</td>
                  <td className="px-6 py-3 text-gray-700">{n.seccion || '—'}</td>
                  <td className="px-6 py-3 text-gray-700">{n.persona_responsable}</td>
                  <td className="px-6 py-3 text-gray-500">{n.motivo}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{new Date(n.fecha).toLocaleDateString('es-GT')}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEstado[n.estado]}`}>{n.estado}</span>
                  </td>
                  <td className="px-6 py-3 text-right">{n.total_lineas}</td>
                  <td className="px-6 py-3 text-right">
                    <Link to={`/notas-salida/${n.id}`} className="text-sm border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {notas.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay notas de salida registradas todavia</p>
          )}
        </div>
      )}
    </div>
  )
}
