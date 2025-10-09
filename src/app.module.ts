// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Configuración de variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Módulo de base de datos
    PrismaModule,
    
    // TODO: Aquí agregaremos los otros módulos en Sprint 3
    // QueriesModule,
    // LlmModule,
    // AnalysisModule,
    // ComparisonModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}