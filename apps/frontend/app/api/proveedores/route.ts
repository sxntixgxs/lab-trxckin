import { NextResponse } from "next/server";
import { fetchBackend, getCurrentBackendUser } from "@/lib/fetch-backend";

export async function GET() {
  const user = await getCurrentBackendUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const response = await fetchBackend("/api/v1/proveedores");
  const body: unknown = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}

export async function POST(request: Request) {
  const user = await getCurrentBackendUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const payload: unknown = await request.json();
  const response = await fetchBackend("/api/v1/proveedores", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
