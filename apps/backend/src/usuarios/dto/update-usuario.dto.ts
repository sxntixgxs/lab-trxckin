import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class UpdateUsuarioDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_rol?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(80)
  cargo?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  id_proceso?: number | null;

  @IsOptional()
  @IsBoolean()
  lider_proceso?: boolean;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  id_jefe_directo?: string | null;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  empresas?: number[];

  @IsOptional()
  @IsBoolean()
  acceso_todas_empresas?: boolean;
}
