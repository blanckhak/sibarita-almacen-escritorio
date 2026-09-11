const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const express = require('express')
const cors = require('cors')

const almacenesRoutes  = require('./src/routes/almacenes')
const inventarioRoutes = require('./src/routes/inventario')
const productosRoutes   = require('./src/routes/productos')
const unidadesMedidaRoutes = require('./src/routes/unidadesMedida')
const guiasRoutes       = require('./src/routes/guias')
const etiquetasRoutes   = require('./src/routes/etiquetas')
const notasSalidaRoutes = require('./src/routes/notasSalida')
const notasDesusoRoutes = require('./src/routes/notasDesuso')
const solicitudesMaterialesRoutes = require('./src/routes/solicitudesMateriales')
const parametrosAprobacionRoutes = require('./src/routes/parametrosAprobacion')
const parametrosImpresionRoutes = require('./src/routes/parametrosImpresion')
const periodosRoutes = require('./src/routes/periodos')
const dashboardRoutes   = require('./src/routes/dashboard')
const authRoutes       = require('./src/routes/auth')
const usuariosRoutes    = require('./src/routes/usuarios')
const movimientosRoutes = require('./src/routes/movimientos')
const alertasRoutes     = require('./src/routes/alertas')
const reportesRoutes    = require('./src/routes/reportes')
const logsRoutes        = require('./src/routes/logs')
const setup             = require('./src/config/setup')

const app = express()

// false: no hay reverse proxy real delante (LAN directa). Con 'true' cualquier
// cliente podria mandar un header X-Forwarded-For falso y hacer que
// actividad_log.ip registre una IP inventada en vez de la real -- justo lo
// contrario de para que sirve ese log. Si algun dia se agrega un proxy real,
// esto se cambia a la IP/subred de ESE proxy (no 'true' = confiar en todos).
app.set('trust proxy', false)

app.use(cors())
app.use(express.json())

app.use('/api/auth',       authRoutes)
app.use('/api/almacenes',  almacenesRoutes)
app.use('/api/inventario', inventarioRoutes)
app.use('/api/productos',  productosRoutes)
app.use('/api/unidades-medida', unidadesMedidaRoutes)
app.use('/api/guias',      guiasRoutes)
app.use('/api/etiquetas',  etiquetasRoutes)
app.use('/api/notas-salida', notasSalidaRoutes)
app.use('/api/notas-desuso', notasDesusoRoutes)
app.use('/api/solicitudes-materiales', solicitudesMaterialesRoutes)
app.use('/api/parametros-aprobacion', parametrosAprobacionRoutes)
app.use('/api/parametros-impresion', parametrosImpresionRoutes)
app.use('/api/periodos', periodosRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/usuarios',    usuariosRoutes)
app.use('/api/movimientos', movimientosRoutes)
app.use('/api/alertas',    alertasRoutes)
app.use('/api/reportes',   reportesRoutes)
app.use('/api/logs',       logsRoutes)

const frontendDist = path.join(__dirname, 'frontend-dist')
app.use(express.static(frontendDist))
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'))
})

const PORT = process.env.PORT || 3000
setup()
  .then(() => app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`)))
  .catch(err => { console.error('Error en setup:', err.message); process.exit(1) })
