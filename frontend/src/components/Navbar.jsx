import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Notificaciones from './Notificaciones'

const colorRol = {
  admin:         'bg-purple-600',
  almacen:       'bg-blue-600',
  mantenimiento: 'bg-green-600',
  compras:       'bg-yellow-500',
}

export default function Navbar() {
  const { usuario, logout } = useAuth()
  const location = useLocation()

  const activo = (path) =>
    location.pathname === path
      ? 'text-white border-b-2 border-white pb-0.5'
      : 'text-blue-200 hover:text-white transition'

  const enlaces = [
    { path: '/',            label: 'Dashboard',   roles: null },
    { path: '/almacenes',   label: 'Almacenes',   roles: null },
    { path: '/inventario',  label: 'Inventario',  roles: ['admin','almacen','mantenimiento','compras'] },
    { path: '/productos',   label: 'Catalogo',    roles: ['admin','almacen','mantenimiento','compras'] },
    { path: '/guias',       label: 'Guias',       roles: ['admin','almacen','mantenimiento','compras'] },
    { path: '/notas-salida', label: 'Notas de Salida', roles: ['admin','almacen','mantenimiento','compras'] },
    { path: '/solicitudes-materiales', label: 'Solicitud Materiales', roles: ['admin','almacen','mantenimiento','compras'] },
    { path: '/compras-diarias', label: 'Compras Diarias', roles: ['admin','compras'] },
    { path: '/consulta-productos', label: 'Consulta', roles: ['admin','almacen','mantenimiento','compras'] },
    { path: '/movimientos', label: 'Movimientos', roles: ['admin','almacen'] },
    { path: '/reportes',    label: 'Reportes',    roles: ['admin','almacen','compras'] },
    { path: '/historial',   label: 'Historial',   roles: ['admin','almacen','compras'] },
    { path: '/usuarios',    label: 'Usuarios',    roles: ['admin'] },
    { path: '/posibles-duplicados', label: 'Duplicados', roles: ['admin'] },
  ]

  const enlacesFiltrados = enlaces.filter(e =>
    !e.roles || e.roles.includes(usuario?.rol)
  )

  return (
    <nav className="print:hidden bg-blue-900 text-white px-6 py-0 flex items-center justify-between shadow-lg h-14">
      <div className="flex items-center gap-6 h-full">
        <span className="text-xl font-black tracking-wide">MALSA</span>
        <div className="flex items-center gap-5 h-full text-sm">
          {enlacesFiltrados.map(e => (
            <Link key={e.path} to={e.path} className={`h-full flex items-center ${activo(e.path)}`}>
              {e.label}
            </Link>
          ))}
        </div>
      </div>

      {usuario && (
        <div className="flex items-center gap-3">
          <Notificaciones />
          <div className="text-right hidden md:block">
            <p className="text-sm font-semibold leading-tight">{usuario.nombre}</p>
            <p className="text-xs text-blue-300 leading-tight">{usuario.almacen || 'Global'}</p>
          </div>
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
