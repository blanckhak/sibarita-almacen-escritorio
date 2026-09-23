// Puente seguro entre las pantallas propias de la app (conexion / error, ver
// paginas.js) y el proceso principal. main.js solo atiende estas llamadas si
// vienen de esas pantallas (data:), no del sistema cargado desde el servidor.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sibarita', {
  obtenerConfig: () => ipcRenderer.invoke('conexion:obtener'),
  probar: (servidor) => ipcRenderer.invoke('conexion:probar', servidor),
  guardar: (cfg) => ipcRenderer.invoke('conexion:guardar', cfg),
  reintentar: () => ipcRenderer.invoke('conexion:reintentar'),
  abrirConfig: () => ipcRenderer.invoke('conexion:abrirConfig'),
});
