import { timingSafeEqual } from "node:crypto";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

export function internalKeyMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) {
    // Still run a constant-time compare so a length mismatch costs the same.
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

@Injectable()
export class InternalKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.NEST_INTERNAL_KEY;
    if (!expected) {
      throw new InternalServerErrorException("NEST_INTERNAL_KEY is not configured");
    }
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers["x-internal-key"];
    if (typeof provided !== "string" || !internalKeyMatches(provided, expected)) {
      throw new UnauthorizedException("Invalid internal key");
    }
    return true;
  }
}
