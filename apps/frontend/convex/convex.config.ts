import aggregate from "@convex-dev/aggregate/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    FACTURACION_SLA_DIGEST_SECRET: v.optional(v.string()),
    FACTURACION_SLA_DIGEST_DRY_RUN: v.optional(v.string()),
    NOTIFICATIONS_INTERNAL_KEY: v.optional(v.string()),
    FRONTEND_URL: v.optional(v.string()),
    NEXT_PUBLIC_BASE_URL: v.optional(v.string()),
    ENABLE_BACKGROUND_JOBS: v.optional(v.string()),
    CONVEX_SERVER_SECRET: v.optional(v.string()),
    DEFAULT_CONTACT_EMAIL: v.optional(v.string()),
    FACTURACION_GRAPH_MAILBOXES: v.optional(v.string()),
  },
});

app.use(aggregate, { name: "cajaMenorMovimientosDisponibles" });
app.use(aggregate, { name: "cajaMenorReembolsosActivosCaja" });
app.use(aggregate, { name: "cajaMenorReembolsosActivosResponsable" });
app.use(aggregate, { name: "cajaMenorReembolsosActivosCustodio" });

export default app;
