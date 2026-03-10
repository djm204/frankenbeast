import { Project, SyntaxKind } from 'ts-morph';
import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

export class GhostDependencyEvaluator implements Evaluator {
  readonly name = 'ghost-dependency';
  readonly category = 'deterministic' as const;

  private readonly knownPackages: ReadonlySet<string>;
  private readonly project: Project;

  constructor(knownPackages: readonly string[]) {
    this.knownPackages = new Set(knownPackages);
    this.project = new Project({ useInMemoryFileSystem: true });
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const findings: EvaluationFinding[] = [];
    const seen = new Set<string>();

    // Use AST parsing instead of regex to be much more robust
    const sourceFile = this.project.createSourceFile('temp.ts', input.content, { overwrite: true });
    
    // 1. Handle Import Declarations
    const imports = sourceFile.getImportDeclarations();

    for (const imp of imports) {
      const specifier = imp.getModuleSpecifierValue();
      if (!specifier) continue;

      // Skip relative imports
      if (specifier.startsWith('.')) continue;

      // Skip node: built-ins
      if (specifier.startsWith('node:')) continue;

      // Extract package name (handle scoped packages and subpath imports)
      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0]!;

      if (seen.has(packageName)) continue;
      seen.add(packageName);

      if (!this.knownPackages.has(packageName)) {
        findings.push({
          message: `Ghost dependency detected: "${packageName}" is not in the known package registry`,
          severity: 'critical',
          suggestion: `Add "${packageName}" to dependencies or remove the import`,
        });
      }
    }

    // 2. Handle require() calls (common in mixed codebases)
    const requires = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => call.getExpression().getText() === 'require');

    for (const req of requires) {
      const args = req.getArguments();
      if (args.length === 1) {
        const arg = args[0];
        // Handle both 'string' and "string"
        if (arg && arg.getKind() === SyntaxKind.StringLiteral) {
          const specifier = (arg as any).getLiteralValue();
          if (!specifier || specifier.startsWith('.') || specifier.startsWith('node:')) continue;

          const packageName = specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0]!;

          if (seen.has(packageName)) continue;
          seen.add(packageName);

          if (!this.knownPackages.has(packageName)) {
            findings.push({
              message: `Ghost dependency detected in require(): "${packageName}" is not in the known package registry`,
              severity: 'critical',
              suggestion: `Add "${packageName}" to dependencies or remove the require() call`,
            });
          }
        }
      }
    }

    // Clean up to prevent memory leak in long-lived sessions
    this.project.removeSourceFile(sourceFile);

    const score = findings.length === 0 ? 1 : 0;

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
    };
  }
}
