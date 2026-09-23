import { Module } from "@nestjs/common";
import { ErpSyncScheduler } from "./sync/erp-sync.scheduler";
import { ErpSyncService } from "./sync/erp-sync.service";

/** ERP (SIESA) integration: catalog sync (CLI, daily). */
@Module({
  providers: [ErpSyncService, ErpSyncScheduler],
})
export class ErpModule {}
