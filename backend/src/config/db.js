const { Pool } = require('pg')
require('dotenv').config()

const base = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }

const pool = new Pool({
  ...base,
  // Recomendacion 1 (prueba de estres): antes el pool usaba los valores por
  // defecto (max 10, sin timeouts) y un pico de peticiones concurrentes lo
  // dejaba tildado para siempre. Ahora:
  max: 20,                       // conexiones simultaneas a Postgres
  connectionTimeoutMillis: 5000, // si en 5s no hay conexion libre, la peticion
                                 // falla con error claro en vez de colgarse
  idleTimeoutMillis: 30000,      // cierra conexiones ociosas a los 30s
  statement_timeout: 20000,      // Postgres aborta cualquier consulta > 20s
  lock_timeout: 8000,            // Postgres aborta una consulta que lleve 8s
                                 // esperando un candado -> rompe el cuello de
                                 // botella cuando varias guias tocan el mismo
                                 // producto/inventario a la vez
  idle_in_transaction_session_timeout: 15000, // corta transacciones abandonadas
})

// Un error en una conexion ociosa del pool no debe tumbar el proceso.
pool.on('error', (err) => {
  console.error('Error inesperado en conexion ociosa del pool:', err.message)
})

pool.connect()
  .then(client => { client.release(); console.log('PostgreSQL conectado') })
  .catch(err => console.error('Error de conexion:', err.message))

module.exports = pool
