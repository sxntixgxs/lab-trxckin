import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  getInscripcion,
  normalizeNumeroDocumento,
  type InscripcionDoc,
  type InscripcionRef,
} from "./refs";

export type TokenScope = "FORM" | "SIGN";
export type RevokedReason = Doc<"onboardingAccessTokens">["revokedReason"] & string;

export const TOKEN_TTL_MS: Record<TokenScope, number> = {
  FORM: 30 * 86_400_000,
  SIGN: 14 * 86_400_000,
};
/** Enlaces de solo lectura (visor interno del formato). */
export const VIEW_TOKEN_TTL_MS = 2 * 3_600_000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 32 bytes aleatorios en base64url (43 caracteres). */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(digest);
}

async function activeTokens(ctx: QueryCtx | MutationCtx, ref: InscripcionRef, scope: TokenScope) {
  const rows = await ctx.db
    .query("onboardingAccessTokens")
    .withIndex("by_modulo_inscripcionId_scope", (q) =>
      q.eq("modulo", ref.modulo).eq("inscripcionId", ref.inscripcionId).eq("scope", scope),
    )
    .take(100);
  return rows.filter((row) => row.revokedAt === undefined);
}

/**
 * Inserta un token nuevo (hash) y programa su expiración. Con `rotate` revoca antes los
 * tokens activos del mismo alcance (ROTATED). Devuelve el token en claro una única vez.
 */
export async function issueToken(
  ctx: MutationCtx,
  args: InscripcionRef & {
    scope: TokenScope;
    issuedByUserId?: string;
    correoId?: Id<"onboardingCorreos">;
    viewOnly?: boolean;
    ttlMs?: number;
    /** Revoca los tokens activos del mismo alcance (reenvío con corrección, devolución de fase). */
    rotate?: boolean;
  },
): Promise<{ token: string; tokenId: Id<"onboardingAccessTokens">; expiresAt: number }> {
  const now = Date.now();
  if (args.rotate && !args.viewOnly) {
    for (const row of await activeTokens(ctx, args, args.scope)) {
      if (row.viewOnly) continue;
      await ctx.db.patch("onboardingAccessTokens", row._id, { revokedAt: now, revokedReason: "ROTATED" });
    }
  }
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const ttl = args.ttlMs ?? (args.viewOnly ? VIEW_TOKEN_TTL_MS : TOKEN_TTL_MS[args.scope]);
  const expiresAt = now + ttl;
  const common = {
    scope: args.scope,
    tokenHash,
    createdAt: now,
    expiresAt,
    issuedByUserId: args.issuedByUserId,
    correoId: args.correoId,
    viewOnly: args.viewOnly ? true : undefined,
  };
  const tokenId =
    args.modulo === "supplier"
      ? await ctx.db.insert("onboardingAccessTokens", { modulo: "supplier", inscripcionId: args.inscripcionId, ...common })
      : await ctx.db.insert("onboardingAccessTokens", { modulo: "customer", inscripcionId: args.inscripcionId, ...common });
  await ctx.scheduler.runAt(expiresAt, internal.onboarding.tokens.expireToken, { tokenId });
  return { token, tokenId, expiresAt };
}

/** Revoca todos los tokens activos de la inscripción (opcionalmente de un solo alcance). */
export async function revokeTokens(
  ctx: MutationCtx,
  args: InscripcionRef & { scope?: TokenScope; reason: RevokedReason },
): Promise<number> {
  const now = Date.now();
  const scopes: TokenScope[] = args.scope ? [args.scope] : ["FORM", "SIGN"];
  let count = 0;
  for (const scope of scopes) {
    for (const row of await activeTokens(ctx, args, scope)) {
      await ctx.db.patch("onboardingAccessTokens", row._id, { revokedAt: now, revokedReason: args.reason });
      count += 1;
    }
  }
  return count;
}

export class TokenInvalidoError extends Error {
  constructor(message = "El enlace no es válido o ha vencido. Solicite un nuevo enlace.") {
    super(message);
    this.name = "TokenInvalidoError";
  }
}

/**
 * Guardia de las funciones públicas. Verifica que el token pertenezca a la inscripción,
 * tenga uno de los alcances admitidos y no esté revocado. En mutaciones también verifica
 * la expiración con el reloj (las queries dependen de la expiración materializada por
 * `expireToken`). Devuelve la inscripción y la fila del token.
 */
export async function requireOnboardingToken(
  ctx: QueryCtx | MutationCtx,
  args: InscripcionRef & {
    token: string;
    scopes: readonly TokenScope[];
    /** true en mutaciones: valida `expiresAt` y actualiza `lastUsedAt`. */
    mutation?: boolean;
    /** Los enlaces de solo lectura solo sirven para consultar. */
    allowViewOnly?: boolean;
  },
): Promise<{ inscripcion: InscripcionDoc; tokenRow: Doc<"onboardingAccessTokens"> }> {
  const token = args.token?.trim();
  if (!token || token.length < 16 || token.length > 128) throw new TokenInvalidoError();
  const tokenHash = await hashToken(token);
  const row = await ctx.db
    .query("onboardingAccessTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!row) throw new TokenInvalidoError();
  if (row.modulo !== args.modulo || row.inscripcionId !== args.inscripcionId) throw new TokenInvalidoError();
  if (!args.scopes.includes(row.scope)) throw new TokenInvalidoError();
  if (row.revokedAt !== undefined) throw new TokenInvalidoError();
  if (row.viewOnly && !args.allowViewOnly) throw new TokenInvalidoError();
  if (args.mutation) {
    const now = Date.now();
    if (now >= row.expiresAt) throw new TokenInvalidoError();
    await (ctx as MutationCtx).db.patch("onboardingAccessTokens", row._id, { lastUsedAt: now });
  }
  const inscripcion = await getInscripcion(ctx, args);
  if (!inscripcion) throw new TokenInvalidoError();
  return { inscripcion, tokenRow: row };
}

/** Segunda verificación: tipo y número de documento deben coincidir con la inscripción. */
export function assertDocumentoCoincide(
  ins: InscripcionDoc,
  tipoDocumento: string,
  numeroDocumento: string,
): void {
  const d = ins.datos_generales_01;
  if (
    d.tipoDocumento !== tipoDocumento ||
    normalizeNumeroDocumento(d.numeroDocumento) !== normalizeNumeroDocumento(numeroDocumento)
  ) {
    throw new Error("El tipo o número de documento no coincide con la inscripción.");
  }
}
