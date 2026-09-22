import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class CreateRolDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  nombre!: string;
}
