import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ADMIN_ROLE_SLUG, type AuthedRequest } from "./auth.types";
import { WorkosGuard } from "./workos.guard";
import { Roles, RolesCheckActor } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";
import { ImpersonateDto } from "./dto/impersonate.dto";
import { evaluateImpersonation } from "./impersonation";
import { serializeAuthUser, toAuthenticatedUser, USUARIO_AUTH_INCLUDE } from "./usuario-auth";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("auth")
@ApiBearerAuth()
@Controller("auth")
@UseGuards(WorkosGuard, RolesGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  me(@Req() request: AuthedRequest) {
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("No autorizado");
    }
    const impersonator = request.impersonator;
    return serializeAuthUser(user, {
      isImpersonating: Boolean(impersonator),
      originalUser: impersonator
        ? { id: impersonator.id, nombre: impersonator.nombre, email: impersonator.email }
        : null,
    });
  }

  @Post("impersonate")
  @Roles("admin")
  @RolesCheckActor()
  async impersonate(@Req() request: AuthedRequest, @Body() dto: ImpersonateDto) {
    const actor = request.impersonator ?? request.user;
    if (!actor) {
      throw new ForbiddenException("No autorizado");
    }

    const target = await this.prisma.usuario.findUnique({
      where: { id: dto.targetUserId },
      include: USUARIO_AUTH_INCLUDE,
    });

    const decision = evaluateImpersonation({
      actorIsAdmin: actor.rol.slug === ADMIN_ROLE_SLUG || actor.hasFullAccess,
      actorId: actor.id,
      target: target ? { id: target.id, activo: target.activo } : null,
    });
    if (!decision.ok) {
      if (decision.status === 403) {
        throw new ForbiddenException(decision.message);
      }
      throw new BadRequestException(decision.message);
    }

    this.logger.warn(`Impersonación iniciada por ${actor.id} hacia ${dto.targetUserId}`);
    return serializeAuthUser(toAuthenticatedUser(target!));
  }
}
