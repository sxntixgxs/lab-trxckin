import { NextResponse } from "next/server";

/** Liveness probe for the container healthcheck (docker-compose.coolify.yml). No auth, no I/O. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
