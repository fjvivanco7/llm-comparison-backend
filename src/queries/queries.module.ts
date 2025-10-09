import { Module } from '@nestjs/common';
import { QueriesService } from './queries.service';
import { QueriesController } from './queries.controller';
import { LlmModule } from '../llm/llm.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    LlmModule,
  ],
  controllers: [QueriesController],
  providers: [QueriesService],
  exports: [QueriesService],
})
export class QueriesModule {}