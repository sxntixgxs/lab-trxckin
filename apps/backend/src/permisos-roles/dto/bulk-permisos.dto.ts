import { Type } from "class-transformer";
import { ArrayUnique, IsArray, IsInt, IsString } from "class-validator";

export class BulkPermisosDto {
  @Type(() => Number)
  @IsInt()
  id_rol!: number;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permisos!: string[];
}
