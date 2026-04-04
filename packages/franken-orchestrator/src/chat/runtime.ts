import type { ConversationEngine } from './conversation-engine.js';
import type { TurnRunner, TurnEvent, TurnRunResult } from './turn-runner.js';
import type { ChatBeastContext, ExecuteOutcome, TranscriptMessage, TurnOutcome } from './types.js';
import { sanitizeChatOutput } from './output-sanitizer.js';
import type { ChatBeastDispatchAdapter } from './beast-dispatch-adapter.js';

const SLASH_COMMANDS = new Set([
  '/plan',
  '/run',
  '/status',
  '/diff',
  '/approve',
  '/session',
]);

export interface ChatRuntimeState {
  sessionId: string;
  pendingApproval: boolean;
  projectId: string;
  transcript: TranscriptMessage[];
  beastContext?: ChatBeastContext | null | undefined;
}

export interface ChatDisplayMessage {
  kind: 'reply' | 'clarify' | 'plan' | 'status' | 'execution' | 'approval' | 'error';
  content: string;
  modelTier?: string;
  options?: string[];
}

export interface ChatRuntimeResult {
  beastContext?: ChatBeastContext | null | undefined;
  displayMessages: ChatDisplayMessage[];
  events: TurnEvent[];
  pendingApproval: boolean;
  pendingApprovalDescription?: string;
  providerContext?: {
    provider: string;
    model?: string;
    switchedFrom?: string;
    switchReason?: string;
  };
  phase?: string;
  state: string;
  tier: string | null;
  transcript: TranscriptMessage[];
  outcome?: TurnOutcome;
}

export interface ChatRuntimeOptions {
  beastDispatchAdapter?: ChatBeastDispatchAdapter;
  engine: ConversationEngine;
  turnRunner: TurnRunner;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stateFromRunResult(runResult: TurnRunResult): string {
  switch (runResult.status) {
    case 'pending_approval':
      return 'pending_approval';
    case 'failed':
      return 'failed';
    case 'completed':
      return 'active';
  }
}

export class ChatRuntime {
  private readonly engine: ConversationEngine;
  private readonly beastDispatchAdapter: ChatBeastDispatchAdapter | undefined;
  private readonly turnRunner: TurnRunner;

  constructor(options: ChatRuntimeOptions) {
    this.beastDispatchAdapter = options.beastDispatchAdapter;
    this.engine = options.engine;
    this.turnRunner = options.turnRunner;
  }

  async run(input: string, state: ChatRuntimeState): Promise<ChatRuntimeResult> {
    const trimmed = input.trim();
    if (trimmed.startsWith('/')) {
      const command = trimmed.split(/\s+/)[0]?.toLowerCase();
      if (command && SLASH_COMMANDS.has(command)) {
        return this.runSlashCommand(command, trimmed, state);
      }
    }

    return this.runTurn(trimmed, state);
  }

  private async runSlashCommand(
    command: string,
    raw: string,
    state: ChatRuntimeState,
  ): Promise<ChatRuntimeResult> {
    const description = raw.slice(command.length).trim();

    switch (command) {
      case '/plan': {
        if (!description) {
          return this.result(state, [
            { kind: 'error', content: 'Usage: /plan <description>' },
          ]);
        }

        const runResult = await this.turnRunner.run({
          kind: 'plan',
          planSummary: description,
          chunkCount: 0,
        });
        return this.result(state, [
          { kind: 'plan', content: runResult.summary },
        ], {
          events: runResult.events,
          tier: 'premium_reasoning',
        });
      }
      case '/run': {
        if (!description) {
          return this.result(state, [
            { kind: 'error', content: 'Usage: /run <description>' },
          ]);
        }

        return this.runExecuteOutcome(
          {
            kind: 'execute',
            taskDescription: description,
            approvalRequired: false,
          },
          state,
          'premium_execution',
        );
      }
      case '/status':
      case '/session':
        return this.result(state, [
          {
            kind: 'status',
            content: `project=${state.projectId} messages=${state.transcript.length}`,
          },
        ]);
      case '/diff':
        return this.result(state, [
          { kind: 'status', content: 'No diff available.' },
        ]);
      case '/approve':
        return this.result({
          ...state,
          pendingApproval: false,
        }, [
          {
            kind: state.pendingApproval ? 'approval' : 'status',
            content: state.pendingApproval ? 'Approved.' : 'Nothing pending.',
          },
        ], {
          state: state.pendingApproval ? 'approved' : 'active',
        });
      default:
        return this.result(state, []);
    }
  }

