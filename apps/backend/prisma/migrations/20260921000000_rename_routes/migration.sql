-- Rename permission route "administracion/centroCosto" -> "administracion/centro-costo".
-- Drop old rows that would collide with an existing new-route row (unique id_rol + ruta).
DELETE FROM "PermisoRol" AS old
USING "PermisoRol" AS renamed
WHERE old."ruta" = 'administracion/centroCosto'
  AND renamed."ruta" = 'administracion/centro-costo'
  AND renamed."id_rol" = old."id_rol";

UPDATE "PermisoRol"
SET "ruta" = 'administracion/centro-costo', "updated_at" = CURRENT_TIMESTAMP
WHERE "ruta" = 'administracion/centroCosto';
