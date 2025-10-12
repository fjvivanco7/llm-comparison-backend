import { Module } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { MetricsService } from './services/metrics.service';
import { SecurityService } from './services/security.service';
import { ExecutionService } from './services/execution.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    MetricsService,
    SecurityService,
    ExecutionService,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}