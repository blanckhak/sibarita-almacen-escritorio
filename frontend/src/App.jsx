import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Login from './pages/Login'

// Carga diferida: cada pagina (y sus librerias pesadas, ej. recharts en
// Dashboard o jspdf/html2canvas en Reportes) solo se descarga cuando se
// visita, en vez de venir todas juntas en el bundle inicial.
const Dashboard          = lazy(() => import('./pages/Dashboard'))
const Inventario         = lazy(() => import('./pages/Inventario'))
const Productos          = lazy(() => import('./pages/Productos'))
const Guias              = lazy(() => import('./pages/Guias'))
const GuiaDetalle        = lazy(() => import('./pages/GuiaDetalle'))
const NotasSalida        = lazy(() => import('./pages/NotasSalida'))
const NotaSalidaDetalle  = lazy(() => import('./pages/NotaSalidaDetalle'))
const SolicitudesMateriales = lazy(() => import('./pages/SolicitudesMateriales'))
const SolicitudMaterialesDetalle = lazy(() => import('./pages/SolicitudMaterialesDetalle'))
const ComprasDiarias     = lazy(() => import('./pages/ComprasDiarias'))
const CompraDiariaDetalle = lazy(() => import('./pages/CompraDiariaDetalle'))
const ConsultaProductos  = lazy(() => import('./pages/ConsultaProductos'))
const EtiquetaDetalle    = lazy(() => import('./pages/EtiquetaDetalle'))
const Usuarios           = lazy(() => import('./pages/Usuarios'))
const PosiblesDuplicados = lazy(() => import('./pages/PosiblesDuplicados'))
const Movimientos        = lazy(() => import('./pages/Movimientos'))
const Almacenes          = lazy(() => import('./pages/Almacenes'))
const Reportes           = lazy(() => import('./pages/Reportes'))
const Historial          = lazy(() => import('./pages/Historial'))
const Configuracion      = lazy(() => import('./pages/Configuracion'))

function CargandoPagina() {
  return <div className="p-6 text-center py-12 text-gray-400">Cargando...</div>
}

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-7xl mx-auto">{children}</main>
    </div>
  )
}

function RutaProtegida({ children, roles }) {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" />
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/" />
  return <Layout>{children}</Layout>
}

function AppContent() {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center">
        <p className="text-white text-xl font-semibold">Cargando...</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<CargandoPagina />}>
      <Routes>
        <Route path="/login" element={usuario ? <Navigate to="/" /> : <Login onLogin={() => {}} />} />

        <Route path="/" element={
          <RutaProtegida>
            <Dashboard />
          </RutaProtegida>
        } />

        <Route path="/almacenes" element={
          <RutaProtegida>
            <Almacenes />
          </RutaProtegida>
        } />

        <Route path="/inventario" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <Inventario />
          </RutaProtegida>
        } />

        <Route path="/productos" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <Productos />
          </RutaProtegida>
        } />

        <Route path="/guias" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <Guias />
          </RutaProtegida>
        } />

        <Route path="/guias/:id" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <GuiaDetalle />
          </RutaProtegida>
        } />

        <Route path="/consulta-productos" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <ConsultaProductos />
          </RutaProtegida>
        } />

        <Route path="/etiquetas/:id" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <EtiquetaDetalle />
          </RutaProtegida>
        } />

        <Route path="/notas-salida" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <NotasSalida />
          </RutaProtegida>
        } />

        <Route path="/notas-salida/:id" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <NotaSalidaDetalle />
          </RutaProtegida>
        } />

        <Route path="/solicitudes-materiales" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <SolicitudesMateriales />
          </RutaProtegida>
        } />

        <Route path="/solicitudes-materiales/:id" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'mantenimiento', 'compras']}>
            <SolicitudMaterialesDetalle />
          </RutaProtegida>
        } />

        <Route path="/compras-diarias" element={
          <RutaProtegida roles={['admin', 'compras']}>
            <ComprasDiarias />
          </RutaProtegida>
        } />

        <Route path="/compras-diarias/:id" element={
          <RutaProtegida roles={['admin', 'compras']}>
            <CompraDiariaDetalle />
          </RutaProtegida>
        } />

        <Route path="/movimientos" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3']}>
            <Movimientos />
          </RutaProtegida>
        } />

        <Route path="/reportes" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'compras']}>
            <Reportes />
          </RutaProtegida>
        } />

        <Route path="/historial" element={
          <RutaProtegida roles={['admin', 'almacen', 'almacenero3', 'compras']}>
            <Historial />
          </RutaProtegida>
        } />

        <Route path="/usuarios" element={
          <RutaProtegida roles={['admin']}>
            <Usuarios />
          </RutaProtegida>
        } />

        <Route path="/posibles-duplicados" element={
          <RutaProtegida roles={['admin']}>
            <PosiblesDuplicados />
          </RutaProtegida>
        } />

        <Route path="/configuracion" element={
          <RutaProtegida roles={['admin']}>
            <Configuracion />
          </RutaProtegida>
        } />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
