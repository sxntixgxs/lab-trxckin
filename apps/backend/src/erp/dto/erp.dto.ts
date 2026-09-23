import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
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
