// Modo del sistema:
//   desarrollo -> como siempre: cuentas de prueba creadas solas y listadas en
//                 el login para entrar rapido.
//   produccion -> sin cuentas de prueba: no se crean, no se muestran y, si
//                 existen con su contrasena conocida, no pueden entrar (el
//                 admin si, pero tiene que cambiarla al ingresar).
//
// Por defecto: el codigo fuente (npm start / node server.js) es desarrollo y
// el instalado (backend dentro de app.asar) es produccion. SIBARITA_MODO lo
// fuerza: la app lo pasa desde la pantalla de conexion (Ctrl+Shift+S) y el
// servicio de la PC servidor lo fija en produccion (instalar_servicio.ps1).
const forzado = String(process.env.SIBARITA_MODO || '').toLowerCase()
const MODO = ['desarrollo', 'produccion'].includes(forzado)
  ? forzado
  : (__dirname.includes('app.asar') ? 'produccion' : 'desarrollo')

// Cuentas de prueba con su contrasena conocida (las crea setup.js en
// desarrollo; el login de desarrollo las lista).
const CUENTAS_DEMO = {
  'admin@sibarita.com':         'admin123',
  'almacen@sibarita.com':       'almac123',
  'mantenimiento@sibarita.com': 'mant123',
  'compras@sibarita.com':       'compras123',
  'almacenero1@sibarita.com':   'almacenero1',
  'almacenero2@sibarita.com':   'almacenero2',
  'almacenero3@sibarita.com':   'almacenero3',
}

module.exports = { MODO, esProduccion: MODO === 'produccion', CUENTAS_DEMO }
