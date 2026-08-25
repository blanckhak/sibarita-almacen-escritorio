const pool = require('../config/db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const login = async (req, res) => {
  const { email, password } = req.body

  if (!email || !password)
    return res.status(400).json({ error: 'Email y password son requeridos' })

  try {
    const result = await pool.query(
      `SELECT u.*, r.nombre as rol, a.nombre as almacen
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       LEFT JOIN almacenes a ON u.almacen_id = a.id
       WHERE u.email = $1 AND u.activo = true`,
      [email]
    )

    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Credenciales incorrectas' })

    const usuario = result.rows[0]
    const passwordValido = await bcrypt.compare(password, usuario.password)

    if (!passwordValido)
      return res.status(401).json({ error: 'Credenciales incorrectas' })

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol, almacen_id: usuario.almacen_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )

    await pool.query(
      'INSERT INTO actividad_log (usuario_id, usuario_nombre, accion, detalle) VALUES ($1,$2,$3,$4)',
      [usuario.id, usuario.nombre, 'LOGIN', `Inicio de sesion como ${usuario.rol}`]
    )

    res.json({
      token,
      usuario: {
        id:       usuario.id,
        nombre:   usuario.nombre,
        email:    usuario.email,
        rol:      usuario.rol,
        almacen:  usuario.almacen,
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const perfil = async (req, res) => {
  res.json({ usuario: req.usuario })
}

module.exports = { login, perfil }
