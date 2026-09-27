import { Module } from "@nestjs/common";
import { TercerosModule } from "../terceros/terceros.module";
import { McpController } from "./mcp.controller";

@Module({
  imports: [TercerosModule],
  controllers: [McpController],
})
export class McpModule {}
