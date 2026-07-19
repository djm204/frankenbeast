import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PlanContext {
  rampUp: string;
  relevantSignatures: Array<{ path: string; signatures: string }>;
  packageDeps: Record<string, string[]>;
  existingPatterns: Array<{ description: string; example: string }>;
}

/**
 * Collects codebase context for LLM-based planning.
 * Performs filesystem reads only — no LLM calls.
 */
export class PlanContextGatherer {
  constructor(private readonly repoRoot: string) {}

  async gather(designDoc: string): Promise<PlanContext> {
    const rampUp = this.readRampUp();
    const relevantSignatures = this.extractSignatures(designDoc);
    const packageDeps = this.gatherPackageDeps(designDoc);
    const existingPatterns: Array<{ description: string; example: string }> = [];

    return { rampUp, relevantSignatures, packageDeps, existingPatterns };
  }

  private readRampUp(): string {
    const rampUpPath = [
      join(this.repoRoot, 'docs', 'onboarding', 'RAMP_UP.md'),
      join(this.repoRoot, 'docs', 'RAMP_UP.md'),
    ].find((candidate) => existsSync(candidate));
    if (rampUpPath === undefined) {
      return '';
    }
    return readFileSync(rampUpPath, 'utf-8');
  }

  private extractSignatures(
    designDoc: string,
  ): Array<{ path: string; signatures: string }> {
    const pathPattern =
      /(?:packages\/[\w-]+\/)?(?:src|lib|tests?)\/[\w/.-]+\.(?:ts|js|json)/g;
    const matches = designDoc.match(pathPattern);
    if (!matches) {
      return [];
    }

    // Deduplicate paths
    const uniquePaths = [...new Set(matches)];
    const results: Array<{ path: string; signatures: string }> = [];

    for (const relPath of uniquePaths) {
      const absPath = join(this.repoRoot, relPath);
      if (!existsSync(absPath)) {
        continue;
      }

      const content = readFileSync(absPath, 'utf-8');
      const signatures = this.extractExportedDeclarations(content);
      if (signatures.length > 0) {
        results.push({
          path: relPath,
          signatures: signatures.join('\n'),
        });
      }
    }

    return results;
  }

  private extractExportedDeclarations(content: string): string[] {
    const lines = content.split('\n');
    const exportKeywords = [
      'interface ',
      'type ',
      'function ',
      'class ',
      'const ',
      'enum ',
    ];
    const signatures: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('export ')) {
        continue;
      }

      const hasKeyword = exportKeywords.some((kw) => trimmed.includes(kw));
      if (!hasKeyword) {
        continue;
      }

      // Clean up the line: collapse trailing block openings and strip assignments
      let cleaned = trimmed;
      // Replace trailing `{ ... ` with `{...}`
      cleaned = cleaned.replace(/\{[^}]*$/, '{...}');
      // Strip `= value;` patterns for const declarations
      cleaned = cleaned.replace(/\s*=\s*[^;]+;/, ';');

      signatures.push(cleaned);
    }

    return signatures;
  }

  private gatherPackageDeps(designDoc: string): Record<string, string[]> {
    const pkgPattern = /packages\/([\w-]+)/g;
    const deps: Record<string, string[]> = {};

    let match: RegExpExecArray | null;
    while ((match = pkgPattern.exec(designDoc)) !== null) {
      const pkgName = match[1]!;
      if (pkgName in deps) {
        continue;
      }

      const pkgJsonPath = join(
        this.repoRoot,
        'packages',
        pkgName,
        'package.json',
      );
      if (!existsSync(pkgJsonPath)) {
        continue;
      }

      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const allDeps = [
        ...Object.keys(parsed.dependencies ?? {}),
        ...Object.keys(parsed.devDependencies ?? {}),
      ];

      deps[pkgName] = allDeps;
    }

    return deps;
  }
}
