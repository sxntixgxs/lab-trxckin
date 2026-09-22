import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { applySslMode } from "./connection-string-ssl.utils";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = applySslMode(process.env.DATABASE_URL || "");
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    const databaseUrl = process.env.DATABASE_URL ?? "";
    if (!databaseUrl || databaseUrl.includes("USER:PASSWORD") || databaseUrl.includes("HOST")) {
      this.logger.warn(
        "DATABASE_URL is a placeholder. Set a Neon connection string before using auth, users, or permissions.",
      );
      return;
    }
    await this.$connect();
    this.logger.log("Connected to Postgres");
  }
}