  private async runTurn(input: string, state: ChatRuntimeState): Promise<ChatRuntimeResult> {
    if (this.beastDispatchAdapter) {
      const beastResult = await this.beastDispatchAdapter.handle(input, {
        projectId: state.projectId,
        sessionId: state.sessionId,
        transcript: state.transcript,
        ...(state.beastContext !== undefined ? { beastContext: state.beastContext } : {}),
      });
      if (beastResult) {
        const transcript = appendTranscript(state.transcript, input, beastResult.assistantMessage);
        return this.result(
          {
            ...state,
            transcript,
            beastContext: beastResult.beastContext,
          },
          [{ kind: 'reply', content: beastResult.assistantMessage }],
          {
            beastContext: beastResult.beastContext,
            outcome: { kind: 'reply', content: beastResult.assistantMessage, modelTier: 'premium_execution' },
            tier: 'premium_execution',
          },
        );
      }
    }

    const result = await this.engine.processTurn(input, state.transcript);
    const transcript = [...state.transcript, ...result.newMessages];

    switch (result.outcome.kind) {
      case 'reply': {
        const content = sanitizeChatOutput(result.outcome.content);
        const nextTranscript = transcript.map((message, index) => {
          const isLast = index === transcript.length - 1;
          if (isLast && message.role === 'assistant') {
            return { ...message, content };
          }
          return message;
        });

        return this.result(
          { ...state, transcript: nextTranscript },
          [{ kind: 'reply', content, modelTier: result.outcome.modelTier }],
          {
            outcome: { ...result.outcome, content },
            tier: result.tier,
          },
        );
      }
      case 'clarify':
        return this.result(
          { ...state, transcript },
          [{
            kind: 'clarify',
            content: result.outcome.question,
            options: result.outcome.options,
          }],
          {
            outcome: result.outcome,
            tier: result.tier,
          },
        );
      case 'plan':
        return this.result(
          { ...state, transcript },
          [{
            kind: 'plan',
            content: `${result.outcome.planSummary} (${result.outcome.chunkCount} chunks)`,
          }],
          {
            outcome: result.outcome,
            tier: result.tier,
          },
        );
      case 'execute':
        return this.runExecuteOutcome(result.outcome, { ...state, transcript }, result.tier);
    }
  }

  private async runExecuteOutcome(
    outcome: ExecuteOutcome,
    state: ChatRuntimeState,
    tier: string,
  ): Promise<ChatRuntimeResult> {
    const runResult = await this.turnRunner.run(outcome);
    const pendingApproval = runResult.status === 'pending_approval';
    const displayKind = pendingApproval ? 'approval' : 'execution';
    const content = pendingApproval
      ? `approval required: ${outcome.taskDescription}`
      : runResult.summary;

    return this.result(
      {
        beastContext: state.beastContext ?? null,
        ...state,
        pendingApproval,
      },
      [{ kind: displayKind, content }],
      {
        events: runResult.events,
        outcome,
        ...(pendingApproval ? { pendingApprovalDescription: outcome.taskDescription } : {}),
        state: stateFromRunResult(runResult),
        tier,
      },
    );
  }

  private result(
    state: ChatRuntimeState,
    displayMessages: ChatDisplayMessage[],
    extra?: {
      events?: TurnEvent[];
      beastContext?: ChatBeastContext | null | undefined;
      outcome?: TurnOutcome;
      pendingApprovalDescription?: string;
      state?: string;
      tier?: string | null;
    },
  ): ChatRuntimeResult {
    return {
      ...(extra?.beastContext !== undefined ? { beastContext: extra.beastContext } : {}),
      displayMessages,
      events: extra?.events ?? [],
      pendingApproval: state.pendingApproval,
      ...(extra?.pendingApprovalDescription !== undefined
        ? { pendingApprovalDescription: extra.pendingApprovalDescription }
        : {}),
      state: extra?.state ?? 'active',
      tier: extra?.tier ?? null,
      transcript: state.transcript,
      ...(extra?.outcome ? { outcome: extra.outcome } : {}),
    };
  }
}

function appendTranscript(
  transcript: TranscriptMessage[],
  userInput: string,
  assistantMessage: string,
): TranscriptMessage[] {
  const now = new Date().toISOString();
  return [
    ...transcript,
    {
      role: 'user',
      content: userInput,
      timestamp: now,
    },
    {
      role: 'assistant',
      content: assistantMessage,
      timestamp: now,
      modelTier: 'premium_execution',
    },
  ];
}
