# Sibarita - App de Escritorio (con base de datos local)

App de escritorio (Electron) que corre TODO en tu PC: al abrirla,
arranca automaticamente un backend Node/Express local (carpeta
`backend/`) conectado a una base de datos PostgreSQL local, y muestra
el frontend ya compilado. No depende de Vercel ni de Render: funciona
sin internet.

## Como funciona

- `main.js` (proceso principal de Electron) al iniciar:
  1. Lanza `backend/server.js` como proceso hijo (Express + PostgreSQL).
  2. Espera a que responda en `http://localhost:3000`.
  3. Abre la ventana cargando esa URL.
- `backend/server.js` sirve la API en `/api/*` **y** el frontend ya
  compilado (`backend/frontend-dist/`, generado con `npm run build`
  del proyecto frontend original) como una SPA.
- Al cerrar la ventana, se mata el proceso del backend.

## Base de datos usada

- PostgreSQL local ya instalado en esta PC (servicio
  `postgresql-x64-16`, puerto 5432).
- Base de datos: `sibarita_db` (la misma que se uso en desarrollo
  antes de desplegar a Render). Ya tiene el esquema completo de
  Fase 1 y Fase 2 (16 tablas) y datos base (roles, 3 almacenes,
  usuarios de prueba, catalogo).
- Credenciales en `backend/.env` (usuario `postgres`).

**Importante:** esta base es independiente de la de produccion
(Render/Vercel). Los cambios que hagas en la app de escritorio
(nuevas guias, movimientos, etc.) NO se reflejan en la web en linea,
y viceversa. Son dos sistemas separados que comparten el mismo
codigo pero no los mismos datos.

## Ejecutar en modo desarrollo

Requiere tener el servicio de PostgreSQL local corriendo (deberia
iniciar solo con Windows).

```
npm install
npm start
```

## Generar el instalador .exe

```
npm run build
```

El instalador queda en `dist/`. Al instalarse en OTRA PC, esa PC
tambien necesita tener PostgreSQL instalado localmente con una base
`sibarita_db` con el mismo esquema (ver
`../backend/src/config/setup.js` y `database.sql` del proyecto
original), o hay que editar `backend/.env` para apuntar a otra base.

## Si necesitas usar la version conectada a Render/Vercel

Existe otra version de este mismo wrapper que en vez de levantar un
backend local, abre directamente `https://sibarita-almacen.vercel.app`
(usa los datos de produccion). Si quieres volver a esa version,
avisa y se puede regenerar el `main.js` simplificado.

## Actualizar el frontend o backend empaquetados

Desde el 25/08/2026 esta carpeta es autosuficiente: tiene su propio
`frontend/` (codigo fuente copiado del proyecto original una sola vez) y
su propio `backend/`, y tiene control de versiones propio (`git`, ver
mas abajo). El desarrollo activo sigue aqui, no en
`sistemas/sibarita - pryecto de almacen` (esa carpeta quedo congelada
como snapshot historico, conectada a GitHub/Vercel/Render por si se
retoma la web mas adelante).

Para reflejar un cambio de frontend en el empaquetado:

```
cd frontend
npm run build
# borrar backend/frontend-dist y copiar frontend/dist en su lugar
```

Los cambios de backend se editan directo en `backend/src/`, `server.js`.

## Control de versiones

Esta carpeta tiene su propio repo git (separado del proyecto original).
`node_modules/`, `dist/` (el instalador empaquetado), `backups/` (dumps
de base de datos) y `*.log` estan en `.gitignore`.
