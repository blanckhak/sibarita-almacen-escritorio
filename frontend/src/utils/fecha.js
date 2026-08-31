// Fecha de hoy como 'YYYY-MM-DD' en hora LOCAL. new Date().toISOString() da la
// fecha en UTC, que en zonas al oeste de Greenwich (ej. Guatemala, UTC-6) ya
// rodo al dia siguiente durante la tarde/noche -> el <input type="date"> del
// formulario saldria pre-cargado con la fecha equivocada.
export const hoyLocal = () => {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}
