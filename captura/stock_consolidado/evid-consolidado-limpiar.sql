-- Borra las 3 guias de evidencia EVID-CONS-01/02/03 y revierte su aporte de
-- stock al producto "Guantes de Nitrilo Talla M" (id 12). Deja la base como
-- estaba antes de generar la evidencia. NO toca ningun otro dato.
-- Correr con: psql -h localhost -U postgres -d sibarita_db -f evid-consolidado-limpiar.sql
BEGIN;

WITH g AS (SELECT id, almacen_id FROM guias WHERE numero_guia LIKE 'EVID-CONS-%'),
     gi AS (SELECT id, guia_id, producto_id, cantidad FROM guia_items WHERE guia_id IN (SELECT id FROM g)),
     e  AS (SELECT id FROM etiquetas WHERE guia_item_id IN (SELECT id FROM gi))

-- 1) revertir el aporte al inventario (bucket NUEVO), por almacen+producto
, aporte AS (
  SELECT g.almacen_id, gi.producto_id, SUM(gi.cantidad) AS q
  FROM gi JOIN g ON gi.guia_id = g.id
  GROUP BY g.almacen_id, gi.producto_id
)
UPDATE inventario i SET cantidad = GREATEST(i.cantidad - a.q, 0)
FROM aporte a
WHERE i.almacen_id = a.almacen_id AND i.producto_id = a.producto_id AND i.tipo = 'NUEVO';

-- 2) borrar historial, etiquetas, items y guias EVID-CONS-*
DELETE FROM etiqueta_historial WHERE etiqueta_id IN (
  SELECT e.id FROM etiquetas e JOIN guia_items gi ON e.guia_item_id = gi.id
  JOIN guias g ON gi.guia_id = g.id WHERE g.numero_guia LIKE 'EVID-CONS-%');
DELETE FROM etiquetas WHERE guia_item_id IN (
  SELECT gi.id FROM guia_items gi JOIN guias g ON gi.guia_id = g.id WHERE g.numero_guia LIKE 'EVID-CONS-%');
DELETE FROM guia_items WHERE guia_id IN (SELECT id FROM guias WHERE numero_guia LIKE 'EVID-CONS-%');
DELETE FROM guias WHERE numero_guia LIKE 'EVID-CONS-%';

-- 3) limpiar entradas de auditoria de esas guias de evidencia
DELETE FROM actividad_log WHERE accion = 'CREAR_GUIA' AND detalle LIKE 'Guia EVID-CONS-%';

COMMIT;
