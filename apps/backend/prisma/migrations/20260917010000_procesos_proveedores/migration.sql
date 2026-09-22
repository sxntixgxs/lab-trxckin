-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "cargo" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "id_proceso" INTEGER;
ALTER TABLE "Usuario" ADD COLUMN "id_jefe_directo" TEXT;

-- CreateTable
CREATE TABLE "Proceso" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "lider_user_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Proveedor_nit_key" ON "Proveedor"("nit");
CREATE INDEX "Proveedor_nombre_idx" ON "Proveedor"("nombre");
CREATE INDEX "Proceso_lider_user_id_idx" ON "Proceso"("lider_user_id");
CREATE INDEX "Usuario_id_proceso_idx" ON "Usuario"("id_proceso");
CREATE INDEX "Usuario_id_jefe_directo_idx" ON "Usuario"("id_jefe_directo");

ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_id_proceso_fkey" FOREIGN KEY ("id_proceso") REFERENCES "Proceso"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_id_jefe_directo_fkey" FOREIGN KEY ("id_jefe_directo") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Proceso" ADD CONSTRAINT "Proceso_lider_user_id_fkey" FOREIGN KEY ("lider_user_id") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
