-- CreateTable
CREATE TABLE "t010_mm_companias" (
    "id_instancia" TEXT NOT NULL,
    "f010_id" INTEGER NOT NULL,
    "f010_razon_social" TEXT NOT NULL,
    "f010_nit" TEXT NOT NULL,
    "f010_ind_estado" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "t010_mm_companias_pkey" PRIMARY KEY ("id_instancia","f010_id")
);

-- CreateTable
CREATE TABLE "t200_mm_terceros" (
    "f200_rowid" SERIAL NOT NULL,
    "id_instancia" TEXT NOT NULL,
    "f200_id_cia" INTEGER NOT NULL,
    "f200_id" TEXT NOT NULL,
    "f200_nit" TEXT NOT NULL,
    "f200_dv_nit" TEXT,
    "f200_id_tipo_ident" TEXT NOT NULL,
    "f200_ind_tipo_tercero" INTEGER NOT NULL,
    "f200_razon_social" TEXT NOT NULL,
    "f200_nombres" TEXT,
    "f200_apellido1" TEXT,
    "f200_apellido2" TEXT,
    "f200_ind_cliente" INTEGER NOT NULL DEFAULT 0,
    "f200_ind_proveedor" INTEGER NOT NULL DEFAULT 0,
    "f200_ind_estado" INTEGER NOT NULL DEFAULT 1,
    "f200_id_ciiu" TEXT,
    "f200_fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "f200_fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t200_mm_terceros_pkey" PRIMARY KEY ("f200_rowid")
);

-- CreateTable
CREATE TABLE "t201_mm_clientes" (
    "f201_rowid_tercero" INTEGER NOT NULL,
    "f201_id_sucursal" TEXT NOT NULL,
    "f201_descripcion_sucursal" TEXT NOT NULL,
    "f201_ind_estado_activo" INTEGER NOT NULL DEFAULT 1,
    "f201_id_cond_pago" TEXT,
    "f015_email" TEXT,
    "f015_telefono" TEXT,
    "f015_direccion1" TEXT,
    "f015_ciudad" TEXT,
    "f015_departamento" TEXT,

    CONSTRAINT "t201_mm_clientes_pkey" PRIMARY KEY ("f201_rowid_tercero","f201_id_sucursal")
);

-- CreateTable
CREATE TABLE "t202_mm_proveedores" (
    "f202_rowid_tercero" INTEGER NOT NULL,
    "f202_id_sucursal" TEXT NOT NULL,
    "f202_descripcion_sucursal" TEXT NOT NULL,
    "f202_ind_estado" INTEGER NOT NULL DEFAULT 1,
    "f202_id_cond_pago" TEXT,
    "f202_id_tipo_prov" TEXT,
    "f015_email" TEXT,
    "f015_telefono" TEXT,
    "f015_direccion1" TEXT,
    "f015_ciudad" TEXT,
    "f015_departamento" TEXT,

    CONSTRAINT "t202_mm_proveedores_pkey" PRIMARY KEY ("f202_rowid_tercero","f202_id_sucursal")
);

-- CreateTable
CREATE TABLE "importaciones" (
    "id" SERIAL NOT NULL,
    "id_instancia" TEXT NOT NULL,
    "id_documento" TEXT,
    "nombre_documento" TEXT,
    "payload" JSONB NOT NULL,
    "exitosa" BOOLEAN NOT NULL,
    "resultado" JSONB NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "t200_mm_terceros_id_instancia_f200_id_cia_f200_nit_key" ON "t200_mm_terceros"("id_instancia", "f200_id_cia", "f200_nit");

-- CreateIndex
CREATE UNIQUE INDEX "t200_mm_terceros_id_instancia_f200_id_cia_f200_id_key" ON "t200_mm_terceros"("id_instancia", "f200_id_cia", "f200_id");

-- CreateIndex
CREATE INDEX "importaciones_fecha_idx" ON "importaciones"("fecha");

-- AddForeignKey
ALTER TABLE "t200_mm_terceros" ADD CONSTRAINT "t200_mm_terceros_id_instancia_f200_id_cia_fkey" FOREIGN KEY ("id_instancia", "f200_id_cia") REFERENCES "t010_mm_companias"("id_instancia", "f010_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t201_mm_clientes" ADD CONSTRAINT "t201_mm_clientes_f201_rowid_tercero_fkey" FOREIGN KEY ("f201_rowid_tercero") REFERENCES "t200_mm_terceros"("f200_rowid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t202_mm_proveedores" ADD CONSTRAINT "t202_mm_proveedores_f202_rowid_tercero_fkey" FOREIGN KEY ("f202_rowid_tercero") REFERENCES "t200_mm_terceros"("f200_rowid") ON DELETE CASCADE ON UPDATE CASCADE;
