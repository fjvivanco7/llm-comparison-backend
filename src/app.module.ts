import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { LlmModule } from './llm/llm.module';
import { QueriesModule } from './queries/queries.module';
import { AnalysisModule } from './analysis/analysis.module';
import { ComparisonModule } from './comparison/comparison.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module'; // ← Verificar que esté

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    PrismaModule,
    EmailModule, // ← Verificar que esté
    AuthModule,
    LlmModule,
    QueriesModule,
    AnalysisModule,
    ComparisonModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}