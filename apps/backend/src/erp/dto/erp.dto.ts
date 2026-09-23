import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { TIPOS_DOCUMENTO } from "../../terceros/dto/terceros-query.dto";
import { EMPRESAS_ERP, ENTIDADES_ERP, type EntidadErp } from "../erp.config";

/** POST /erp/sincronizaciones: both optional; omitted means every catalog / every allowed company. */
export class IniciarSincronizacionDto {
  @IsOptional()
  @IsIn(ENTIDADES_ERP)
  entidad?: EntidadErp;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(EMPRESAS_ERP)
  empresa?: number;
}

export class ListarSincronizacionesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(EMPRESAS_ERP)
  empresa?: number;
}

/**
 * POST /erp/terceros: registers an onboarded tercero in the ERP. Sent by the Next BFF with data it
 * read from Convex (never from the browser), after checking the onboarding permissions there.
 */
export class CrearTerceroErpDto {
  @IsIn(["PROVEEDOR", "CLIENTE"])
  entidad!: "PROVEEDOR" | "CLIENTE";

  @Type(() => Number)
  @IsInt()
  @IsIn(EMPRESAS_ERP)
  empresa!: number;

  @IsIn(TIPOS_DOCUMENTO)
  tipoDocumento!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(30)
  numeroDocumento!: string;

  @IsIn(["PERSONA_JURIDICA", "PERSONA_NATURAL"])
  tipoPersona!: "PERSONA_JURIDICA" | "PERSONA_NATURAL";

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  razonSocial!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ciudad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  departamento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  codigoCiiu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  formaPago?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  plazo?: string;
}
