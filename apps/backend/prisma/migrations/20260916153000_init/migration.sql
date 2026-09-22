-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "workosUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "id_rol" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rol" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermisoRol" (
    "id" SERIAL NOT NULL,
    "id_rol" INTEGER NOT NULL,
    "ruta" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermisoRol_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_workosUserId_key" ON "Usuario"("workosUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_id_rol_idx" ON "Usuario"("id_rol");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_slug_key" ON "Rol"("slug");

-- CreateIndex
CREATE INDEX "PermisoRol_id_rol_idx" ON "PermisoRol"("id_rol");

-- CreateIndex
CREATE INDEX "PermisoRol_ruta_idx" ON "PermisoRol"("ruta");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoRol_id_rol_ruta_key" ON "PermisoRol"("id_rol", "ruta");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermisoRol" ADD CONSTRAINT "PermisoRol_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "Rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Rol" ("slug", "nombre", "activo", "created_at", "updated_at")
VALUES
  ('admin', 'Administrador', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('member', 'Miembro', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "PermisoRol" ("id_rol", "ruta", "activo", "created_at", "updated_at")
SELECT r.id, p.ruta, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Rol" r
CROSS JOIN (VALUES
  ('dashboard'),
  ('administracion/usuarios'),
  ('administracion/accesos'),
  ('perfil')
) AS p(ruta)
WHERE r.slug = 'admin';

INSERT INTO "PermisoRol" ("id_rol", "ruta", "activo", "created_at", "updated_at")
SELECT r.id, p.ruta, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Rol" r
CROSS JOIN (VALUES
  ('dashboard'),
  ('perfil')
) AS p(ruta)
WHERE r.slug = 'member';
