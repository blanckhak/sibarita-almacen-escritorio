# Sibarita — Plan de seguimiento (desde v1.14.0)

> Creado: 23/09/2026. Punto de partida: commit `43a4037`, instalador **1.14.0**, `master` sincronizado con `origin`.
> Regla de trabajo: una fase a la vez, con aprobación del usuario antes de empezar y revisión al terminar.
> Estados: ⬜ pendiente · 🟨 en curso · ✅ hecho · ⛔ bloqueado (esperando respuesta)

| # | Fase | Estado | Depende de |
|---|------|--------|------------|
| 1 | Verificar v1.14.0 y ordenar el proyecto | 🟨 | — |
| 2 | Pulido pendiente | ✅ | — |
| 3 | Preguntas al cliente | 🟨 | — |
| 4 | Despliegue en red (PC servidor) | 🟨 | 1 |
| 5 | Trabajo sin conexión y sincronización | ⬜ | 4 |
| 6 | Procesos en segundo plano | ⛔ | 3 |
| 7 | Entrega final | ⬜ | 1–6 |

---

## Fase 1 — Verificar v1.14.0 y ordenar el proyecto
**Objetivo:** confirmar que lo último funciona sobre papel real y dejar la documentación al día.
- [x] Revisar el contenido del instalador 1.14.0 (23/09): el `app.asar` trae `backend/.env`, las medidas 68/79 y la opción Boleta.
- [ ] **(usuario)** Instalar `dist/Sibarita Setup 1.14.0.exe` en una PC limpia y verificar que arranca y se conecta a la base.
- [ ] **(usuario)** Imprimir en la Epson FX-890 II, sobre el talonario, los 4 documentos: Nota de Ingreso, Nota de Salida, Nota de Desuso y Solicitud de Materiales. Revisar que un nombre largo siga el rayado (68/79 caracteres por renglón).
- [x] Boleta como referencia: probada de punta a punta en el commit `01bba51` (API + impresión en el navegador). En papel real se revisa junto con el punto anterior.
- [x] `NOTAS_PROYECTO_SIBARITA.txt` al día: se agregó la sección 31 (21–23/09) y se reemplazó el "COMO RETOMAR" que había quedado viejo.
- [x] Datos de prueba borrados (23/09). Resultó que **toda** la base era de prueba, así que se vaciaron todos los movimientos: guías, notas, códigos, inventario, saldos e historial. Se conservaron el catálogo (20 productos), los usuarios, los almacenes, los parámetros y las unidades. Los códigos vuelven a empezar en 9001, las notas en 000001 y los 3 "Periodo 1" arrancan el 23/09. Respaldo previo: `backups/sibarita_db_20260923_093922.sql` (también en OneDrive). Después se probaron el login y los endpoints principales: todos responden 200.
- [x] `INFORME_SIBARITA.txt` y el PDF de SUNAT de `para giarse/` subidos al repo (decisión del usuario).

**Terminada cuando:** los 4 documentos se imprimen bien en el papel y la documentación coincide con el código.

## Fase 2 — Pulido pendiente
**Objetivo:** cerrar lo que quedó a medias en fases anteriores.
- [x] Decimales en Inventario y Movimientos (`039d264`). Al revisar aparecieron 3 bugs reales, que se reprodujeron antes de corregirlos:
  - **Desde 1.13.0, ninguna cantidad con decimales se podía guardar** (guías, devoluciones, traslados). El upsert de `ajustarInventario` no tenía el cast `::numeric`.
  - El ajuste manual daba error 500 desde la segunda vez sobre el mismo producto (choque con el índice único del 21/09).
  - Un traslado sin stock suficiente pasaba igual y creaba stock de la nada (las cantidades se concatenaban como texto).
- [x] Sacar `backend/*_log.txt` del instalador (`package.json`).
- [x] `/code-review` de los commits del 21 y 22/09: encontró 1 bug grave (`f6cb509`). Si una base ya tenía filas de inventario duplicadas, la migración del índice único fallaba en silencio y después **todas** las operaciones de stock daban 500. Ahora los duplicados se unen antes de crear el índice (probado con ROLLBACK). El resto de lo revisado quedó sin problemas.
- [x] Instalador **1.15.0** (`dist/Sibarita Setup 1.15.0.exe`). Contenido verificado (`.env`, los arreglos, sin logs) y el `.exe` empaquetado probado: arranca, el login funciona y la API responde.

**Terminada cuando:** se puede ajustar 2.5 KG a mano y el instalador nuevo está probado.

