import { Injectable, Logger } from '@nestjs/common';
import { ESLint } from 'eslint';
import pluginSecurity from 'eslint-plugin-security';

export interface SecurityIssue {
  type: 'xss' | 'injection' | 'secrets' | 'unsafe';
  severity: 'low' | 'medium' | 'high' | 'critical';
  lineNumber?: number;
  message: string;
  pattern?: string;
}

export interface SecurityAnalysis {
  xssVulnerabilities: number;
  injectionVulnerabilities: number;
  hardcodedSecrets: number;
  unsafeOperations: number;
  issues: SecurityIssue[];
  securityScore: number;
}

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private eslint: ESLint;

  constructor() {
    this.eslint = new ESLint({
      overrideConfig: [
        {
          languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'module',
            globals: {
              require: 'readonly',
              module: 'readonly',
              process: 'readonly',
              __dirname: 'readonly',
            },
          },
          plugins: {
            security: pluginSecurity,
          },
          rules: {
            ...pluginSecurity.configs.recommended.rules,
          },
        },
      ],
    });
  }

  /**
   * Analiza vulnerabilidades de seguridad en el código
   */
  async analyzeSecurityIssues(code: string): Promise<SecurityAnalysis> {
    try {
      this.logger.log('Analizando seguridad del código...');

      let eslintIssues: SecurityIssue[] = [];

      // Análisis con ESLint (con manejo de errores específico)
      try {
        const eslintResults = await this.eslint.lintText(code, {
          filePath: 'temp-code.js', // Nombre ficticio para evitar error de placeholder
        });
        eslintIssues = this.parseESLintResults(eslintResults);
      } catch (eslintError) {
        // Si ESLint falla, solo logear pero continuar
        this.logger.warn(
          `ESLint falló, continuando con análisis regex: ${eslintError.message}`,
        );
      }

      // Análisis con regex patterns (siempre funciona)
      const regexAnalysis = this.analyzeWithPatterns(code);
      const regexIssues = regexAnalysis.issues;

      // Combinar resultados
      const allIssues = [...eslintIssues, ...regexIssues];

      // Contar por tipo
      const counts = {
        xss: allIssues.filter((i) => i.type === 'xss').length,
        injection: allIssues.filter((i) => i.type === 'injection').length,
        secrets: allIssues.filter((i) => i.type === 'secrets').length,
        unsafe: allIssues.filter((i) => i.type === 'unsafe').length,
      };

      // Calcular score de seguridad
      const securityScore = this.calculateSecurityScore(counts);

      this.logger.log(
        `Análisis completado: ${allIssues.length} issues encontrados`,
      );

      return {
        xssVulnerabilities: counts.xss,
        injectionVulnerabilities: counts.injection,
        hardcodedSecrets: counts.secrets,
        unsafeOperations: counts.unsafe,
        issues: allIssues,
        securityScore,
      };
    } catch (error) {
      this.logger.error(`Error en análisis de seguridad: ${error.message}`);

      // Fallback completo a análisis básico
      return this.analyzeWithPatterns(code);
    }
  }

  /**
   * Parsea resultados de ESLint
   */
  private parseESLintResults(results: ESLint.LintResult[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    for (const result of results) {
      for (const message of result.messages) {
        const issue: SecurityIssue = {
          type: this.categorizeESLintRule(message.ruleId || ''),
          severity: this.mapESLintSeverity(message.severity),
          lineNumber: message.line,
          message: message.message,
        };
        issues.push(issue);
      }
    }

    return issues;
  }

  /**
   * Análisis con patrones regex
   */
  private analyzeWithPatterns(code: string): SecurityAnalysis {
    const issues: SecurityIssue[] = [];

    // Patrones de XSS
    const xssPatterns = [
      {
        pattern: /innerHTML\s*=.*[\+\$\{]/gi,
        message: 'Posible XSS via innerHTML',
      },
      {
        pattern: /document\.write\s*\(/gi,
        message: 'Uso inseguro de document.write',
      },
      { pattern: /\.html\s*\(.*[\+\$\{]/gi, message: 'Posible XSS en .html()' },
      {
        pattern: /dangerouslySetInnerHTML/gi,
        message: 'Uso de dangerouslySetInnerHTML',
      },
    ];

    // Patrones de Injection
    const injectionPatterns = [
      {
        pattern: /eval\s*\(/gi,
        message: 'Uso de eval() - riesgo de code injection',
      },
      { pattern: /Function\s*\(/gi, message: 'Uso de Function constructor' },
      { pattern: /setTimeout\s*\(.*[`'"]/gi, message: 'setTimeout con string' },
      { pattern: /new\s+Function/gi, message: 'new Function() detectado' },
    ];

    // Patrones de Secrets
    const secretsPatterns = [
      { pattern: /password\s*[:=]\s*['"]/gi, message: 'Password hardcodeado' },
      { pattern: /api_?key\s*[:=]\s*['"]/gi, message: 'API Key hardcodeada' },
      { pattern: /secret\s*[:=]\s*['"]/gi, message: 'Secret hardcodeado' },
      { pattern: /token\s*[:=]\s*['"]\w{20,}/gi, message: 'Token hardcodeado' },
    ];

    // Patrones de operaciones inseguras
    const unsafePatterns = [
      {
        pattern: /child_process\.exec/gi,
        message: 'Ejecución de comandos del sistema',
      },
      { pattern: /fs\.\w+Sync/gi, message: 'Operación de archivo síncrona' },
      {
        pattern: /require\s*\(.*user/gi,
        message: 'Require dinámico con input de usuario',
      },
    ];

    // Analizar cada categoría
    this.scanPatterns(code, xssPatterns, 'xss', issues);
    this.scanPatterns(code, injectionPatterns, 'injection', issues);
    this.scanPatterns(code, secretsPatterns, 'secrets', issues);
    this.scanPatterns(code, unsafePatterns, 'unsafe', issues);

    const counts = {
      xss: issues.filter((i) => i.type === 'xss').length,
      injection: issues.filter((i) => i.type === 'injection').length,
      secrets: issues.filter((i) => i.type === 'secrets').length,
      unsafe: issues.filter((i) => i.type === 'unsafe').length,
    };

    return {
      xssVulnerabilities: counts.xss,
      injectionVulnerabilities: counts.injection,
      hardcodedSecrets: counts.secrets,
      unsafeOperations: counts.unsafe,
      issues,
      securityScore: this.calculateSecurityScore(counts),
    };
  }

  /**
   * Escanea código con patrones específicos
   */
  private scanPatterns(
    code: string,
    patterns: { pattern: RegExp; message: string }[],
    type: SecurityIssue['type'],
    issues: SecurityIssue[],
  ): void {
    for (const { pattern, message } of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        issues.push({
          type,
          severity: this.getSeverityByType(type),
          message,
          pattern: pattern.source,
        });
      }
    }
  }

  /**
   * Calcula score de seguridad (0-100)
   */
  private calculateSecurityScore(counts: {
    xss: number;
    injection: number;
    secrets: number;
    unsafe: number;
  }): number {
    // Ponderación por severidad
    const score =
      100 -
      counts.injection * 25 - // Critical
      counts.xss * 20 - // High
      counts.secrets * 15 - // High
      counts.unsafe * 10; // Medium

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Categoriza reglas de ESLint
   */
  private categorizeESLintRule(ruleId: string): SecurityIssue['type'] {
    if (ruleId.includes('xss') || ruleId.includes('html')) return 'xss';
    if (ruleId.includes('eval') || ruleId.includes('injection'))
      return 'injection';
    if (ruleId.includes('secret') || ruleId.includes('password'))
      return 'secrets';
    return 'unsafe';
  }

  /**
   * Mapea severidad de ESLint a nuestra escala
   */
  private mapESLintSeverity(severity: number): SecurityIssue['severity'] {
    if (severity === 2) return 'high';
    if (severity === 1) return 'medium';
    return 'low';
  }

  /**
   * Obtiene severidad por tipo de vulnerabilidad
   */
  private getSeverityByType(
    type: SecurityIssue['type'],
  ): SecurityIssue['severity'] {
    const severityMap = {
      injection: 'critical' as const,
      xss: 'high' as const,
      secrets: 'high' as const,
      unsafe: 'medium' as const,
    };
    return severityMap[type];
  }
}
