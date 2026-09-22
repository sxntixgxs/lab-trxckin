import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateProcesoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre!: string;

  @IsOptional()
  @IsUUID()
  lider_user_id?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
