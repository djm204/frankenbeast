import type {
  BeastDefinition,
  BeastInterviewPrompt,
  BeastInterviewSession,
} from '../types.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import { BeastCatalogService } from './beast-catalog-service.js';

export interface BeastInterviewProgress {
  readonly session: BeastInterviewSession;
  readonly currentPrompt?: BeastInterviewPrompt | undefined;
  readonly complete: boolean;
  readonly config?: Readonly<Record<string, unknown>> | undefined;
}

export class BeastInterviewService {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly catalog: BeastCatalogService,
  ) {}

  start(definitionId: string): BeastInterviewSession & { currentPrompt?: BeastInterviewPrompt | undefined } {
    const definition = this.getDefinitionOrThrow(definitionId);
    const now = new Date().toISOString();
    const session = this.repository.createInterviewSession({
      definitionId,
      status: 'active',
      answers: {},
      createdAt: now,
      updatedAt: now,
    });

    return this.attachCurrentPrompt(session, definition);
  }

  resume(sessionId: string): BeastInterviewProgress {
    const session = this.repository.getInterviewSession(sessionId);
    if (!session) {
      throw new Error(`Unknown Beast interview session: ${sessionId}`);
    }

    const definition = this.getDefinitionOrThrow(session.definitionId);
    const prompt = currentPrompt(definition, session.answers);
    if (!prompt) {
      return {
        session: this.attachCurrentPrompt(session, definition),
        complete: true,
        config: definition.configSchema.parse(session.answers),
      };
    }

    return {
      session: this.attachCurrentPrompt(session, definition),
      currentPrompt: prompt,
      complete: false,
    };
  }

  answer(sessionId: string, answer: string): BeastInterviewProgress {
    const session = this.repository.getInterviewSession(sessionId);
    if (!session) {
      throw new Error(`Unknown Beast interview session: ${sessionId}`);
    }

    const definition = this.getDefinitionOrThrow(session.definitionId);
    const prompt = currentPrompt(definition, session.answers);
    if (!prompt) {
      const config = definition.configSchema.parse(session.answers);
      return {
        session: this.attachCurrentPrompt(session, definition),
        complete: true,
        config,
      };
    }

    const nextAnswers = {
      ...session.answers,
      [prompt.key]: coerceAnswer(prompt, answer),
    };
    const now = new Date().toISOString();
    const nextPrompt = currentPrompt(definition, nextAnswers);
    const nextStatus = nextPrompt ? 'active' : 'completed';
    const updated = this.repository.updateInterviewSession(session.id, {
      status: nextStatus,
      answers: nextAnswers,
      updatedAt: now,
    });

    if (!nextPrompt) {
      return {
        session: this.attachCurrentPrompt(updated, definition),
        complete: true,
        config: definition.configSchema.parse(updated.answers),
      };
    }

    return {
      session: this.attachCurrentPrompt(updated, definition),
      currentPrompt: nextPrompt,
      complete: false,
    };
  }

  private getDefinitionOrThrow(definitionId: string): BeastDefinition {
    const definition = this.catalog.getDefinition(definitionId);
    if (!definition) {
      throw new Error(`Unknown Beast definition: ${definitionId}`);
    }
    return definition;
  }

  private attachCurrentPrompt(
    session: BeastInterviewSession,
    definition: BeastDefinition,
  ): BeastInterviewSession & { currentPrompt?: BeastInterviewPrompt | undefined } {
    const prompt = currentPrompt(definition, session.answers);
    return {
      ...session,
      ...(prompt ? { currentPrompt: prompt } : {}),
    };
  }
}

function currentPrompt(
  definition: BeastDefinition,
  answers: Readonly<Record<string, unknown>>,
): BeastInterviewPrompt | undefined {
  return definition.interviewPrompts.find((prompt) => answers[prompt.key] === undefined);
}

function coerceAnswer(prompt: BeastInterviewPrompt, answer: string): unknown {
  if (prompt.kind === 'boolean') {
    const normalized = answer.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === 'y';
  }
  return answer;
}
