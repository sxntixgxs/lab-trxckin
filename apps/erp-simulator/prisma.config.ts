import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The simulator has its own database, separate from the app's (apps/backend). The variable
// names differ on purpose: dotenv never overrides a DATABASE_URL already in the shell, so a
// shared name could point these migrations at the app database.
//
// Prisma 7 only reads `datasource.url` here (there is no directUrl), so CLI commands
// (migrate, seed) use the direct connection when one is set. The running app connects
// through the pooled ERP_SIM_DATABASE_URL via the PrismaPg adapter (src/prisma).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.ERP_SIM_DIRECT_URL ? env("ERP_SIM_DIRECT_URL") : env("ERP_SIM_DATABASE_URL"),
  },
});
