import type { UnifiedResponse, GuardrailViolation } from "../../types/index.js";
import { pass, block } from "../interceptor-result.js";
import type { InterceptorResult } from "../interceptor-result.js";

// Matches ES/TS import statements: import ... from 'pkg' or require('pkg')
const IMPORT_FROM_PATTERN = /(?:import\s+.*?from|require\s*\()\s*['"]([^'"./][^'"]*)['"]/g;
// Matches file paths: /absolute/path or ./relative or ../relative
const FILE_PATH_PATTERN = /(?:^|[\s"'`(])(\/?(?:\.{1,2}\/)[^\s"'`)\n]+)/gm;

function extractImports(text: string): string[] {
  const imports: string[] = [];
  const pattern = new RegExp(IMPORT_FROM_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    // Scoped packages: @scope/name — root is @scope/name (first two segments)
    if (raw.startsWith("@")) {
      const parts = raw.split("/");
      imports.push(parts.slice(0, 2).join("/"));
    } else {
      imports.push(raw.split("/")[0] ?? raw);
    }
  }
  return imports;
}

function extractFilePaths(text: string): string[] {
  const paths: string[] = [];
  const pattern = new RegExp(FILE_PATH_PATTERN.source, "gm");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) paths.push(match[1].trim());
  }
  return paths;
}

export function scrapeHallucinations(
  response: UnifiedResponse,
  dependencyWhitelist: string[],
): InterceptorResult<UnifiedResponse> {
  // No whitelist configured — skip scraping
  if (dependencyWhitelist.length === 0) {
    return pass(response);
  }

  if (!response.content) {
    return pass(response);
  }

  const whitelistSet = new Set(dependencyWhitelist);
  const violations: GuardrailViolation[] = [];

  const imports = extractImports(response.content);
  for (const pkg of imports) {
    // Skip Node built-ins (no slash, single word, known built-ins)
    if (!whitelistSet.has(pkg)) {
      violations.push({
        code: "HALLUCINATION_DETECTED",
        message: `Import "${pkg}" is not in the dependency whitelist`,
        interceptor: "HallucinationScraper",
        payload: { package: pkg },
      });
    }
  }

  if (violations.length > 0) return block(violations);
  return pass(response);
}
