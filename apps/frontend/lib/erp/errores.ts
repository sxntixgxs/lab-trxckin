/** Readable message from a Nest error body (`{ message }` or `{ message: string[] }`) or a Convex error. */
export function mensajeDeError(error: unknown, porDefecto: string): string {
  if (typeof error === "object" && error !== null) {
    const registro = error as Record<string, unknown>;
    const data = registro.data as Record<string, unknown> | undefined;
    if (data && typeof data.message === "string") return data.message;
    const mensaje = registro.message ?? registro.error;
    if (Array.isArray(mensaje)) return mensaje.join("; ");
    if (typeof mensaje === "string" && mensaje.trim()) {
      const uncaught = /Uncaught (?:Convex)?Error:\s*([^]*?)(?:\s+at handler|$)/.exec(mensaje);
      return (uncaught?.[1] ?? mensaje)
        .replace(/^\[CONVEX[^\]]*\]\s*/, "")
        .replace(/\[Request ID:[^\]]+\]\s*/, "")
        .trim();
    }
  }
  return porDefecto;
}
