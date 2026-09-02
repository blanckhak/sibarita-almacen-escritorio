import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login({ onLogin }) {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [cargando, setCargando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      const usuario = await login(email, password)
      onLogin(usuario)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesion')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-blue-800 tracking-wide">MALSA</h1>
          <p className="text-gray-400 text-sm mt-1">Sistema de Gestion de Almacenes</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo electronico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@sibarita.com"
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contrasena
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
          >
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        {/* Usuarios de prueba */}
        <div className="mt-8 border-t pt-5">
          <p className="text-xs text-gray-400 text-center mb-3 font-medium uppercase tracking-wide">
            Usuarios de prueba
          </p>
          <div className="space-y-2 text-xs">
            {[
              { rol: 'Admin',         email: 'admin@sibarita.com',         pass: 'admin123',    color: 'bg-purple-100 text-purple-700' },
              { rol: 'Almacen',       email: 'almacen@sibarita.com',       pass: 'almac123',    color: 'bg-blue-100 text-blue-700' },
              { rol: 'Almacenero 1',  email: 'almacenero1@sibarita.com',   pass: 'almacenero1', color: 'bg-sky-100 text-sky-700' },
              { rol: 'Almacenero 2',  email: 'almacenero2@sibarita.com',   pass: 'almacenero2', color: 'bg-teal-100 text-teal-700' },
              { rol: 'Mantenimiento', email: 'mantenimiento@sibarita.com', pass: 'mant123',     color: 'bg-green-100 text-green-700' },
              { rol: 'Compras',       email: 'compras@sibarita.com',       pass: 'compras123',  color: 'bg-yellow-100 text-yellow-700' },
            ].map(u => (
              <button
                key={u.rol}
                type="button"
                onClick={() => { setEmail(u.email); setPassword(u.pass) }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:opacity-80 transition cursor-pointer border border-gray-100"
              >
                <span className={`px-2 py-0.5 rounded font-semibold ${u.color}`}>{u.rol}</span>
                <span className="text-gray-400">{u.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
