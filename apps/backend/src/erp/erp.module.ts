import { Module } from "@nestjs/common";
import { ErpSyncController } from "./erp-sync.controller";
import { ErpSyncScheduler } from "./sync/erp-sync.scheduler";
import { ErpSyncService } from "./sync/erp-sync.service";

/** ERP (SIESA) integration: catalog sync (manual, CLI, daily). */
@Module({
  controllers: [ErpSyncController],
  providers: [ErpSyncService, ErpSyncScheduler],
})
export class ErpModule {}
