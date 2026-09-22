import { NextResponse } from "next/server";
import { fetchBackend, getCurrentBackendUser } from "@/lib/fetch-backend";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBackendUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const payload: unknown = await request.json();
  const response = await fetchBackend(`/api/v1/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentBackendUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const response = await fetchBackend(`/api/v1/roles/${id}`, {
    method: "DELETE",
  });
  const body: unknown = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
