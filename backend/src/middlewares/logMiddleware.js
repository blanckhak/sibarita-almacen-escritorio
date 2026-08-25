const pool = require('../config/db')

// detalle puede ser un string fijo o una funcion (req) => string, para incluir
// datos propios de cada peticion (ej. numero de guia, producto, cantidad).
const log = (accion, detalle) => (req, res, next) => {
  res.on('finish', async () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.usuario) {
      try {
        const detalleFinal = typeof detalle === 'function' ? detalle(req) : detalle
        await pool.query(
          'INSERT INTO actividad_log (usuario_id, usuario_nombre, accion, detalle) VALUES ($1,$2,$3,$4)',
          [req.usuario.id, req.usuario.email, accion, detalleFinal || null]
        )
      } catch (_) {}
    }
  })
  next()
}

module.exports = log
