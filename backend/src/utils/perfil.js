// "Registrado por" muestra el PERFIL de quien hizo la operacion, no el nombre
// de la cuenta (pedido del usuario 24/09): Administrador, Almacen, Compras,
// Mantenimiento. Los almaceneros se distinguen por su numero, que esta en el
// nombre de su cuenta (Almacenero 1, 2, 3), asi que para ellos va el nombre.
// u = alias de usuarios, r = alias de roles (LEFT JOIN roles r ON r.id = u.rol_id).
const perfilSql = (u, r) => `CASE ${r}.nombre
  WHEN 'admin' THEN 'Administrador'
  WHEN 'almacen' THEN 'Almacén'
  WHEN 'compras' THEN 'Compras'
  WHEN 'mantenimiento' THEN 'Mantenimiento'
  ELSE ${u}.nombre END`

module.exports = { perfilSql }
