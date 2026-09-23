import { timingSafeEqual } from "node:crypto";
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { SiesaHttpException } from "../siesa/errores";

export function secretoCoincide(provisto: string, esperado: string): boolean {
  const provistoBuffer = Buffer.from(provisto, "utf8");
  const esperadoBuffer = Buffer.from(esperado, "utf8");
  if (provistoBuffer.length !== esperadoBuffer.length) {
    // Still run a constant-time compare so a length mismatch costs the same.
    timingSafeEqual(esperadoBuffer, esperadoBuffer);
    return false;
  }
  return timingSafeEqual(provistoBuffer, esperadoBuffer);
}

/** SIESA Cloud authenticates every call with the ConniKey and ConniToken headers. */
@Injectable()
export class ConniGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const clave = process.env.ERP_SIM_CONNI_KEY;
    const token = process.env.ERP_SIM_CONNI_TOKEN;
    if (!clave || !token) {
      throw new SiesaHttpException(HttpStatus.INTERNAL_SERVER_ERROR, "Error", "Credenciales del simulador no configuradas");
    }
    const request = context.switchToHttp().getRequest<Request>();
    const conniKey = request.headers["connikey"];
    const conniToken = request.headers["connitoken"];
    const claveValida = typeof conniKey === "string" && secretoCoincide(conniKey, clave);
    const tokenValido = typeof conniToken === "string" && secretoCoincide(conniToken, token);
    if (!claveValida || !tokenValido) {
      throw new SiesaHttpException(HttpStatus.UNAUTHORIZED, "Error de autenticación", "ConniKey o ConniToken inválidos");
    }
    return true;
  }
}
