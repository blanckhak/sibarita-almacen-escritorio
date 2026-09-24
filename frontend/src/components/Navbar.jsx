import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Notificaciones from './Notificaciones'
import { ROLES_PERIODOS } from '../utils/permisos'

const colorRol = {
  admin:         'bg-purple-600',
  almacen:       'bg-blue-600',
  almacenero:    'bg-blue-500',
  mantenimiento: 'bg-green-600',
  compras:       'bg-yellow-500',
}

// Enlaces principales (siempre visibles) y secundarios (menu "Mas").
const ENLACES_PRIMARIOS = [
  { path: '/',              label: 'Dashboard',       roles: null },
  { path: '/inventario',    label: 'Inventario',      roles: ['admin','almacen','almacenero','mantenimiento','compras'] },
  { path: '/guias',         label: 'Guias',           roles: ['admin','almacen','almacenero','mantenimiento','compras'] },
  { path: '/notas-salida',  label: 'Notas de Salida', roles: ['admin','almacen','almacenero','mantenimiento','compras'] },
  { path: '/periodos',      label: 'Periodos',        roles: ROLES_PERIODOS },
]
const ENLACES_SECUNDARIOS = [
  { path: '/almacenes',            label: 'Almacenes',           roles: null },
  { path: '/productos',            label: 'Catalogo',            roles: ['admin','almacen','almacenero','mantenimiento','compras'] },
  { path: '/solicitudes-materiales', label: 'Solicitud Materiales', roles: ['admin','almacen','almacenero','mantenimiento','compras'] },
  { path: '/notas-desuso',         label: 'Notas de Desuso',     roles: ['admin','almacen','almacenero','mantenimiento','compras'] },
  { path: '/consulta-productos',   label: 'Consulta',            roles: ['admin','almacen','almacenero','mantenimiento','compras'] },
  { path: '/movimientos',          label: 'Movimientos',         roles: ['admin','almacen','almacenero'] },
  { path: '/reportes',             label: 'Reportes',            roles: ['admin','almacen','almacenero','compras'] },
  { path: '/historial',            label: 'Historial',           roles: ['admin','almacen','almacenero','compras'] },
  { path: '/usuarios',             label: 'Usuarios',            roles: ['admin'] },
  { path: '/posibles-duplicados',  label: 'Duplicados',          roles: ['admin'] },
  { path: '/configuracion',        label: 'Configuracion',       roles: ['admin'] },
]

export default function Navbar() {
  const { usuario, logout } = useAuth()
  const location = useLocation()
  const [masAbierto, setMasAbierto] = useState(false)
  const masRef = useRef(null)

  useEffect(() => {
    const cerrar = (e) => { if (masRef.current && !masRef.current.contains(e.target)) setMasAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])
  useEffect(() => { setMasAbierto(false) }, [location.pathname])

  const puedeVer = (e) => !e.roles || e.roles.includes(usuario?.rol)
  const primarios = ENLACES_PRIMARIOS.filter(puedeVer)
  const secundarios = ENLACES_SECUNDARIOS.filter(puedeVer)

  const activo = (path) =>
    location.pathname === path
      ? 'text-white border-b-2 border-white pb-0.5'
      : 'text-blue-200 hover:text-white transition'

  return (
    <nav className="print:hidden bg-blue-900 text-white px-5 py-0 flex items-center justify-between shadow-lg h-14">
      <div className="flex items-center gap-5 h-full">
        <span className="text-xl font-black tracking-wide">SIBARITA</span>
        <div className="flex items-center gap-4 h-full text-sm">
          {primarios.map(e => (
            <Link key={e.path} to={e.path} className={`h-full flex items-center ${activo(e.path)}`}>
              {e.label}
            </Link>
          ))}
          {secundarios.length > 0 && (
            <div className="relative h-full flex items-center" ref={masRef}>
              <button
                type="button"
                onClick={() => setMasAbierto(v => !v)}
                className={`h-full flex items-center gap-1 ${
                  secundarios.some(e => e.path === location.pathname) ? 'text-white' : 'text-blue-200 hover:text-white transition'
                }`}
              >
                Mas <span className="text-[10px]">{masAbierto ? '▲' : '▼'}</span>
              </button>
              {masAbierto && (
                <div className="absolute top-full left-0 mt-0 bg-white text-gray-800 rounded-b-lg shadow-xl py-1 min-w-[190px] z-50">
                  {secundarios.map(e => (
                    <Link
                      key={e.path}
                      to={e.path}
                      className={`block px-4 py-2 text-sm hover:bg-gray-100 ${
                        location.pathname === e.path ? 'font-semibold text-blue-700' : ''
                      }`}
                    >
                      {e.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {usuario && (
        <div className="flex items-center gap-3">
          <Notificaciones />
          <Link to="/cambiar-password" title="Cambiar mi contrasena" className="text-right hidden md:block hover:opacity-80">
            <p className="text-sm font-semibold leading-tight">{usuario.nombre}</p>
            <p className="text-xs text-blue-300 leading-tight">{usuario.almacen || 'Global'}</p>
          </Link>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${colorRol[usuario.rol] || 'bg-gray-600'}`}>
            {usuario.rol.toUpperCase()}
          </span>
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg transition"
          >
            Salir
          </button>
        </div>
      )}
    </nav>
  )
}
