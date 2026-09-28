import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from './AuthContext'

// Fase 14 (R7-a): periodo seleccionado para VER. Por defecto se ven los 3
// almacenes juntos en su periodo activo. Las pantallas de listado filtran con
// paramsPeriodo; el alta siempre entra en el periodo activo (lo decide el backend).
const PeriodoContext = createContext(null)

export function PeriodoProvider({ children }) {
  const { usuario } = useAuth()
  const [periodos, setPeriodos]     = useState([])
  const [almacenes, setAlmacenes]   = useState([])
  const [almacenSel, setAlmacenSel] = useState('')
  const [periodoSel, setPeriodoSel] = useState('')

  const recargarPeriodos = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([api.get('/api/periodos'), api.get('/api/almacenes')])
      setPeriodos(p.data)
      setAlmacenes(a.data)
      return p.data
    } catch {
      return []
    }
  }, [])

  useEffect(() => { if (usuario) recargarPeriodos() }, [usuario, recargarPeriodos])

  // almacenSel '' = los 3 almacenes (default): un periodo se ve en todos los
  // almacenes a la vez. Las opciones son los nombres de periodo ("Periodo 5")
  // y cada una junta los ids de ese periodo en cada almacen. Con un almacen
  // elegido, las opciones son sus periodos, como antes.
  // Cada opcion: { value, nombre, activo, ids }.
  const periodosDelAlmacen = useMemo(() => {
    if (almacenSel) {
      return periodos
        .filter(p => String(p.almacen_id) === String(almacenSel))
        .map(p => ({ value: String(p.id), nombre: p.nombre, activo: p.estado === 'ACTIVO', ids: [p.id] }))
    }
    const porNombre = new Map()
    for (const p of periodos) { // vienen ordenados por fecha_inicio DESC dentro de cada almacen
      const o = porNombre.get(p.nombre) || { value: `n:${p.nombre}`, nombre: p.nombre, activo: false, ids: [], inicio: p.fecha_inicio }
      o.ids.push(p.id)
      if (p.estado === 'ACTIVO') o.activo = true
      if (p.fecha_inicio > o.inicio) o.inicio = p.fecha_inicio
      porNombre.set(p.nombre, o)
    }
    return [...porNombre.values()].sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))
  }, [periodos, almacenSel])

  // Default de periodo: el ACTIVO (con los 3 almacenes, el nombre activo mas nuevo).
  useEffect(() => {
    const enLista = periodosDelAlmacen.some(o => o.value === periodoSel)
    if (enLista) return
    const activo = periodosDelAlmacen.find(o => o.activo)
    setPeriodoSel(activo ? activo.value : (periodosDelAlmacen[0]?.value || ''))
  }, [periodosDelAlmacen, periodoSel])

  // Parametro para los listados: ?periodo_id=5 o ?periodo_id=5,10,15.
  const opcionSel = periodosDelAlmacen.find(o => o.value === periodoSel) || null
  const paramsPeriodo = opcionSel ? { periodo_id: opcionSel.ids.join(',') } : {}

  const value = {
    periodos, almacenes, periodosDelAlmacen,
    almacenSel, setAlmacenSel,
    periodoSel, setPeriodoSel,
    paramsPeriodo,
    recargarPeriodos,
  }
  return <PeriodoContext.Provider value={value}>{children}</PeriodoContext.Provider>
}

export function usePeriodo() {
  const ctx = useContext(PeriodoContext)
  if (!ctx) throw new Error('usePeriodo fuera de PeriodoProvider')
  return ctx
}
