const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// En algunas PCs el proceso GPU de Electron se cae al arrancar
// ("GPU process exited unexpectedly: exit_code=34") y la ventana queda en
// blanco / "Cargando...". Desactivar la aceleracion por hardware lo evita;
// esta app es UI simple, no necesita GPU.
app.disableHardwareAcceleration();

const PORT = 3000;
const APP_URL = `http://localhost:${PORT}`;
const BACKEND_DIR = path.join(__dirname, 'backend');

const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html>
<html><head><meta charset="utf-8"><title>Sibarita</title>
<style>
  body { margin:0; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
         background:#0f172a; color:#e2e8f0; font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif; }
  .spinner { width:40px; height:40px; border:4px solid #334155; border-top-color:#3b82f6; border-radius:50%;
             animation:spin 0.8s linear infinite; margin-bottom:16px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  p { font-size:14px; color:#94a3b8; }
</style></head>
<body><div class="spinner"></div><p>Iniciando Sibarita...</p></body></html>
`)}`;

let backendProcess = null;
let mainWindow = null;

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
          reject(new Error('El servidor local no respondio a tiempo'));
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
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(PORT) },
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

  // Se muestra de inmediato con una pantalla de carga liviana, mientras el
  // backend local termina de levantar en paralelo, en vez de dejar al
  // usuario sin ninguna ventana durante ese tiempo.
  mainWindow.loadURL(LOADING_HTML);
}

app.whenReady().then(() => {
  createWindow();
  startBackend();

  waitForServer(APP_URL, 20000, 300)
    .then(() => mainWindow && !mainWindow.isDestroyed() && mainWindow.loadURL(APP_URL))
    .catch((err) => console.error(err.message));

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
