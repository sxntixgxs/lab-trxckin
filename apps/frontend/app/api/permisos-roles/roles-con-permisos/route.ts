import { NextResponse } from "next/server";
import { fetchBackend, getCurrentBackendUser } from "@/lib/fetch-backend";

export async function GET() {
  const user = await getCurrentBackendUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const response = await fetchBackend("/api/v1/permisos-roles/roles-con-permisos");
  const body: unknown = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
