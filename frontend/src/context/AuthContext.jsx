import { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

// La sesion va en sessionStorage (no localStorage): se borra al cerrar el
// programa o la pestana, y al volver a abrir pide el login.
export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    // Sesiones de versiones anteriores, que quedaban guardadas para siempre.
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')

    const token = sessionStorage.getItem('token')
    const datos = sessionStorage.getItem('usuario')
    if (token && datos) {
      setUsuario(JSON.parse(datos))
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
    setCargando(false)
  }, [])

  const guardarSesion = ({ token, usuario }) => {
    sessionStorage.setItem('token', token)
    sessionStorage.setItem('usuario', JSON.stringify(usuario))
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUsuario(usuario)
    return usuario
  }

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    return guardarSesion(res.data)
  }

  const cambiarPassword = async (actual, nueva) => {
    const res = await api.put('/api/auth/password', { actual, nueva })
    return guardarSesion(res.data)
  }

  const logout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('usuario')
    delete api.defaults.headers.common['Authorization']
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, cambiarPassword, cargando }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
