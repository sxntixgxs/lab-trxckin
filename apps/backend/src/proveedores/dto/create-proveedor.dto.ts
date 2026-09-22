import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateProveedorDto {
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  nit!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nombre!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;
}
