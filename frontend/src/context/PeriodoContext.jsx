import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from './AuthContext'

// Fase 14 (R7-a): periodo seleccionado para VER (por almacen). El periodo
// activo de cada almacen es el default. Las pantallas de listado filtran por
// periodoSel; el alta siempre entra en el periodo activo (lo decide el backend).
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

  // Default de almacen: el del usuario, si no el primero con periodos.
  useEffect(() => {
    if (almacenSel || periodos.length === 0) return
    const delUsuario = periodos.find(p => usuario?.almacen && p.almacen_nombre === usuario.almacen)
    setAlmacenSel(String((delUsuario || periodos[0]).almacen_id))
  }, [periodos, usuario, almacenSel])

  const periodosDelAlmacen = useMemo(
    () => periodos.filter(p => String(p.almacen_id) === String(almacenSel)),
    [periodos, almacenSel]
  )

  // Default de periodo: el ACTIVO del almacen elegido.
  useEffect(() => {
    if (!almacenSel) return
    const enLista = periodosDelAlmacen.some(p => String(p.id) === String(periodoSel))
    if (enLista) return
    const activo = periodosDelAlmacen.find(p => p.estado === 'ACTIVO')
    setPeriodoSel(activo ? String(activo.id) : (periodosDelAlmacen[0] ? String(periodosDelAlmacen[0].id) : ''))
  }, [almacenSel, periodosDelAlmacen, periodoSel])

  const periodoActual = periodos.find(p => String(p.id) === String(periodoSel)) || null

  const value = {
    periodos, almacenes, periodosDelAlmacen,
    almacenSel, setAlmacenSel,
    periodoSel, setPeriodoSel,
    periodoActual,
    recargarPeriodos,
  }
  return <PeriodoContext.Provider value={value}>{children}</PeriodoContext.Provider>
}

export function usePeriodo() {
  const ctx = useContext(PeriodoContext)
  if (!ctx) throw new Error('usePeriodo fuera de PeriodoProvider')
  return ctx
}
