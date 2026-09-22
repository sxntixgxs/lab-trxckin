import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateUsuarioDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_rol?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cargo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_proceso?: number;

  @IsOptional()
  @IsBoolean()
  lider_proceso?: boolean;

  @IsOptional()
  @IsUUID()
  id_jefe_directo?: string;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  empresas?: number[];

  @IsOptional()
  @IsBoolean()
  acceso_todas_empresas?: boolean;
}
