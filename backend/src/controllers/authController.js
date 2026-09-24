const pool = require('../config/db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { ipDe } = require('../utils/red')
const { obtenerSecreto } = require('../config/secreto')
const { MODO, esProduccion, CUENTAS_DEMO } = require('../config/modo')

const LARGO_MINIMO = 6

const esClaveDemo = (email, password) => CUENTAS_DEMO[String(email).toLowerCase()] === password

function emitirSesion(usuario, debeCambiar) {
  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, rol: usuario.rol, almacen_id: usuario.almacen_id,
      debe_cambiar: debeCambiar, v: usuario.sesion_version },
    obtenerSecreto(),
    { expiresIn: '8h' }
  )
  return {
    token,
    usuario: {
      id:           usuario.id,
      nombre:       usuario.nombre,
      email:        usuario.email,
      rol:          usuario.rol,
      almacen:      usuario.almacen,
      debe_cambiar: debeCambiar,
    }
  }
}

const buscarUsuario = (where, valor, soloActivos = true) => pool.query(
  `SELECT u.*, r.nombre as rol, a.nombre as almacen
   FROM usuarios u
   JOIN roles r ON u.rol_id = r.id
   LEFT JOIN almacenes a ON u.almacen_id = a.id
   WHERE ${where}${soloActivos ? ' AND u.activo = true' : ''}`,
  [valor]
)

const login = async (req, res) => {
  const { email, password } = req.body

  if (!email || !password)
    return res.status(400).json({ error: 'Email y password son requeridos' })

  try {
    const result = await buscarUsuario('u.email = $1', email, false)

    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Credenciales incorrectas' })

    const usuario = result.rows[0]
    const passwordValido = await bcrypt.compare(password, usuario.password)

    if (!passwordValido)
      return res.status(401).json({ error: 'Credenciales incorrectas' })

    // Con la contrasena correcta si se puede decir por que no entra (antes
    // decia "Credenciales incorrectas" y parecia un error de contrasena).
    if (!usuario.activo)
      return res.status(401).json({ error: 'Este usuario esta desactivado. Pida al administrador que lo active en Usuarios.' })

    // En produccion, una cuenta de prueba con su contrasena conocida no
    // entra. El admin si (si no, nadie podria entrar a un sistema recien
    // instalado), pero solo para cambiarla.
    let debeCambiar = usuario.debe_cambiar_password
    if (esProduccion && esClaveDemo(email, password)) {
      if (usuario.rol !== 'admin')
        return res.status(401).json({ error: 'Esta es una cuenta de prueba y no se puede usar en produccion. Pida al administrador que le cree una cuenta.' })
      debeCambiar = true
    }

    await pool.query(
      'INSERT INTO actividad_log (usuario_id, usuario_nombre, accion, detalle, ip) VALUES ($1,$2,$3,$4,$5)',
      [usuario.id, usuario.nombre, 'LOGIN', `Inicio de sesion como ${usuario.rol}`, ipDe(req)]
    )

    res.json(emitirSesion(usuario, debeCambiar))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const perfil = async (req, res) => {
  res.json({ usuario: req.usuario })
}

// Publico: el login lo usa para mostrar o no las cuentas de prueba.
const modo = (req, res) => {
  res.json({ modo: MODO })
}

// Cambia la contrasena del propio usuario y devuelve una sesion nueva (las
// demas sesiones abiertas de ese usuario quedan invalidadas).
const cambiarPassword = async (req, res) => {
  const { actual, nueva } = req.body
  if (!actual || !nueva)
    return res.status(400).json({ error: 'Escriba la contrasena actual y la nueva' })
  if (String(nueva).length < LARGO_MINIMO)
    return res.status(400).json({ error: `La contrasena nueva debe tener al menos ${LARGO_MINIMO} caracteres` })
  if (nueva === actual)
    return res.status(400).json({ error: 'La contrasena nueva debe ser distinta de la actual' })
  if (esProduccion && Object.values(CUENTAS_DEMO).includes(nueva))
    return res.status(400).json({ error: 'Esa contrasena es de las cuentas de prueba, elija otra' })

  try {
    const result = await buscarUsuario('u.id = $1', req.usuario.id)
    const usuario = result.rows[0]
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
    if (!(await bcrypt.compare(actual, usuario.password)))
      return res.status(400).json({ error: 'La contrasena actual no es correcta' })

    const hash = await bcrypt.hash(nueva, 10)
    const r = await pool.query(
      `UPDATE usuarios SET password = $1, debe_cambiar_password = false, sesion_version = sesion_version + 1
       WHERE id = $2 RETURNING sesion_version`,
      [hash, usuario.id]
    )
    usuario.sesion_version = r.rows[0].sesion_version
    await pool.query(
      'INSERT INTO actividad_log (usuario_id, usuario_nombre, accion, detalle, ip) VALUES ($1,$2,$3,$4,$5)',
      [usuario.id, usuario.email, 'CAMBIAR_PASSWORD', 'Cambio su propia contrasena', ipDe(req)]
    )
    res.json(emitirSesion(usuario, false))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { login, perfil, modo, cambiarPassword, LARGO_MINIMO }
