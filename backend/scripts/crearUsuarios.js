require('dotenv').config()
const bcrypt = require('bcryptjs')
const pool = require('../src/config/db')

const usuarios = [
  { nombre: 'Administrador',      email: 'admin@sibarita.com',      pass: 'admin123', rol: 1, almacen: null },
  { nombre: 'Supervisor MALSA',   email: 'supervisor@sibarita.com', pass: 'super123', rol: 2, almacen: 1   },
  { nombre: 'Operador JOPISA',    email: 'operador@sibarita.com',   pass: 'oper123',  rol: 3, almacen: 2   },
  { nombre: 'Auditor General',    email: 'auditor@sibarita.com',    pass: 'audit123', rol: 4, almacen: null },
  { nombre: 'Transportista Juan', email: 'transporte@sibarita.com', pass: 'trans123', rol: 5, almacen: null },
]

async function crearUsuarios() {
  for (const u of usuarios) {
    const hash = await bcrypt.hash(u.pass, 10)
    await pool.query(
      'INSERT INTO usuarios (nombre, email, password, rol_id, almacen_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING',
      [u.nombre, u.email, hash, u.rol, u.almacen]
    )
    console.log('Creado:', u.email, '| pass:', u.pass)
  }
  console.log('\nTodos los usuarios creados.')
  process.exit(0)
}

crearUsuarios().catch(e => { console.error(e); process.exit(1) })
