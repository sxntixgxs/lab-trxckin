import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from "class-validator";

export class UpdateProcesoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  lider_user_id?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
