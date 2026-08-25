import { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const datos = localStorage.getItem('usuario')
    if (token && datos) {
      setUsuario(JSON.parse(datos))
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
    setCargando(false)
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    const { token, usuario } = res.data
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(usuario))
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUsuario(usuario)
    return usuario
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    delete api.defaults.headers.common['Authorization']
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, cargando }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