## Fase 3 — Preguntas al cliente
**Objetivo:** cerrar las dudas que traban otras fases. No se programa nada en esta fase.
- [ ] **Segundo plano:** ¿qué esperan concretamente de "Solicitud de materiales en la misma red → segundo plano" y de "Servicios de limpieza: al firmar la guía, procesar en segundo plano"? (Destraba la Fase 6.)
- [ ] **Periodos:** ¿un periodo por almacén (así funciona hoy) o uno global para todos?
- [ ] **Red:** ¿cuántas PCs la van a usar, y cuál sería la PC servidor? (Sirve para la Fase 4.)
- [ ] **Sin conexión:** ¿qué operaciones tienen que seguir funcionando si se corta la red? ¿Solo registrar, o también consultar el stock? (Define el alcance de la Fase 5.)

- [x] Mensaje para el cliente listo en `PREGUNTAS_CLIENTE.md` (23/09), con opciones cerradas. **Falta enviarlo y anotar las respuestas.**

**Terminada cuando:** cada pregunta tiene su respuesta anotada en `PREGUNTAS_CLIENTE.md`.

## Fase 4 — Despliegue en red (PC servidor)
**Objetivo:** que varias PCs compartan la misma base. Hoy cada instalación usa su propio Postgres local.
Base: `IDEAS_ARQUITECTURA_RED.txt` y `servidor_dedicado/`.
- [ ] En la PC servidor: Postgres + backend como servicio, puerto 3000 abierto en el firewall e IP fija.
- [x] Modo **cliente** en la app de escritorio (23/09), sin reinstalar. Un solo instalador con dos modos, guardados en `%APPDATA%\Sibarita\config.json` (se conservan al reinstalar):
  - **local** (default, como antes): levanta su propio backend.
  - **cliente**: no levanta backend y abre `http://<IP-servidor>:3000`.
  - Pantalla de conexión con `Ctrl+Shift+S`: "Probar conexión" comprueba que del otro lado haya un Sibarita y da mensajes claros (PC apagada, puerto cerrado, nombre inexistente). "Guardar y reiniciar".
  - Si el servidor no responde, pantalla de error con **Reintentar** / **Configurar conexión**, en vez de quedar en "Iniciando..." para siempre.
  - Solo las pantallas propias pueden cambiar la conexión; el sistema cargado desde la red, no.
  - Probado manejando la app real: cliente → servidor OK sin backend propio, dirección caída → pantalla de error, error → configurar → local (levanta su backend), cerrar la app cierra el backend.
  - ⚠️ La instalación cliente todavía lleva el `.env` con la contraseña de la base, aunque no la usa. Se puede evaluar un instalador cliente aparte en la Fase 7.
- [ ] Respaldo automático (`scripts/backup-db.ps1`) programado en la PC servidor.
- [ ] Prueba con 2 PCs a la vez: guías y salidas simultáneas sobre el mismo producto.

**Terminada cuando:** 2 o más PCs trabajan sobre la misma base sin conflictos.

## Fase 5 — Trabajo sin conexión y sincronización (Bloque 7 del cliente)
**Objetivo:** si se corta la red a mitad de una operación, que no se pierda nada y se sincronice sola al volver.
Es la fase más grande: conviene diseñarla (ADR) antes de programar.
- [ ] Diseño: cola local de operaciones pendientes, qué se permite hacer sin red y cómo se resuelven los conflictos.
- [ ] Aviso visible de "sin conexión" y de "N operaciones pendientes".
- [ ] Sincronización automática al volver la red, con aviso si otro usuario ya usó el mismo código (control de duplicidad).
- [ ] Pruebas cortando la red a mitad de guardar una guía y una salida.

**Terminada cuando:** cortar el cable en plena operación no pierde ni duplica datos.

## Fase 6 — Procesos en segundo plano ⛔
Bloqueada hasta tener la respuesta de la Fase 3. Las tareas se definen con esa respuesta.

## Fase 7 — Entrega final
- [ ] Instalador final (servidor + cliente) probado de cero.
- [ ] Manual corto de uso por rol (admin, almacén, almacenero3, mantenimiento, compras).
- [ ] Capacitación y acta de entrega al cliente.

---

## Registro de avance
| Fecha | Fase | Qué se hizo | Commit |
|-------|------|-------------|--------|
| 22/09/2026 | (previo) | Calibración de renglones fijos con el talonario real, Boleta en la Nota de Ingreso, instalador 1.14.0 | `43a4037` |
| 23/09/2026 | 1 | Instalador revisado, NOTAS al día, base de prueba vaciada (con respaldo), archivos sueltos subidos al repo | (este commit) |
| 23/09/2026 | 2 | Decimales rotos desde 1.13 corregidos, ajuste manual y traslados arreglados, migración del índice robusta, instalador 1.15.0 | `039d264`, `f6cb509`, (bump) |
