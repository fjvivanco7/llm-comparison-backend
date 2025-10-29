import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { OllamaProvider } from './providers/ollama.provider';

@Module({
  imports: [ConfigModule],
  controllers: [LlmController],
  providers: [LlmService, OllamaProvider],
  exports: [LlmService],
})
export class LlmModule {}
