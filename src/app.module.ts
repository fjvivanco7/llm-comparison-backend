import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { LlmModule } from './llm/llm.module';
import { QueriesModule } from './queries/queries.module';
import { AnalysisModule } from './analysis/analysis.module';
import { ComparisonModule } from './comparison/comparison.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';

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
    EmailModule,
    AuthModule,
    UsersModule,
    LlmModule,
    QueriesModule,
    AnalysisModule,
    ComparisonModule,
    EvaluationModule,
    AdminModule,
    NotificationsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}