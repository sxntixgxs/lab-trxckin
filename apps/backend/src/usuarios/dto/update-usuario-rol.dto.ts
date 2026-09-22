import { IsInt } from "class-validator";

export class UpdateUsuarioRolDto {
  @IsInt()
  id_rol!: number;
}
