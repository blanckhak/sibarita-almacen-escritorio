import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import CampoPassword from '../components/CampoPassword'

// Cambiar la propia contrasena. Si el usuario tiene el cambio pendiente
// (cuenta nueva, contrasena reseteada por el admin, o el admin inicial en
// produccion), App lo trae aca y no lo deja ir a otra pagina hasta cambiarla.
export default function CambiarPassword() {
  const { usuario, cambiarPassword, logout } = useAuth()
  const navigate = useNavigate()
  const [actual, setActual]       = useState('')
  const [nueva, setNueva]         = useState('')
  const [repetir, setRepetir]     = useState('')
  const [error, setError]         = useState('')
  const [ok, setOk]               = useState(false)
  const [guardando, setGuardando] = useState(false)
  const obligatorio = usuario?.debe_cambiar

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (nueva !== repetir) return setError('La contrasena nueva y su repeticion no coinciden')
    setGuardando(true)
    try {
      await cambiarPassword(actual, nueva)
      setOk(true)
      setActual(''); setNueva(''); setRepetir('')
      if (obligatorio) navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la contrasena')
    } finally {
      setGuardando(false)
    }
  }

  const campo = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-800">Cambiar contrasena</h1>
      {obligatorio ? (
        <p className="mt-2 mb-6 text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          Antes de continuar tiene que elegir una contrasena nueva, que solo usted conozca.
        </p>
      ) : (
        <p className="text-gray-500 mt-1 mb-6 text-sm">{usuario?.email}</p>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contrasena actual</label>
          <CampoPassword required value={actual} onChange={e => setActual(e.target.value)} className={campo} autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contrasena nueva (minimo 6 caracteres)</label>
          <CampoPassword required minLength={6} value={nueva} onChange={e => setNueva(e.target.value)} className={campo} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Repetir contrasena nueva</label>
          <CampoPassword required minLength={6} value={repetir} onChange={e => setRepetir(e.target.value)} className={campo} />
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>}
        {ok && !obligatorio && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">Contrasena cambiada.</div>}

        <div className="flex justify-between items-center pt-2">
          {obligatorio ? (
            <button type="button" onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">Salir</button>
          ) : <span />}
          <button type="submit" disabled={guardando}
            className="px-6 py-2.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Cambiar contrasena'}
          </button>
        </div>
      </form>
    </div>
  )
}
