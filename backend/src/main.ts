import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");

  // Prefijo global: todas las rutas empiezan con /api
  app.setGlobalPrefix("api");

  // CORS para el frontend de Logic
  app.enableCors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  });

  // Validación global con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina propiedades no declaradas en el DTO
      forbidNonWhitelisted: true, // Lanza error si envían propiedades extra
      transform: true, // Transforma payloads al tipo del DTO
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.PORT || 4000;
  await app.listen(port, "0.0.0.0");
  logger.log(`Logic Auth Backend corriendo en 0.0.0.0:${port}`);
}

bootstrap();
