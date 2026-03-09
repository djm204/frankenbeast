import {
  IntentClass,
  ModelTier,
  type IntentClassValue,
  type ModelTierValue,
  type TurnOutcome,
} from './types.js';

interface EvaluationResult {
  tier: ModelTierValue;
  outcome: TurnOutcome;
}

interface DefaultMapping {
  tier: ModelTierValue;
  outcomeFactory: (input: string) => TurnOutcome;
}

const ESCALATABLE_INTENTS = new Set<IntentClassValue>([
  IntentClass.ChatTechnical,
  IntentClass.Ambiguous,
]);

const FILE_PATH_PATTERN = /\b[\w\-/.]+\.(ts|js|tsx|jsx|py|rs|go|rb|java|css|scss|html|json|yaml|yml|toml|md)\b/g;
const MULTI_FILE_THRESHOLD = 3;

const ARCHITECTURE_KEYWORDS = [
  'tradeoff',
  'tradeoffs',
  'trade-off',
  'trade-offs',
  'microservice',
  'microservices',
  'monolith',
  'scalability',
  'migration',
];

const DEBUG_PATTERNS = [
  /\bError:/,
  /\bat\s+\S+\s*\(/,
  /ECONNREFUSED/,
  /segfault/i,
  /stack\s*trace/i,
  /\bpanic\b/,
  /\bFATAL\b/,
  /Traceback\s*\(most recent/,
];

const DEFAULT_MAPPINGS: Record<IntentClassValue, DefaultMapping> = {
  [IntentClass.ChatSimple]: {
    tier: ModelTier.Cheap,
    outcomeFactory: () => ({
      kind: 'reply' as const,
      content: '',
      modelTier: ModelTier.Cheap,
    }),
  },
  [IntentClass.ChatTechnical]: {
    tier: ModelTier.Cheap,
    outcomeFactory: () => ({
      kind: 'reply' as const,
      content: '',
      modelTier: ModelTier.Cheap,
    }),
  },
  [IntentClass.CodeRequest]: {
    tier: ModelTier.PremiumExecution,
    outcomeFactory: (input: string) => ({
      kind: 'execute' as const,
      taskDescription: input,
      approvalRequired: false,
    }),
  },
  [IntentClass.RepoAction]: {
    tier: ModelTier.PremiumExecution,
    outcomeFactory: (input: string) => ({
      kind: 'execute' as const,
      taskDescription: input,
      approvalRequired: true,
    }),
  },
  [IntentClass.Ambiguous]: {
    tier: ModelTier.Cheap,
    outcomeFactory: () => ({
      kind: 'clarify' as const,
      question: '',
      options: [],
    }),
  },
};

export class EscalationPolicy {
  evaluate(intent: IntentClassValue, input: string): EvaluationResult {
    const mapping = DEFAULT_MAPPINGS[intent];
    const tier = this.resolveTier(intent, input, mapping.tier);
    const outcome = mapping.outcomeFactory(input);

    return { tier, outcome };
  }

  private resolveTier(
    intent: IntentClassValue,
    input: string,
    defaultTier: ModelTierValue,
  ): ModelTierValue {
    if (!ESCALATABLE_INTENTS.has(intent)) {
      return defaultTier;
    }

    if (this.hasComplexityTrigger(input)) {
      return ModelTier.PremiumReasoning;
    }

    return defaultTier;
  }

  private hasComplexityTrigger(input: string): boolean {
    return (
      this.hasMultiFileReferences(input) ||
      this.hasArchitectureKeywords(input) ||
      this.hasDebuggingContext(input)
    );
  }

  private hasMultiFileReferences(input: string): boolean {
    const matches = input.match(FILE_PATH_PATTERN);
    return matches !== null && matches.length >= MULTI_FILE_THRESHOLD;
  }

  private hasArchitectureKeywords(input: string): boolean {
    const lower = input.toLowerCase();
    return ARCHITECTURE_KEYWORDS.some((keyword) => lower.includes(keyword));
  }

  private hasDebuggingContext(input: string): boolean {
    return DEBUG_PATTERNS.some((pattern) => pattern.test(input));
  }
}
