import { NextResponse } from "next/server";
import { fetchBackend, getCurrentBackendUser } from "@/lib/fetch-backend";

export async function GET(request: Request) {
  const user = await getCurrentBackendUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const incoming = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  const q = incoming.get("q") ?? incoming.get("nit") ?? "";
  if (q) params.set("q", q);
  for (const key of ["empresa", "pageSize", "maxPages", "limit"]) {
    const value = incoming.get(key);
    if (value) params.set(key, value);
  }
  const response = await fetchBackend(`/api/v1/proveedores/search?${params.toString()}`);
  const body: unknown = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
