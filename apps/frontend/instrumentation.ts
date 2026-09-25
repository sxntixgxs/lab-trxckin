import { workosEnvProblems } from "@/lib/workos-env";

/** Runs once when the server starts: `next dev`, `next start` and the Docker image. */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  for (const problem of workosEnvProblems()) {
    console.error(`[config] ${problem} Sign-in fails until it's fixed.`);
  }
}
