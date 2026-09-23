import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { EMPRESAS_ERP, ENTIDADES_ERP, leerConfigErp, type EntidadErp } from "../src/erp/erp.config";
import { SiesaClient } from "../src/erp/siesa/siesa-client";
import { SincronizadorErp } from "../src/erp/sync/sincronizador-erp";
import { applySslMode } from "../src/prisma/connection-string-ssl.utils";

/**
 * Syncs the ERP catalog from the command line (first load after migrating, or on demand):
 *   pnpm --filter backend erp:sync [--empresa 1] [--entidad proveedores|clientes]
 * Builds its own PrismaClient like prisma/seed.ts: tsx does not emit the decorator metadata
 * Nest's dependency injection needs, so this never boots the Nest app.
 */
function argumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

async function main() {
  const config = leerConfigErp();
  if (!config) {
    throw new Error("Configure ERP_BASE_URL, ERP_CONNI_KEY and ERP_CONNI_TOKEN in apps/backend/.env.");
  }

  const empresaArg = argumento("empresa");
  const empresas = empresaArg === undefined ? EMPRESAS_ERP : [Number(empresaArg)];
  if (!empresas.every((empresa) => EMPRESAS_ERP.includes(empresa))) {
    throw new Error(`--empresa must be one of ${EMPRESAS_ERP.join(", ")}.`);
  }
  const entidadArg = argumento("entidad")?.toUpperCase();
  const entidades = entidadArg === undefined ? ENTIDADES_ERP : [entidadArg as EntidadErp];
  if (!entidades.every((entidad) => ENTIDADES_ERP.includes(entidad))) {
    throw new Error("--entidad must be proveedores or clientes.");
  }

  const connectionString = applySslMode(process.env.DATABASE_URL || "");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const sincronizador = new SincronizadorErp(prisma, new SiesaClient(config));
    const resumenes = await sincronizador.sincronizar({ entidades, empresas, origen: "CLI" });
    for (const r of resumenes) {
      const detalle =
        r.estado === "EXITOSA"
          ? `${r.filasLeidas} read, ${r.creadas} created, ${r.actualizadas} updated, ${r.eliminadas} deleted`
          : (r.error ?? "");
      console.log(`${r.entidad.padEnd(11)} empresa ${r.empresa}: ${r.estado} — ${detalle}`);
    }
    if (resumenes.some((r) => r.estado === "FALLIDA")) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
