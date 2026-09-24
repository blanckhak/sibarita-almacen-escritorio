// Periodos (abrir, cerrar, ver periodos anteriores) son cosa de admin y del
// perfil almacen. Los almaceneros (1, 2, 3), mantenimiento y compras trabajan
// siempre sobre el periodo activo de su almacen: no ven la pagina Periodos ni
// el filtro de periodo de Guias / Notas de Salida / Notas de Desuso.
// El backend aplica lo mismo en routes/periodos.js.
export const ROLES_PERIODOS = ['admin', 'almacen']

export const puedeVerPeriodos = (usuario) => ROLES_PERIODOS.includes(usuario?.rol)
