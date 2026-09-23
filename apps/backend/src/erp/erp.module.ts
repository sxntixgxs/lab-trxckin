import { Module } from "@nestjs/common";
import { TercerosModule } from "../terceros/terceros.module";
import { ErpSyncController } from "./erp-sync.controller";
import { ErpTercerosController } from "./erp-terceros.controller";
import { ErpTercerosService } from "./erp-terceros.service";
import { ErpSyncScheduler } from "./sync/erp-sync.scheduler";
import { ErpSyncService } from "./sync/erp-sync.service";

/** ERP (SIESA) integration: catalog sync (manual, CLI, daily) and "Crear en ERP". */
@Module({
  imports: [TercerosModule],
  controllers: [ErpSyncController, ErpTercerosController],
  providers: [ErpSyncService, ErpSyncScheduler, ErpTercerosService],
})
export class ErpModule {}
