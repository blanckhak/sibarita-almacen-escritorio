import axios from 'axios'

// baseURL vacio = mismo origen que sirvio la pagina. Asi funciona tanto en la
// app de escritorio (http://localhost:3000) como cuando otras PCs entran por la
// red a http://<IP-del-servidor>:3000 sin quedar clavado a "localhost".
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Sesion vencida, usuario desactivado o contrasena cambiada en otro lado ->
// volver al login en vez de dejar la pantalla llena de errores. El login
// mismo (credenciales incorrectas) no cuenta.
api.interceptors.response.use(
  res => res,
  err => {
    const url = err.config?.url || ''
    if (err.response?.status === 401 && !url.includes('/api/auth/login') && sessionStorage.getItem('token')) {
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('usuario')
      window.location.assign('/login')
    }
    return Promise.reject(err)
  }
)

export default api
