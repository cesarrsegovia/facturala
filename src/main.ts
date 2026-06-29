import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 *Arranca la app Nestjs.
 *
 * Configura tres comportamientos globales:
 * - Prefijo `/api` para todas las rutas REST.
 * - Validación automatica de DTOs (rechaza propiedades no declaradas)
 * - Documentación swagger servida en `/docs`
  
 */

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api'); //todas las rutas viven bajo /api/

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    //whitelist true:descarta campos que no esten en el DTO
    //forbid true: si mandan un campo de mas, responde 400
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Facturala API')
    .setDescription('Facturacion electronica AFIP por Whatsapp')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
