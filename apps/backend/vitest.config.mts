import { defineConfig } from "vitest/config";

// Specs only cover plain functions today. If a spec ever needs Nest DI with
// decorator metadata, add unplugin-swc here (esbuild does not emit it).
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "scripts/**/*.spec.ts", "prisma/**/*.spec.ts"],
    environment: "node",
  },
});
