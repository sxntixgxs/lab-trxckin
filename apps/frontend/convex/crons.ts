import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "facturacion-sincronizar-bandeja",
  { minutes: 2 },
  internal.facturacionGraph.sincronizarBandejaProgramada,
  {},
);

crons.interval(
  "facturacion-reprocesar-pendientes",
  { minutes: 30 },
  internal.facturacionGraph.reprocesarPendientesProgramada,
  {},
);

crons.cron(
  "facturacion-sla-digest-diario",
  "0 13 * * *",
  internal.facturacionSla.ejecutarDigestDiario,
  {},
);

crons.interval(
  "facturacion-dashboard-reconciliar",
  { hours: 6 },
  internal.facturacionDashboard.reconciliarProyecciones,
  {},
);

crons.interval(
  "anticipos-dashboard-reconciliar",
  { hours: 6 },
  internal.anticiposDashboard.reconciliarProyecciones,
  {},
);

export default crons;
