import axios from 'axios'

// baseURL vacio = mismo origen que sirvio la pagina. Asi funciona tanto en la
// app de escritorio (http://localhost:3000) como cuando otras PCs entran por la
// red a http://<IP-del-servidor>:3000 sin quedar clavado a "localhost".
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
