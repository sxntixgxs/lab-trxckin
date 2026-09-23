-- "Proveedor" becomes the ERP (SIESA) supplier catalog, filled only by the ERP sync. Its current
-- rows came from ingested invoices (the retired upsert-from-invoice flow) and have no company,
-- so they are removed; the first sync (pnpm --filter backend erp:sync) repopulates the table.
DELETE FROM "Proveedor";

-- DropIndex
DROP INDEX "Proveedor_nit_key";

-- DropIndex
DROP INDEX "Proveedor_nombre_idx";

-- AlterTable
ALTER TABLE "Proveedor" RENAME COLUMN "nombre" TO "razon_social";

ALTER TABLE "Proveedor"
ADD COLUMN     "id_empresa" INTEGER NOT NULL,
ADD COLUMN     "erp_tercero_id" TEXT NOT NULL,
ADD COLUMN     "dv" TEXT,
ADD COLUMN     "tipo_documento" TEXT NOT NULL,
ADD COLUMN     "tipo_persona" TEXT NOT NULL,
ADD COLUMN     "sucursal_id" TEXT NOT NULL,
ADD COLUMN     "descripcion_sucursal" TEXT NOT NULL,
ADD COLUMN     "tercero_activo" BOOLEAN NOT NULL,
ADD COLUMN     "condicion_pago" TEXT,
ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "departamento" TEXT,
ADD COLUMN     "sincronizado_en" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "erp_tercero_id" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "dv" TEXT,
    "tipo_documento" TEXT NOT NULL,
    "tipo_persona" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "descripcion_sucursal" TEXT NOT NULL,
    "tercero_activo" BOOLEAN NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "condicion_pago" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "ciudad" TEXT,
    "departamento" TEXT,
    "sincronizado_en" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SincronizacionErp" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "alcance" TEXT NOT NULL,
    "nit" TEXT,
    "origen" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "filas_leidas" INTEGER NOT NULL DEFAULT 0,
    "creadas" INTEGER NOT NULL DEFAULT 0,
    "actualizadas" INTEGER NOT NULL DEFAULT 0,
    "eliminadas" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "id_usuario" TEXT,
    "iniciada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizada_en" TIMESTAMP(3),

    CONSTRAINT "SincronizacionErp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cliente_id_empresa_razon_social_idx" ON "Cliente"("id_empresa", "razon_social");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_id_empresa_nit_sucursal_id_key" ON "Cliente"("id_empresa", "nit", "sucursal_id");

-- CreateIndex
CREATE INDEX "SincronizacionErp_id_empresa_entidad_iniciada_en_idx" ON "SincronizacionErp"("id_empresa", "entidad", "iniciada_en");

-- CreateIndex
CREATE INDEX "SincronizacionErp_estado_idx" ON "SincronizacionErp"("estado");

-- CreateIndex
CREATE INDEX "Proveedor_id_empresa_razon_social_idx" ON "Proveedor"("id_empresa", "razon_social");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_id_empresa_nit_sucursal_id_key" ON "Proveedor"("id_empresa", "nit", "sucursal_id");

-- AddForeignKey
ALTER TABLE "SincronizacionErp" ADD CONSTRAINT "SincronizacionErp_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
