import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { internalKeyMatches } from "../auth/internal-key.guard";

/**
 * `x-mcp-key` must match `MCP_READ_KEY`. The key only unlocks the read-only routes under /mcp;
 * it is not a user session and grants no permission anywhere else.
 */
@Injectable()
export class McpReadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.MCP_READ_KEY;
    if (!expected) {
      throw new ServiceUnavailableException("MCP_READ_KEY is not configured");
    }
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers["x-mcp-key"];
    if (typeof provided !== "string" || !internalKeyMatches(provided, expected)) {
      throw new UnauthorizedException("Invalid MCP key");
    }
    return true;
  }
}
