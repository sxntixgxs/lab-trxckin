import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireApiSession } from "@/lib/api-route-auth";
import { convexServer, getConvexServerSecret } from "@/lib/convexServerClient";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id: storageId } = await params;

  try {
    const url = await convexServer.query(api.facturacionStorage.getUrlDesdeServidor, {
      secret: getConvexServerSecret(),
      storageId: storageId as Id<"_storage">,
    });
    if (!url) {
      return NextResponse.json(
        { error: "La respuesta de Convex no contiene una URL válida." },
        { status: 404 },
      );
    }

    const imageResponse = await fetch(url, { method: "GET", cache: "no-store" });
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: `Error al descargar el archivo desde Convex (${imageResponse.status})` },
        { status: imageResponse.status || 502 },
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get("content-type") || "application/octet-stream";
    return new Response(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Error al descargar archivo de Convex:", error);
    return NextResponse.json(
      { error: "No se pudo obtener el archivo desde Convex." },
      { status: 502 },
    );
  }
}
