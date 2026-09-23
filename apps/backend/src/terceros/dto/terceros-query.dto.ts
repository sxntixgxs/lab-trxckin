import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { EMPRESAS_ERP } from "../../erp/erp.config";

/** App document types (apps/frontend/lib/onboarding/risk/shared.ts TIPO_DOCUMENTO_OPTIONS). */
export const TIPOS_DOCUMENTO = ["NIT", "C.C.", "C.E", "P.A."] as const;

/** GET /proveedores/search — every param the BFF forwards must be declared (forbidNonWhitelisted). */
export class BuscarProveedoresQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @Type(() => Number)
  @IsInt()
  @IsIn(EMPRESAS_ERP)
  empresa!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** GET /proveedores/existe and /clientes/existe. */
export class ExistenciaTerceroQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  documento!: string;

  @IsOptional()
  @IsIn(TIPOS_DOCUMENTO)
  tipoDocumento?: string;

  @Type(() => Number)
  @IsInt()
  @IsIn(EMPRESAS_ERP)
  empresa!: number;
}

/** GET /erp/catalogo/:entidad (admin browser). */
export class ListarCatalogoQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsIn(EMPRESAS_ERP)
  empresa!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
