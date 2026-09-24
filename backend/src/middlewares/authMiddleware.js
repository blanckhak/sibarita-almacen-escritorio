const jwt = require('jsonwebtoken')
const pool = require('../config/db')
const { obtenerSecreto } = require('../config/secreto')

// Sesion invalida o vencida -> 401 (el frontend vuelve al login). Falta de
// permisos -> 403 (soloRoles).
const verificarToken = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token)
    return res.status(401).json({ error: 'Token requerido' })

  let decoded
  try {
    decoded = jwt.verify(token, obtenerSecreto())
  } catch {
    return res.status(401).json({ error: 'Sesion vencida, vuelva a ingresar' })
  }

  // Un usuario desactivado, o cuya contrasena cambio despues de abrir esta
  // sesion, queda afuera en el momento (no recien cuando vence el token).
  try {
    const r = await pool.query(
      'SELECT activo, sesion_version FROM usuarios WHERE id = $1',
      [decoded.id]
    )
    const u = r.rows[0]
    if (!u || !u.activo)
      return res.status(401).json({ error: 'Usuario desactivado' })
    if ((decoded.v || 0) !== u.sesion_version)
      return res.status(401).json({ error: 'La contrasena cambio, vuelva a ingresar' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  // Con la contrasena pendiente de cambio solo se puede usar /api/auth
  // (perfil y cambiar contrasena).
  if (decoded.debe_cambiar && !req.originalUrl.startsWith('/api/auth/'))
    return res.status(403).json({ error: 'Debe cambiar su contrasena antes de continuar', debe_cambiar: true })

  req.usuario = decoded
  next()
}

const soloRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol))
      return res.status(403).json({ error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}` })
    next()
  }
}

module.exports = { verificarToken, soloRoles }
