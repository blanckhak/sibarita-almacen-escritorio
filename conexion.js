// Fase 4 (PLAN_SEGUIMIENTO.md): modo de conexion de la app de escritorio.
//
//   local   -> (default, como siempre) levanta su propio backend y abre
//              http://localhost:3000. Es la PC servidor, o una PC sola.
//   cliente -> NO levanta backend: abre la direccion de la PC servidor en la
//              red (http://<IP>:3000), donde vive la unica base de datos.
//
// Se guarda en config.json dentro de la carpeta de datos del usuario
// (%APPDATA%\sibarita-escritorio, por el "name" del package.json), no dentro
// de la instalacion: sobrevive a reinstalar
// o actualizar, y se cambia desde la pantalla de conexion sin reinstalar.
const fs = require('fs');
const path = require('path');
const http = require('http');

const PUERTO_DEFAULT = 3000;
const CONFIG_DEFAULT = { modo: 'local', servidor: '' };

function rutaConfig(app) {
  return path.join(app.getPath('userData'), 'config.json');
}

function leerConfig(app) {
  try {
    const cfg = JSON.parse(fs.readFileSync(rutaConfig(app), 'utf8'));
    if (cfg.modo === 'cliente' && normalizarServidor(cfg.servidor)) {
      return { modo: 'cliente', servidor: normalizarServidor(cfg.servidor) };
    }
  } catch (_) {
    // Sin archivo (primera vez) o archivo roto: se sigue en modo local.
  }
  return { ...CONFIG_DEFAULT };
}

function guardarConfig(app, cfg) {
  const limpio = cfg.modo === 'cliente'
    ? { modo: 'cliente', servidor: normalizarServidor(cfg.servidor) }
    : { ...CONFIG_DEFAULT };
  if (limpio.modo === 'cliente' && !limpio.servidor) {
    throw new Error('Direccion del servidor invalida');
  }
  fs.mkdirSync(path.dirname(rutaConfig(app)), { recursive: true });
  fs.writeFileSync(rutaConfig(app), JSON.stringify(limpio, null, 2), 'utf8');
  return limpio;
}

// Acepta lo que un usuario escribiria: "192.168.1.45", "192.168.1.45:3000",
// "http://servidor-almacen:3000/". Devuelve "http://host:puerto" o '' si no
// es una direccion valida. Solo http: es una red local.
function normalizarServidor(texto) {
  let s = String(texto || '').trim();
  if (!s) return '';
  if (!/^[a-z]+:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' || !u.hostname) return '';
    return `http://${u.hostname}:${u.port || PUERTO_DEFAULT}`;
  } catch (_) {
    return '';
  }
}

// Comprueba que en esa direccion haya un servidor SIBARITA (no cualquier
// cosa escuchando en el puerto): /api/auth/perfil sin token responde 401.
function probarServidor(base, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.get(`${base}/api/auth/perfil`, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 401
        ? { ok: true }
        : { ok: false, error: `Respondio algo que no es Sibarita (HTTP ${res.statusCode})` });
    });
    req.on('timeout', () => req.destroy(new Error('No respondio a tiempo')));
    req.on('error', (err) => resolve({ ok: false, error: mensajeRed(err) }));
  });
}

function mensajeRed(err) {
  if (err.code === 'ECONNREFUSED') return 'La PC existe pero Sibarita no esta abierto ahi (o el puerto esta cerrado)';
  if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') return 'No se llega a esa PC por la red';
  if (err.code === 'ENOTFOUND') return 'No se encontro una PC con ese nombre';
  return err.message || 'Error de conexion';
}

module.exports = { PUERTO_DEFAULT, leerConfig, guardarConfig, normalizarServidor, probarServidor };
