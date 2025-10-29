/**
 * Interfaz que TODOS los providers de LLM deben implementar
 * Esto garantiza que Ollama, OpenRouter, o cualquier otro
 * tengan los mismos métodos
 */
export interface ILlmProvider {
  /**
   * Genera código basado en un prompt
   * @param model - Nombre del modelo a usar (ej: 'codellama', 'gpt-4')
   * @param prompt - El prompt del usuario
   * @returns El código generado como string
   */
  generateCode(model: string, prompt: string): Promise<string>;

  /**
   * Verifica si el provider está disponible
   * @returns true si el servicio responde correctamente
   */
  healthCheck(): Promise<boolean>;

  /**
   * Obtiene la lista de modelos disponibles
   * @returns Array con los nombres de los modelos
   */
  getAvailableModels(): Promise<string[]>;
}
