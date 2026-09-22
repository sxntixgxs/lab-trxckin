import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { Prisma } from "@prisma/client";

export function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): HttpException {
  switch (error.code) {
    case "P2002":
      return new ConflictException("Ya existe un registro con esos datos");
    case "P2003":
      return new BadRequestException("El registro relacionado no existe o está en uso");
    case "P2025":
      return new NotFoundException("Registro no encontrado");
    default:
      return new InternalServerErrorException();
  }
}

/** Maps known Prisma errors to HTTP errors instead of leaking a generic 500. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped = mapPrismaError(exception);
    if (mapped.getStatus() >= 500) {
      this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
    }
    super.catch(mapped, host);
  }
}
