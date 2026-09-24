import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { usePeriodo } from '../context/PeriodoContext'
import PeriodoFiltro from '../components/PeriodoFiltro'
import { puedeVerPeriodos } from '../utils/permisos'

const colorEstado = {
  VIGENTE: 'bg-green-100 text-green-700',
  ANULADA: 'bg-gray-200 text-gray-600',
}

const LINEA_VACIA = { descripcion: '', cantidad: '', unidad_medida_id: '', area_maquina: '' }
const FORM_VACIO = {
  seccion: '', persona_responsable: '', nota_salida_ref: '', observaciones: '',
  lineas: [{ ...LINEA_VACIA }],
}

export default function NotasDesuso() {
  const { usuario } = useAuth()
  const { almacenes, almacenSel, periodoSel } = usePeriodo()
  const [notas, setNotas]         = useState([])
  const [cargando, setCargando]   = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje]     = useState(null)
  const [form, setForm]           = useState(FORM_VACIO)
  const [unidades, setUnidades]   = useState([])

  const puedeRegistrar = ['admin', 'almacen', 'almacenero'].includes(usuario?.rol)

  const cargarNotas = () => {
    api.get('/api/notas-desuso', { params: periodoSel ? { periodo_id: periodoSel } : {} })
      .then(res => { setNotas(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }

  useEffect(() => { cargarNotas() }, [periodoSel])
  useEffect(() => { api.get('/api/unidades-medida').then(res => setUnidades(res.data)).catch(() => {}) }, [])

  const abrirNuevo = () => {
    setForm(FORM_VACIO)
    setMostrarForm(true)
  }

  const agregarLinea = () => setForm(f => ({ ...f, lineas: [...f.lineas, { ...LINEA_VACIA }] }))
  const quitarLinea = (i) => setForm(f => ({ ...f, lineas: f.lineas.filter((_, idx) => idx !== i) }))
  const actualizarLinea = (i, campo, valor) => setForm(f => ({
    ...f,
    lineas: f.lineas.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l),
  }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const lineasValidas = form.lineas.filter(l => l.descripcion.trim())
    if (lineasValidas.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agrega al menos una linea con descripcion' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setGuardando(true)
    try {
      const payload = {
        seccion: form.seccion,
        persona_responsable: form.persona_responsable,
        nota_salida_ref: form.nota_salida_ref,
        almacen_id: almacenSel,
        observaciones: form.observaciones,
        lineas: lineasValidas.map(l => ({
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          unidad_medida_id: l.unidad_medida_id || null,
          area_maquina: l.area_maquina,
        })),
      }
      await api.post('/api/notas-desuso', payload)
      setMensaje({ tipo: 'ok', texto: 'Nota de desuso generada correctamente' })
      setMostrarForm(false)
      cargarNotas()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar la nota de desuso' })
    } finally {
      setGuardando(false)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Notas de Desuso</h1>
          <p className="text-gray-500 mt-1">Ingreso de activos usados que vuelven de un area</p>
        </div>
        {puedeRegistrar && (
          <button
            onClick={() => mostrarForm ? setMostrarForm(false) : abrirNuevo()}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            {mostrarForm ? 'Cancelar' : '+ Nueva Nota de Desuso'}
          </button>
        )}
      </div>

      {/* Filtro de periodo: solo admin y almacen (ver utils/permisos.js). */}
      {puedeVerPeriodos(usuario) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-6">
          <PeriodoFiltro />
          <p className="text-xs text-gray-400 mt-1.5">La lista de abajo muestra las notas de este periodo. El alta nueva entra en el almacen elegido arriba.</p>
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
          <h2 className="text-lg font-semibold text-gray-700 mb-1">Nueva Nota de Desuso</h2>
          <p className="text-sm text-gray-500 mb-4">
            Almacen: <b>{almacenes.find(a => String(a.id) === String(almacenSel))?.nombre || '—'}</b> {puedeVerPeriodos(usuario) && '(cambialo arriba en "Periodo" si no es el correcto)'}
          </p>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Seccion</label>
                <input
                  value={form.seccion}
                  onChange={e => setForm({ ...form, seccion: e.target.value.toUpperCase() })}
                  placeholder="Ej: Produccion, Mantenimiento..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Persona responsable</label>
                <input
                  required
                  value={form.persona_responsable}
                  onChange={e => setForm({ ...form, persona_responsable: e.target.value.toUpperCase() })}
                  placeholder="Quien entrega el material usado"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Nota de Salida de Activo (ref., opcional)</label>
                <input
                  value={form.nota_salida_ref}
                  onChange={e => setForm({ ...form, nota_salida_ref: e.target.value.toUpperCase() })}
                  placeholder="N° de la nota de salida, si corresponde"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
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
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-600">Detalle</label>
                <button type="button" onClick={agregarLinea} className="text-sm text-blue-700 hover:text-blue-800 font-medium">+ Agregar linea</button>
              </div>
              <div className="space-y-2">
                {form.lineas.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <input
                      value={l.descripcion}
                      onChange={e => actualizarLinea(i, 'descripcion', e.target.value.toUpperCase())}
                      placeholder="Descripcion"
                      className="col-span-4 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number" min="0" step="0.001"
                      value={l.cantidad}
                      onChange={e => actualizarLinea(i, 'cantidad', e.target.value)}
                      placeholder="Cantidad"
                      className="col-span-2 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={l.unidad_medida_id}
                      onChange={e => actualizarLinea(i, 'unidad_medida_id', e.target.value)}
                      className="col-span-2 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Unidad</option>
                      {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</option>)}
                    </select>
                    <input
                      value={l.area_maquina}
                      onChange={e => actualizarLinea(i, 'area_maquina', e.target.value.toUpperCase())}
                      placeholder="Area / Maquina"
                      className="col-span-3 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="col-span-1 text-right">
                      {form.lineas.length > 1 && (
                        <button type="button" onClick={() => quitarLinea(i)} className="text-red-500 hover:text-red-700 text-sm">Quitar</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-6 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Generar Nota de Desuso'}
              </button>
            </div>
          </form>
        </div>
      )}

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando notas de desuso...</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-3 text-left">N° Nota</th>
                <th className="px-6 py-3 text-left">Seccion</th>
                <th className="px-6 py-3 text-left">Responsable</th>
                <th className="px-6 py-3 text-left">Almacen</th>
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
                  <td className="px-6 py-3 text-gray-500">{n.almacen_nombre}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{new Date(n.fecha).toLocaleDateString('es-GT')}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorEstado[n.estado]}`}>{n.estado}</span>
                  </td>
                  <td className="px-6 py-3 text-right">{n.total_lineas}</td>
                  <td className="px-6 py-3 text-right">
                    <Link to={`/notas-desuso/${n.id}`} className="text-sm border border-blue-200 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {notas.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay notas de desuso registradas todavia</p>
          )}
        </div>
      )}
    </div>
  )
}
