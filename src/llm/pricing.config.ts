/**
 * Tarifas oficiales de OpenRouter (USD por millón de tokens)
 * Fuentes:
 * - https://openrouter.ai/anthropic/claude-3.5-sonnet
 * - https://openrouter.ai/openai/gpt-4o
 * - https://openrouter.ai/google/gemini-2.5-pro
 * - https://openrouter.ai/mistralai/mistral-large
 *
 * Última actualización: Enero 2026
 */

export interface ModelPricing {
  inputPricePerMillion: number;  // USD por 1M tokens de entrada
  outputPricePerMillion: number; // USD por 1M tokens de salida
}

export const OPENROUTER_PRICING: Record<string, ModelPricing> = {
  // Claude 3.5 Sonnet
  'anthropic/claude-3.5-sonnet': {
    inputPricePerMillion: 6.00,
    outputPricePerMillion: 30.00,
  },
  'claude-3.5-sonnet': {
    inputPricePerMillion: 6.00,
    outputPricePerMillion: 30.00,
  },

  // GPT-4o
  'openai/gpt-4': {
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
  },
  'gpt-4': {
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
  },
  'gpt-4o': {
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
  },

  // Gemini 2.5 Pro
  'google/gemini-2.5-pro': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.00,
  },
  'gemini-pro': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.00,
  },
  'gemini-2.5-pro': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.00,
  },

  // Mistral Large
  'mistralai/mistral-large': {
    inputPricePerMillion: 2.00,
    outputPricePerMillion: 6.00,
  },
  'mistral-large': {
    inputPricePerMillion: 2.00,
    outputPricePerMillion: 6.00,
  },
};

/**
 * Calcula el costo estimado basado en tokens consumidos
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = OPENROUTER_PRICING[model];

  if (!pricing) {
    // Si no tenemos el pricing del modelo, retornar 0
    return 0;
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPricePerMillion;

  return inputCost + outputCost;
}
