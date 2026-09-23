import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { COMPANIAS_SIMULADAS } from "../src/datos/companias";
import { construirDatosSimulados } from "../src/datos/generador";
import type { SucursalSimulada, TerceroSimulado } from "../src/datos/tipos";
import { applySslMode } from "../src/prisma/connection-string-ssl.utils";

function contacto(s: SucursalSimulada) {
  return {
    f015_email: s.email,
    f015_telefono: s.telefono,
    f015_direccion1: s.direccion,
    f015_ciudad: s.ciudad,
    f015_departamento: s.departamento,
  };
}

/**
 * Loads the deterministic fake ERP data. Only inserts what is missing, so terceros created later
 * through `conectoresimportar` survive a re-run; `--reset` wipes the simulator's data first.
 */
async function seed() {
  const reset = process.argv.includes("--reset");
  const connectionString = applySslMode(
    process.env.ERP_SIM_DIRECT_URL || process.env.ERP_SIM_DATABASE_URL || "",
  );
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    if (reset) {
      await prisma.$transaction([
        prisma.importacion.deleteMany(),
        prisma.cliente.deleteMany(),
        prisma.proveedor.deleteMany(),
        prisma.tercero.deleteMany(),
        prisma.compania.deleteMany(),
      ]);
      console.log("Simulator data removed (--reset).");
    }

    await prisma.compania.createMany({
      data: COMPANIAS_SIMULADAS.map((c) => ({
        id_instancia: c.idInstancia,
        f010_id: c.cia,
        f010_razon_social: c.razonSocial,
        f010_nit: c.nit,
      })),
      skipDuplicates: true,
    });

    const terceros = construirDatosSimulados();
    const tercerosNuevos = await prisma.tercero.createMany({
      data: terceros.map((t) => ({
        id_instancia: t.idInstancia,
        f200_id_cia: t.cia,
        f200_id: t.id,
        f200_nit: t.nit,
        f200_dv_nit: t.dv,
        f200_id_tipo_ident: t.tipoIdentificacion,
        f200_ind_tipo_tercero: t.tipoTercero,
        f200_razon_social: t.razonSocial,
        f200_nombres: t.nombres,
        f200_apellido1: t.apellido1,
        f200_apellido2: t.apellido2,
        f200_ind_cliente: t.cliente.length > 0 ? 1 : 0,
        f200_ind_proveedor: t.proveedor.length > 0 ? 1 : 0,
        f200_ind_estado: t.activo ? 1 : 0,
        f200_id_ciiu: t.ciiu,
      })),
      skipDuplicates: true,
    });

    const filas = await prisma.tercero.findMany({
      select: { f200_rowid: true, id_instancia: true, f200_id_cia: true, f200_nit: true },
    });
    const rowids = new Map(filas.map((f) => [`${f.id_instancia}:${f.f200_id_cia}:${f.f200_nit}`, f.f200_rowid]));
    const rowidDe = (t: TerceroSimulado) => {
      const rowid = rowids.get(`${t.idInstancia}:${t.cia}:${t.nit}`);
      if (rowid === undefined) throw new Error(`Tercero ${t.nit} not found after insert.`);
      return rowid;
    };

    const proveedoresNuevos = await prisma.proveedor.createMany({
      data: terceros.flatMap((t) =>
        t.proveedor.map((s) => ({
          f202_rowid_tercero: rowidDe(t),
          f202_id_sucursal: s.id,
          f202_descripcion_sucursal: s.descripcion,
          f202_ind_estado: s.activa ? 1 : 0,
          f202_id_cond_pago: s.condicionPago,
          f202_id_tipo_prov: s.tipoProveedor,
          ...contacto(s),
        })),
      ),
      skipDuplicates: true,
    });

    const clientesNuevos = await prisma.cliente.createMany({
      data: terceros.flatMap((t) =>
        t.cliente.map((s) => ({
          f201_rowid_tercero: rowidDe(t),
          f201_id_sucursal: s.id,
          f201_descripcion_sucursal: s.descripcion,
          f201_ind_estado_activo: s.activa ? 1 : 0,
          f201_id_cond_pago: s.condicionPago,
          ...contacto(s),
        })),
      ),
      skipDuplicates: true,
    });

    console.log(
      `Companies: ${COMPANIAS_SIMULADAS.length}. New terceros: ${tercerosNuevos.count} of ${terceros.length}. ` +
        `New supplier branches: ${proveedoresNuevos.count}. New customer branches: ${clientesNuevos.count}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
