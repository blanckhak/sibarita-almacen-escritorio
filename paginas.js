// Pantallas propias de la app de escritorio (fuera del frontend React): se
// muestran cuando todavia no hay servidor al que conectarse. Hablan con el
// proceso principal via window.sibarita (preload.js).

const ESTILO = `
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0f172a; color:#e2e8f0; font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif; }
  .caja { width:min(460px, calc(100vw - 32px)); background:#1e293b; border:1px solid #334155;
          border-radius:12px; padding:28px; }
  h1 { font-size:18px; margin:0 0 6px; }
  p { font-size:14px; color:#94a3b8; line-height:1.5; margin:0 0 16px; }
  label.opcion { display:flex; gap:10px; align-items:flex-start; padding:12px; border:1px solid #334155;
                 border-radius:8px; margin-bottom:10px; cursor:pointer; font-size:14px; }
  label.opcion small { display:block; color:#94a3b8; margin-top:2px; }
  input[type=text] { width:100%; padding:10px 12px; border-radius:8px; border:1px solid #475569;
                     background:#0f172a; color:#e2e8f0; font-size:14px; margin-top:8px; }
  input[type=text]:disabled { opacity:.5; }
  .botones { display:flex; gap:10px; margin-top:18px; flex-wrap:wrap; }
  button { padding:10px 16px; border-radius:8px; border:1px solid #475569; background:#334155;
           color:#e2e8f0; font-size:14px; cursor:pointer; }
  button.primario { background:#2563eb; border-color:#2563eb; }
  button:disabled { opacity:.5; cursor:default; }
  .estado { font-size:13px; margin-top:14px; min-height:18px; }
  .ok { color:#4ade80; } .error { color:#f87171; }
  .detalle { font-size:13px; color:#fca5a5; background:#450a0a; border-radius:8px; padding:10px 12px; margin-bottom:16px; }
  kbd { background:#334155; border-radius:4px; padding:1px 6px; font-size:12px; }
`;

const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const aDataUrl = (html) => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

function paginaCarga(texto) {
  return aDataUrl(`<!doctype html><html><head><meta charset="utf-8"><title>Sibarita</title>
<style>${ESTILO}
  .spinner { width:40px; height:40px; border:4px solid #334155; border-top-color:#3b82f6; border-radius:50%;
             animation:spin .8s linear infinite; margin:0 auto 16px; }
  @keyframes spin { to { transform:rotate(360deg); } }
</style></head>
<body><div style="text-align:center"><div class="spinner"></div><p>${escapar(texto)}</p></div></body></html>`);
}

function paginaError({ titulo, detalle, direccion }) {
  return aDataUrl(`<!doctype html><html><head><meta charset="utf-8"><title>Sibarita</title>
<style>${ESTILO}</style></head>
<body><div class="caja">
  <h1>${escapar(titulo)}</h1>
  <p>Direccion: <b>${escapar(direccion)}</b></p>
  <div class="detalle">${escapar(detalle)}</div>
  <p>Si esta PC se conecta a otra (la PC servidor), revisa que esa PC este encendida con Sibarita abierto
     y en la misma red. Tambien puedes cambiar la direccion en <b>Configurar conexion</b>.</p>
  <div class="botones">
    <button class="primario" onclick="window.sibarita.reintentar()">Reintentar</button>
    <button onclick="window.sibarita.abrirConfig()">Configurar conexion</button>
  </div>
</div></body></html>`);
}

function paginaConfig() {
  return aDataUrl(`<!doctype html><html><head><meta charset="utf-8"><title>Sibarita - Conexion</title>
<style>${ESTILO}</style></head>
<body><div class="caja">
  <h1>Conexion de esta PC</h1>
  <p>Elige como trabaja esta computadora. Se puede cambiar cuando quieras con <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>.</p>

  <label class="opcion"><input type="radio" name="modo" value="local">
    <span><b>Esta PC es el servidor</b> (o trabaja sola)
      <small>Usa la base de datos instalada en esta misma computadora.</small></span></label>

  <label class="opcion"><input type="radio" name="modo" value="cliente">
    <span style="flex:1"><b>Conectarse a la PC servidor</b>
      <small>Usa la base de datos de otra PC de la red. Escribe su direccion (ej. 192.168.1.45).</small>
      <input type="text" id="servidor" placeholder="192.168.1.45" autocomplete="off"></span></label>

  <div class="botones">
    <button id="probar">Probar conexion</button>
    <button id="guardar" class="primario">Guardar y reiniciar</button>
    <button id="cancelar">Cancelar</button>
  </div>
  <div class="estado" id="estado"></div>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  const radios = [...document.querySelectorAll('input[name=modo]')];
  const modo = () => radios.find(r => r.checked)?.value || 'local';
  const estado = (texto, clase) => { $('estado').textContent = texto; $('estado').className = 'estado ' + (clase || ''); };
  const refrescar = () => { $('servidor').disabled = modo() !== 'cliente'; $('probar').disabled = modo() !== 'cliente'; };
  radios.forEach(r => r.addEventListener('change', () => { refrescar(); estado(''); }));
  $('servidor').addEventListener('focus', () => { radios[1].checked = true; refrescar(); });

  window.sibarita.obtenerConfig().then(cfg => {
    radios.forEach(r => { r.checked = r.value === cfg.modo; });
    $('servidor').value = (cfg.servidor || '').replace(/^http:\\/\\//, '');
    refrescar();
  });

  $('probar').onclick = async () => {
    estado('Probando...');
    const r = await window.sibarita.probar($('servidor').value);
    r.ok ? estado('Conexion correcta con ' + r.servidor, 'ok') : estado(r.error, 'error');
  };
  $('guardar').onclick = async () => {
    $('guardar').disabled = true;
    const r = await window.sibarita.guardar({ modo: modo(), servidor: $('servidor').value });
    if (!r.ok) { estado(r.error, 'error'); $('guardar').disabled = false; }
  };
  $('cancelar').onclick = () => window.sibarita.reintentar();
</script>
</body></html>`);
}

module.exports = { paginaCarga, paginaError, paginaConfig };
