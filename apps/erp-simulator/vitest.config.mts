import { defineConfig } from "vitest/config";

// Specs cover plain functions only (parsers, projections, data generator); nothing here
// needs Nest DI or the generated Prisma client.
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "prisma/**/*.spec.ts"],
    environment: "node",
  },
});
