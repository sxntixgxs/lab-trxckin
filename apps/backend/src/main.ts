import "dotenv/config";
import "reflect-metadata";
import { Logger, RequestMethod, ValidationPipe } from "@nestjs/common";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./common/prisma-exception.filter";
import { validateEnv } from "./config/env";

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");

  app.setGlobalPrefix("api/v1", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  app.use(helmet());
  app.enableCors({
    origin: [process.env.FRONTEND_URL ?? "http://localhost:3000"],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter));

  const swaggerEnabled =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_SWAGGER === "true";
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle("Lab Trxckin API")
      .setDescription("NestJS API for users, roles, and permissions")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api", app, document);
  }

  const port = Number(process.env.BACKEND_PORT) || 8000;
  await app.listen(port);
  logger.log(`Backend running on port ${port}`);
}

void bootstrap();
