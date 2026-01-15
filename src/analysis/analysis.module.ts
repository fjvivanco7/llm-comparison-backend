import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { MetricsService } from './services/metrics.service';
import { SecurityService } from './services/security.service';
import { ExecutionService } from './services/execution.service';
import { TestGeneratorService } from './services/test-generator.service';
import { DockerExecutorService } from './services/docker-executor.service'; // ← NUEVO
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    MetricsService,
    SecurityService,
    ExecutionService,
    TestGeneratorService,
    DockerExecutorService,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}