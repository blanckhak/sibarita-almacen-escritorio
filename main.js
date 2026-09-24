const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { PUERTO_DEFAULT, leerConfig, guardarConfig, normalizarServidor, probarServidor } = require('./conexion');
const { paginaCarga, paginaError, paginaConfig } = require('./paginas');

// En algunas PCs el proceso GPU de Electron se cae al arrancar
// ("GPU process exited unexpectedly: exit_code=34") y la ventana queda en
// blanco / "Cargando...". Desactivar la aceleracion por hardware lo evita;
// esta app es UI simple, no necesita GPU.
app.disableHardwareAcceleration();

const PORT = PUERTO_DEFAULT;
const LOCAL_URL = `http://localhost:${PORT}`;
const BACKEND_DIR = path.join(__dirname, 'backend');

// Para medir el arranque (se ve en la consola de npm start).
const T0 = Date.now();
const ms = () => `${Date.now() - T0} ms`;

let backendProcess = null;
let mainWindow = null;
// Modo de conexion vigente (conexion.js): local o cliente de la PC servidor.
let config = null;

function waitForServer(url, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error('El servidor no respondio a tiempo'));
        } else {
          setTimeout(tryOnce, intervalMs);
        }
      });
    };
    tryOnce();
  });
}

function startBackend() {
  // cwd NO puede apuntar dentro de app.asar (no es un directorio real para el
  // sistema operativo al crear el proceso) -> se usa una carpeta real, y se
  // pasa la ruta absoluta del script (Node/Electron si sabe leer esa ruta
  // dentro del asar una vez que el proceso ya arranco).
  const serverScript = path.join(BACKEND_DIR, 'server.js');
  const realCwd = path.dirname(process.execPath);

  backendProcess = spawn(process.execPath, [serverScript], {
    cwd: realCwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      // Modo desarrollador marcado en Ctrl+Shift+S; si no, el backend decide
      // (instalado = produccion, codigo fuente = desarrollo).
      ...(config.desarrollador ? { SIBARITA_MODO: 'desarrollo' } : {}),
    },
    stdio: 'pipe'
  });

  backendProcess.stdout.on('data', (d) => console.log(`[backend] ${d}`.trim()));
  backendProcess.stderr.on('data', (d) => console.error(`[backend] ${d}`.trim()));
  backendProcess.on('error', (err) => console.error(`[backend] error al iniciar: ${err.message}`));
  backendProcess.on('exit', (code) => console.log(`[backend] proceso terminado, codigo ${code}`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f172a',
    title: 'Sibarita - Sistema de Gestion de Almacenes',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Ctrl+Shift+S abre la pantalla de conexion desde cualquier lado (la barra
  // de menu esta oculta, no hay otro lugar donde ponerla).
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 's') {
      event.preventDefault();
      mainWindow.loadURL(paginaConfig());
    }
  });

  // Se muestra de inmediato con una pantalla de carga liviana, mientras el
  // backend (local o de la PC servidor) responde, en vez de dejar al usuario
  // sin ninguna ventana durante ese tiempo.
  mainWindow.loadURL(paginaCarga('Iniciando Sibarita...'));
}

function urlDestino() {
  return config.modo === 'cliente' ? config.servidor : LOCAL_URL;
}

// Espera al servidor y carga el sistema. Si no responde, en vez de quedar
// en "Iniciando..." para siempre (lo que pasaba antes), muestra una pantalla
// de error con Reintentar / Configurar conexion.
function conectar() {
  const destino = urlDestino();
  const esCliente = config.modo === 'cliente';
  // Modo local: levantar el backend si todavia no corre o si se cayo (asi
  // "Reintentar" sirve tambien despues de arreglar PostgreSQL). En modo
  // cliente NO se levanta: la base vive en la PC servidor.
  if (!esCliente && (!backendProcess || backendProcess.exitCode !== null)) startBackend();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(paginaCarga(esCliente ? `Conectando con ${destino}...` : 'Iniciando Sibarita...'));
  }
  waitForServer(destino, esCliente ? 8000 : 20000, 100)
    .then(() => {
      console.log(`[inicio] servidor respondio: ${ms()}`);
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.once('did-finish-load', () => console.log(`[inicio] sistema cargado: ${ms()}`));
      mainWindow.loadURL(destino);
    })
    .catch((err) => {
      console.error(err.message);
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.loadURL(paginaError({
        titulo: esCliente ? 'No se pudo conectar con la PC servidor' : 'Sibarita no pudo iniciar',
        detalle: esCliente
          ? 'La PC servidor no respondio.'
          : 'El servidor interno no respondio. Revisa que PostgreSQL este instalado y funcionando en esta PC.',
        direccion: destino,
      }));
    });
}

// Solo las pantallas propias (data:) pueden cambiar la conexion; el sistema
// cargado desde un servidor de la red no tiene acceso a esto.
function desdePantallaPropia(event) {
  return String(event.senderFrame?.url || '').startsWith('data:');
}

function registrarIpc() {
  const soloPropias = (fn) => (event, ...args) => {
    if (!desdePantallaPropia(event)) throw new Error('No permitido');
    return fn(...args);
  };
  ipcMain.handle('conexion:obtener', soloPropias(() => config));
  ipcMain.handle('conexion:probar', soloPropias(async (texto) => {
    const servidor = normalizarServidor(texto);
    if (!servidor) return { ok: false, error: 'Escribe una direccion valida (ej. 192.168.1.45)' };
    return { ...(await probarServidor(servidor)), servidor };
  }));
  ipcMain.handle('conexion:guardar', soloPropias((cfg) => {
    try {
      guardarConfig(app, cfg);
    } catch (err) {
      return { ok: false, error: 'Escribe una direccion valida (ej. 192.168.1.45)' };
    }
    // Reiniciar la app entera: pasar de local a cliente (o al reves)
    // cambia si hay que levantar el backend o no.
    app.relaunch();
    app.exit(0);
    return { ok: true };
  }));
  ipcMain.handle('conexion:reintentar', soloPropias(() => conectar()));
  ipcMain.handle('conexion:abrirConfig', soloPropias(() => mainWindow.loadURL(paginaConfig())));
}

// El backend tarda ~1 s en levantar: se lanza ya, en paralelo con el
// arranque de Electron, en vez de esperar a que la ventana este lista.
config = leerConfig(app);
if (config.modo !== 'cliente') startBackend();

app.whenReady().then(() => {
  console.log(`[inicio] electron listo: ${ms()}`);
  registrarIpc();
  createWindow();
  conectar();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});
