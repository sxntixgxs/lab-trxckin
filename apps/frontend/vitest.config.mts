import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
  },
  test: {
    env: {
      // Shared secret used by server-to-Convex calls (see convex/lib/auth.ts).
      CONVEX_SERVER_SECRET: "test-convex-server-secret",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        extends: true,
        test: {
          name: "app",
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["convex/**", "node_modules/**", ".next/**"],
          environment: "node",
        },
      },
    ],
  },
});
