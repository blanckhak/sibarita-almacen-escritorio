// Clave con la que se firman las sesiones (JWT). Se genera al azar la primera
// vez que arranca cada base y queda guardada en ella (sistema_config): cada
// servidor tiene la suya y no viaja en el instalador. Antes se usaba
// JWT_SECRET del .env, que era generica y venia dentro de cada instalacion,
// asi que cualquiera con el .exe podia fabricarse una sesion de admin.
const crypto = require('crypto')
const pool = require('./db')

let secreto = null

async function cargarSecreto() {
  await pool.query(
    `INSERT INTO sistema_config (clave, valor) VALUES ('jwt_secret', $1)
     ON CONFLICT (clave) DO NOTHING`,
    [crypto.randomBytes(48).toString('hex')]
  )
  const r = await pool.query(`SELECT valor FROM sistema_config WHERE clave = 'jwt_secret'`)
  secreto = r.rows[0].valor
}

function obtenerSecreto() {
  if (!secreto) throw new Error('Clave de sesion no cargada')
  return secreto
}

module.exports = { cargarSecreto, obtenerSecreto }
