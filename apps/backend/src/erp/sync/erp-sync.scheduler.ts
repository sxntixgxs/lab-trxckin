import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { leerConfigSyncProgramada } from "../erp.config";
import { ErpSyncService } from "./erp-sync.service";

const NOMBRE_TAREA = "erp-sync";

/**
 * Daily ERP sync, registered at startup so its schedule comes from the environment
 * (ERP_SYNC_CRON, ERP_SYNC_TZ; ERP_SYNC_PROGRAMADA=false turns it off). With several backend
 * instances each one runs it; the sync's advisory lock makes the extra runs skip.
 */
@Injectable()
export class ErpSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger("ErpSyncScheduler");

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly sync: ErpSyncService,
  ) {}

  onModuleInit() {
    const config = leerConfigSyncProgramada();
    if (!config.habilitada) {
      this.logger.log("Scheduled ERP sync disabled (ERP_SYNC_PROGRAMADA=false).");
      return;
    }
    if (!this.sync.configurado) {
      this.logger.warn("ERP not configured; the daily sync is not scheduled.");
      return;
    }

    const tarea = CronJob.from({
      cronTime: config.cron,
      timeZone: config.zonaHoraria,
      start: false,
      waitForCompletion: true,
      onTick: async () => {
        try {
          const resumenes = await this.sync.sincronizarTodo("PROGRAMADA");
          const fallidas = resumenes.filter((resumen) => resumen.estado === "FALLIDA").length;
          this.logger.log(`Scheduled ERP sync finished: ${resumenes.length} runs, ${fallidas} failed.`);
        } catch (error) {
          this.logger.error(`Scheduled ERP sync failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    });
    this.registry.addCronJob(NOMBRE_TAREA, tarea);
    tarea.start();
    this.logger.log(`Daily ERP sync scheduled: "${config.cron}" (${config.zonaHoraria}).`);
  }
}
