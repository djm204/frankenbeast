import { IntentClass, type IntentClassValue } from './types.js';

// --- Slash command overrides (highest priority) ---

const SLASH_COMMANDS: Array<{ pattern: RegExp; intent: IntentClassValue }> = [
  { pattern: /^\/plan\b/, intent: IntentClass.CodeRequest },
  { pattern: /^\/run\b/, intent: IntentClass.RepoAction },
  { pattern: /^\/status\b/, intent: IntentClass.RepoAction },
];

// --- Error / diagnostic patterns (multi-line aware) ---

const STACK_TRACE_PATTERN = /at .+\(.+:\d+\)|^Error:/m;
const TEST_FAILURE_PATTERN = /FAIL\s+\S+\.test/i;
const COMPILER_ERROR_PATTERN = /:\d+:\d+\s*-\s*error\s+TS/;

// --- Keyword patterns (matched against lowercased input) ---

const AMBIGUOUS_PATTERNS: RegExp[] = [
  /\bdelete\b/,
  /\breset\b/,
  /\bdrop\b/,
  /\bpublish\b/,
];

const REPO_PATTERNS: RegExp[] = [
  /\brun\b/,
  /\bexecute\b/,
  /\bcommit\b/,
  /\bpush\b/,
  /\bdeploy\b/,
  /\bmerge\b/,
  /\brelease\b/,
  /\bopen\s+a?\s*pr\b/,
  /\bapply\b/,
];

const CODE_PATTERNS: RegExp[] = [
  /\bimplement\b/,
  /\bfix\b/,
  /\brefactor\b/,
  /\bwrite\b/,
  /\bedit\b/,
  /\bdebug\b/,
  /\badd\s+test\b/,
];

const TECHNICAL_PATTERNS: RegExp[] = [
  /\barchitecture\b/,
  /\bdesign\s+pattern\b/,
  /\bexplain\b/,
  /\bcompare\b/,
  /\btradeoffs?\b/,
  /\bpattern\b/,
  /\bhow\s+would\s+you\s+build\b/,
];

const SIMPLE_PATTERNS: RegExp[] = [
  /^(hello|hi|hey)\b/,
  /\b(thanks|thank\s+you)\b/,
  /^(good\s+(morning|afternoon|evening))\b/,
  /^(bye|goodbye|see\s+you)\b/,
  /^how\s+are\s+you\b/,
];

export class IntentRouter {
  classify(input: string): IntentClassValue {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    // 1. Slash commands — absolute precedence
    for (const cmd of SLASH_COMMANDS) {
      if (cmd.pattern.test(lower)) {
        return cmd.intent;
      }
    }

    // 2. Error diagnostics — stack traces, test failures, compiler errors
    if (STACK_TRACE_PATTERN.test(trimmed) || TEST_FAILURE_PATTERN.test(trimmed) || COMPILER_ERROR_PATTERN.test(trimmed)) {
      return IntentClass.CodeRequest;
    }

    // 3. Ambiguous safety-sensitive verbs
    if (matchesAny(lower, AMBIGUOUS_PATTERNS)) {
      return IntentClass.Ambiguous;
    }

    // 4. Repo action verbs
    if (matchesAny(lower, REPO_PATTERNS)) {
      return IntentClass.RepoAction;
    }

    // 5. Code request verbs
    if (matchesAny(lower, CODE_PATTERNS)) {
      return IntentClass.CodeRequest;
    }

    // 6. Technical discussion signals
    if (matchesAny(lower, TECHNICAL_PATTERNS)) {
      return IntentClass.ChatTechnical;
    }

    // 7. Simple conversational patterns
    if (matchesAny(lower, SIMPLE_PATTERNS)) {
      return IntentClass.ChatSimple;
    }

    // 8. Fallback — treat unrecognized input as simple chat (LLM will respond)
    return IntentClass.ChatSimple;
  }
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}
