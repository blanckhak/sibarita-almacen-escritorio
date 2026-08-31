// Valida que ningun campo de texto libre supere el largo de su columna VARCHAR.
// Antes, un valor mas largo que la columna llegaba al INSERT/UPDATE y Postgres
// tiraba un error que el catch devolvia como 500 generico; ahora se corta antes
// con un 400 claro. El maxLength del <input> ya lo frena en la UI, esto cubre
// las llamadas directas a la API.
//
// `campos`: objeto { 'nombre visible del campo': [valor, maxCaracteres], ... }.
// Devuelve el primer mensaje de error (string) o null si esta todo bien.
// Solo mira strings: null/undefined/otros tipos los valida cada ruta por su lado.
function validarLargos(campos) {
  for (const etiqueta of Object.keys(campos)) {
    const [valor, max] = campos[etiqueta]
    if (typeof valor === 'string' && valor.trim().length > max) {
      return `El campo "${etiqueta}" no puede tener mas de ${max} caracteres`
    }
  }
  return null
}

module.exports = { validarLargos }
