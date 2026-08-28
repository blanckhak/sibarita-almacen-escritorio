// Sibarita no tiene catalogo de proveedores (es texto libre, ver comentario
// en database.sql sobre guias.proveedor) -> la lista de "conocidos" se arma
// con los valores ya usados en guias anteriores, para no perder la
// flexibilidad de escribir uno nuevo.
export function extraerProveedoresConocidos(guias) {
  const nombres = guias.map(g => g.proveedor).filter(Boolean)
  return [...new Set(nombres)].sort((a, b) => a.localeCompare(b, 'es'))
}
