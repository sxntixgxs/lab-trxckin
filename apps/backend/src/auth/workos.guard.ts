import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ADMIN_ROLE_SLUG, type AuthedRequest } from "./auth.types";
import { IMPERSONATE_HEADER, shouldApplyImpersonationHeader } from "./impersonation";
import { toAuthenticatedUser, USUARIO_AUTH_INCLUDE } from "./usuario-auth";

type UsuarioAuth = Prisma.UsuarioGetPayload<{ include: typeof USUARIO_AUTH_INCLUDE }>;

type WorkosRemoteUser = {
  email?: string;
  email_verified?: boolean;
  first_name?: string | null;
  last_name?: string | null;
};

@Injectable()
export class WorkosGuard implements CanActivate {
  private readonly logger = new Logger(WorkosGuard.name);
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException("Not authenticated");
    }

    const payload = await this.verifyToken(token);
    const workosUserId = payload.sub;
    if (!workosUserId) {
      throw new UnauthorizedException("Invalid token");
    }

    const usuario = await this.resolveUsuario(workosUserId, payload);
    if (!usuario.activo) {
      throw new UnauthorizedException("User is inactive");
    }
    if (!usuario.rol.activo) {
      throw new ForbiddenException("Tu rol está inactivo");
    }

    const actor = toAuthenticatedUser(usuario);
    request.user = actor;

    const impersonateTargetId = request.headers[IMPERSONATE_HEADER];
    const header =
      typeof impersonateTargetId === "string"
        ? impersonateTargetId
        : Array.isArray(impersonateTargetId)
          ? impersonateTargetId[0]
          : undefined;

    if (shouldApplyImpersonationHeader(actor.rol.slug === ADMIN_ROLE_SLUG, header)) {
      const targetId = header!.trim();
      if (targetId === actor.id) {
        throw new BadRequestException("No puedes impersonarte a ti mismo");
      }

      const target = await this.prisma.usuario.findUnique({
        where: { id: targetId },
        include: USUARIO_AUTH_INCLUDE,
      });
      if (!target?.activo || !target.rol.activo) {
        throw new BadRequestException("El usuario objetivo no está disponible");
      }

      request.impersonator = actor;
      request.user = toAuthenticatedUser(target);
    }

    return true;
  }

  private loadUsuario(where: { workosUserId: string } | { email: string }) {
    return this.prisma.usuario.findUnique({ where, include: USUARIO_AUTH_INCLUDE });
  }

  /**
   * The happy path — an existing user whose JWT already carries its claims — is a
   * single SELECT. The WorkOS lookup and the `member` role lookup only run on the
   * link/create paths that actually need them, and we only UPDATE when a claim
   * really changed, so a plain GET no longer writes to the database.
   */
  private async resolveUsuario(
    workosUserId: string,
    payload: JWTPayload,
  ): Promise<UsuarioAuth> {
    const claims = this.profileFromClaims(payload);

    const existing = await this.loadUsuario({ workosUserId });
    if (existing) {
      return this.refreshIfStale(existing, claims);
    }

    // No row for this WorkOS id, so we need a real email to link or create. This
    // is the rare first-login path, so one WorkOS API call here is acceptable.
    const remote = await this.fetchWorkosUser(workosUserId);
    const profile = this.resolveProfile(workosUserId, claims, remote);
    const email = profile.email.trim().toLowerCase();
    const nombre = profile.nombre;

    const existingByEmail = email ? await this.loadUsuario({ email }) : null;
    if (existingByEmail) {
      // Linking a new WorkOS identity to a pre-provisioned row by email is an
      // account-takeover vector unless WorkOS has verified that email.
      if (!this.isEmailVerified(email, payload, remote)) {
        this.logger.warn(
          `Rechazado enlace por email para ${workosUserId}: el correo no está verificado`,
        );
        throw new ForbiddenException("Verifica tu correo electrónico antes de ingresar");
      }
      return this.prisma.usuario.update({
        where: { id: existingByEmail.id },
        data: {
          workosUserId,
          email,
          ...(nombre ? { nombre } : {}),
        },
        include: USUARIO_AUTH_INCLUDE,
      });
    }

    const memberRole = await this.prisma.rol.findUnique({ where: { slug: "member" } });
    if (!memberRole) {
      throw new InternalServerErrorException("Los roles no están inicializados");
    }

    return this.prisma.usuario.create({
      data: { workosUserId, email, nombre, id_rol: memberRole.id },
      include: USUARIO_AUTH_INCLUDE,
    });
  }

  /**
   * AuthKit access tokens usually carry no email claims, so the verified flag
   * normally comes from the WorkOS User object (`email_verified`). A token-level
   * `email_verified: true` is honoured only when it refers to the same email.
   */
  private isEmailVerified(
    email: string,
    payload: JWTPayload,
    remote: WorkosRemoteUser | null,
  ): boolean {
    const claimEmail = this.stringClaim(payload, ["email"])?.toLowerCase();
    if (payload.email_verified === true && claimEmail === email) {
      return true;
    }
    return remote?.email_verified === true && remote.email?.trim().toLowerCase() === email;
  }

  private async refreshIfStale(
    usuario: UsuarioAuth,
    claims: { email?: string; nombre?: string },
  ): Promise<UsuarioAuth> {
    const email = claims.email?.trim().toLowerCase();
    const nombre = claims.nombre?.trim();
    const nextEmail = email && email !== usuario.email ? email : undefined;
    const nextNombre = nombre && nombre !== usuario.nombre ? nombre : undefined;

    if (!nextEmail && !nextNombre) {
      return usuario;
    }

    return this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        ...(nextEmail ? { email: nextEmail } : {}),
        ...(nextNombre ? { nombre: nextNombre } : {}),
      },
      include: USUARIO_AUTH_INCLUDE,
    });
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return null;
    }
    return header.slice("Bearer ".length).trim();
  }

  private requireClientId(): string {
    const clientId = process.env.WORKOS_CLIENT_ID;
    if (!clientId) {
      throw new InternalServerErrorException("WORKOS_CLIENT_ID is not configured");
    }
    return clientId;
  }

  private getJwks() {
    const clientId = this.requireClientId();
    if (!this.jwks) {
      this.jwks = createRemoteJWKSet(
        new URL(`https://api.workos.com/sso/jwks/${clientId}`),
      );
    }
    return this.jwks;
  }

  private async verifyToken(token: string): Promise<JWTPayload> {
    const clientId = this.requireClientId();
    const jwks = this.getJwks();

    const issuers = [
      "https://api.workos.com/",
      `https://api.workos.com/user_management/${clientId}`,
    ];

    let lastError: unknown;
    for (const issuer of issuers) {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience: issuer === "https://api.workos.com/" ? clientId : undefined,
        });
        return payload;
      } catch (error) {
        lastError = error;
      }
    }

    // Never echo jose's error text to the client; keep it in the logs only.
    this.logger.debug(
      `Token rechazado: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
    throw new UnauthorizedException("Invalid token");
  }

  private profileFromClaims(payload: JWTPayload): { email?: string; nombre?: string } {
    const email = this.stringClaim(payload, ["email"]);
    const nombre =
      this.stringClaim(payload, ["name"]) ??
      [
        this.stringClaim(payload, ["first_name", "given_name"]),
        this.stringClaim(payload, ["last_name", "family_name"]),
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    return { email, nombre: nombre || undefined };
  }

  private resolveProfile(
    workosUserId: string,
    claims: { email?: string; nombre?: string },
    remote: WorkosRemoteUser | null,
  ): { email: string; nombre: string } {
    const email = claims.email ?? remote?.email;
    const remoteName = [remote?.first_name, remote?.last_name].filter(Boolean).join(" ").trim();
    const nombre = claims.nombre || remoteName || remote?.email || "";

    return {
      email: email ?? `${workosUserId}@users.workos.local`,
      nombre: nombre || email || "Usuario",
    };
  }

  private async fetchWorkosUser(workosUserId: string): Promise<WorkosRemoteUser | null> {
    const apiKey = process.env.WORKOS_API_KEY;
    if (!apiKey) {
      return null;
    }

    try {
      const response = await fetch(
        `https://api.workos.com/user_management/users/${encodeURIComponent(workosUserId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!response.ok) {
        this.logger.warn(`WorkOS user lookup failed (${response.status}) for ${workosUserId}`);
        return null;
      }
      return (await response.json()) as WorkosRemoteUser;
    } catch (error) {
      this.logger.warn(
        `WorkOS user lookup error for ${workosUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private stringClaim(payload: JWTPayload, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }
}
