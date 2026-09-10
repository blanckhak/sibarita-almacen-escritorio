import { useEffect, useState } from 'react'
import api from '../utils/api'
import { DOCUMENTOS_IMPRESION } from '../utils/parametrosImpresion'

// Fase 13 (R1): pantalla de admin para configurar que se muestra en cada
// documento impreso (Nota de Ingreso / Salida / Devolucion) y cuantas lineas
// por hoja.

const TOGGLES = [
  { campo: 'mostrar_precio',        label: 'Columnas P. UNIT. y TOTAL' },
  { campo: 'mostrar_ubicacion',    label: 'Ubicacion del codigo' },
  { campo: 'mostrar_motivo',       label: 'Motivo / Maquina' },
  { campo: 'mostrar_observaciones', label: 'Observaciones (de la guia y por linea)' },
  { campo: 'mostrar_partidas',     label: 'Desglose de partidas' },
]

export default function Configuracion() {
  const [params, setParams]   = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(null)
  const [mensaje, setMensaje]   = useState(null)

  const cargar = () => {
    api.get('/api/parametros-impresion')
      .then(res => { setParams(res.data); setCargando(false) })
      .catch(() => setCargando(false))
  }
  useEffect(() => { cargar() }, [])

  const set = (documento, campo, valor) => {
    setParams(list => list.map(p => p.documento === documento ? { ...p, [campo]: valor } : p))
  }

  const guardar = async (documento) => {
    const fila = params.find(p => p.documento === documento)
    if (!fila) return
    setGuardando(documento)
    try {
      await api.put(`/api/parametros-impresion/${documento}`, {
        mostrar_precio: fila.mostrar_precio,
        mostrar_ubicacion: fila.mostrar_ubicacion,
        mostrar_motivo: fila.mostrar_motivo,
        mostrar_observaciones: fila.mostrar_observaciones,
        mostrar_partidas: fila.mostrar_partidas,
        lineas_por_pagina: Number(fila.lineas_por_pagina),
        pie_texto: fila.pie_texto || '',
      })
      setMensaje({ tipo: 'ok', texto: `Parametros de ${documento} guardados` })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudo guardar' })
    } finally {
      setGuardando(null)
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  if (cargando) return <div className="p-6 text-center py-12 text-gray-400">Cargando...</div>

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-800 mb-1">Configuracion de impresion</h1>
      <p className="text-gray-500 mb-6">Que mostrar en cada documento impreso y cuantas lineas por hoja.</p>

      {mensaje && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>{mensaje.texto}</div>
      )}

      <div className="space-y-6">
        {DOCUMENTOS_IMPRESION.map(doc => {
          const fila = params.find(p => p.documento === doc.value)
          if (!fila) return null
          return (
            <div key={doc.value} className="bg-white rounded-xl shadow p-5 border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">{doc.label}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {TOGGLES.map(t => (
                  <label key={t.campo} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!fila[t.campo]}
                      onChange={e => set(doc.value, t.campo, e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Lineas por hoja (4 a 12)</label>
                  <input
                    type="number" min="4" max="12"
                    value={fila.lineas_por_pagina}
                    onChange={e => set(doc.value, 'lineas_por_pagina', e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Pie de pagina (opcional)</label>
                  <input
                    value={fila.pie_texto || ''}
                    onChange={e => set(doc.value, 'pie_texto', e.target.value)}
                    maxLength={300}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => guardar(doc.value)}
                  disabled={guardando === doc.value}
                  className="px-5 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {guardando === doc.value ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
