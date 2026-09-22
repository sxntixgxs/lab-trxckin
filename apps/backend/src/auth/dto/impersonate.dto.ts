import { IsUUID } from "class-validator";

export class ImpersonateDto {
  @IsUUID()
  targetUserId!: string;
}
