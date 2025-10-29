// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { LlmModule } from './llm/llm.module';
import { QueriesModule } from './queries/queries.module';
import { AnalysisModule } from './analysis/analysis.module';
import { ComparisonModule } from './comparison/comparison.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    LlmModule,
    QueriesModule,
    AnalysisModule,
    ComparisonModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
