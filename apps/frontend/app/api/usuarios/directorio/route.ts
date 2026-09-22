import { NextResponse } from "next/server";
import { fetchBackend, getCurrentBackendUser } from "@/lib/fetch-backend";

export async function GET(request: Request) {
  const user = await getCurrentBackendUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const search = new URL(request.url).search;
  const response = await fetchBackend(`/api/v1/usuarios/directorio${search}`);
  const body: unknown = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
