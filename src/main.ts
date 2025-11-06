import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilitar validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Habilitar CORS (para el frontend)
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    credentials: true,
  });

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('LLM Comparison API')
    .setDescription(
      'API para comparación de código generado por diferentes modelos de lenguaje (LLMs). Permite generar código, analizarlo y comparar resultados entre múltiples LLMs.',
    )
    .setVersion('1.0')
    .addTag('Authentication', 'Endpoints de autenticación y gestión de usuarios')
    .addTag('Queries', 'Gestión de consultas y generación de código')
    .addTag('LLM', 'Interacción directa con modelos de lenguaje')
    .addTag('Analysis', 'Análisis de código generado')
    .addTag('Comparison', 'Comparación entre diferentes LLMs')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Ingresa tu token JWT',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'LLM Comparison API Docs',
    customCss: `
      .swagger-ui .topbar { background-color: #667eea; }
      .swagger-ui .info .title { color: #667eea; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`
  🚀 Servidor corriendo en: http://localhost:${port}
  📚 Documentación Swagger: http://localhost:${port}/api
  `);
}
bootstrap();