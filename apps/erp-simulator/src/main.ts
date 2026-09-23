import "dotenv/config";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { validateEnv } from "./config/env";
import { ErroresSiesaFilter } from "./siesa/errores-siesa.filter";

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");

  // Server-to-server only (the backend calls it), so no CORS. No global prefix either: the
  // paths mirror SIESA Cloud's (/api/siesa/v3/..., /api/siesa/v3.1/...).
  app.useGlobalFilters(new ErroresSiesaFilter());

  const swaggerEnabled =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_SWAGGER === "true";
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle("ERP simulator (SIESA)")
      .setDescription("Fake SIESA Cloud API: standard queries and the tercero import connector")
      .setVersion("0.1.0")
      .addApiKey({ type: "apiKey", in: "header", name: "ConniKey" }, "ConniKey")
      .addApiKey({ type: "apiKey", in: "header", name: "ConniToken" }, "ConniToken")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docs", app, document);
  }

  const port = Number(process.env.ERP_SIM_PORT) || 8100;
  await app.listen(port);
  logger.log(`ERP simulator running on port ${port}`);
}

void bootstrap();
