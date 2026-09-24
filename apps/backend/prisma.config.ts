import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 only reads `datasource.url` here (there is no directUrl), so the CLI (migrate) uses the
// direct connection when DIRECT_URL is set: migrations through a pooler such as Neon's can fail.
// The running app connects through the pooled DATABASE_URL via the PrismaPg adapter (src/prisma).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ? env("DIRECT_URL") : env("DATABASE_URL"),
  },
});
