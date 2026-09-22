-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "acceso_todas_empresas" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UsuarioEmpresa" (
    "id" SERIAL NOT NULL,
    "id_usuario" TEXT NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioEmpresa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsuarioEmpresa_id_usuario_id_empresa_key" ON "UsuarioEmpresa"("id_usuario", "id_empresa");
CREATE INDEX "UsuarioEmpresa_id_usuario_idx" ON "UsuarioEmpresa"("id_usuario");
CREATE INDEX "UsuarioEmpresa_id_empresa_idx" ON "UsuarioEmpresa"("id_empresa");

ALTER TABLE "UsuarioEmpresa" ADD CONSTRAINT "UsuarioEmpresa_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Proceso" ("nombre", "activo", "created_at", "updated_at")
SELECT 'Gestión Financiera', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Proceso"
  WHERE lower(translate("nombre", 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) LIKE '%gestion financiera%'
);
