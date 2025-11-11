import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';

@Module({
  imports: [ConfigModule],
  controllers: [LlmController],
  providers: [LlmService, OllamaProvider, OpenRouterProvider],
  exports: [LlmService],
})
export class LlmModule {}
