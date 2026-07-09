import type { ConversationEngine } from './conversation-engine.js';
import type { TurnRunner, TurnEvent, TurnRunResult } from './turn-runner.js';
import type { ChatBeastContext, ExecuteOutcome, TranscriptMessage, TurnOutcome } from './types.js';
import { sanitizeChatOutput } from './output-sanitizer.js';
import type { BeastDispatchPort } from './beast-daemon-dispatch-adapter.js';
import type { BeastExecutionMode } from '../beasts/types.js';
import type { PendingApproval } from '@franken/types';

type PendingApprovalContext = Omit<PendingApproval, 'description' | 'requestedAt'>;

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
  executionMode?: BeastExecutionMode | undefined;
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
  pendingApprovalContext?: PendingApprovalContext;
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
  beastDispatchAdapter?: BeastDispatchPort;
  engine: ConversationEngine;
  turnRunner: TurnRunner;
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

export interface ChatRuntimeRunOptions {
  onEvent?: ((event: TurnEvent) => void) | undefined;
}

export class ChatRuntime {
  private readonly engine: ConversationEngine;
  private readonly beastDispatchAdapter: BeastDispatchPort | undefined;
  private readonly turnRunner: TurnRunner;

  constructor(options: ChatRuntimeOptions) {
    this.beastDispatchAdapter = options.beastDispatchAdapter;
    this.engine = options.engine;
    this.turnRunner = options.turnRunner;
  }

  async run(input: string, state: ChatRuntimeState, options?: ChatRuntimeRunOptions): Promise<ChatRuntimeResult> {
    const trimmed = input.trim();
    if (trimmed.startsWith('/')) {
      const command = trimmed.split(/\s+/)[0]?.toLowerCase();
      if (command && SLASH_COMMANDS.has(command)) {
        return this.runSlashCommand(command, trimmed, state, options);
      }
    }

    if (state.pendingApproval) {
      return this.result(state, [
        {
          kind: 'approval',
          content: 'Approval is pending. Resolve the approval request before sending another message.',
        },
      ], {
        state: 'pending_approval',
      });
    }

    return this.runTurn(trimmed, state, options);
  }

  private async runSlashCommand(
    command: string,
    raw: string,
    state: ChatRuntimeState,
    options?: ChatRuntimeRunOptions,
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
        }, { sessionId: state.sessionId, onEvent: options?.onEvent });
        return this.result(state, [
          { kind: 'plan', content: runResult.summary },
        ], {
          events: runResult.events,
          tier: 'premium_reasoning',
          phase: 'planning',
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
          options,
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

  private async runTurn(
    input: string,
    state: ChatRuntimeState,
    options?: ChatRuntimeRunOptions,
  ): Promise<ChatRuntimeResult> {
    if (this.beastDispatchAdapter) {
      const beastResult = await this.beastDispatchAdapter.handle(input, {
        projectId: state.projectId,
        sessionId: state.sessionId,
        transcript: state.transcript,
        ...(state.beastContext !== undefined ? { beastContext: state.beastContext } : {}),
        ...(state.executionMode ? { executionMode: state.executionMode } : {}),
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
            phase: 'planning',
          },
        );
      case 'execute':
        return this.runExecuteOutcome(result.outcome, { ...state, transcript }, result.tier, options);
    }
  }

  private async runExecuteOutcome(
    outcome: ExecuteOutcome,
    state: ChatRuntimeState,
    tier: string,
    options?: ChatRuntimeRunOptions,
  ): Promise<ChatRuntimeResult> {
    const runResult = await this.turnRunner.run(outcome, {
      sessionId: state.sessionId,
      onEvent: options?.onEvent,
    });
    const pendingApproval = runResult.status === 'pending_approval';
    const pendingApprovalContext: PendingApprovalContext = {
      tool: 'execution',
      command: outcome.taskDescription,
      risk: 'Requires explicit approval before execution.',
      sessionId: state.sessionId,
    };
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
        ...(pendingApproval ? { pendingApprovalContext } : {}),
        ...(pendingApproval ? { pendingApprovalDescription: outcome.taskDescription } : {}),
        state: stateFromRunResult(runResult),
        tier,
        phase: 'execution',
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
      pendingApprovalContext?: PendingApprovalContext;
      pendingApprovalDescription?: string;
      state?: string;
      tier?: string | null;
      providerContext?: ChatRuntimeResult['providerContext'];
      phase?: string;
    },
  ): ChatRuntimeResult {
    return {
      ...(extra?.beastContext !== undefined ? { beastContext: extra.beastContext } : {}),
      displayMessages,
      events: extra?.events ?? [],
      pendingApproval: state.pendingApproval,
      ...(extra?.pendingApprovalContext !== undefined
        ? { pendingApprovalContext: extra.pendingApprovalContext }
        : {}),
      ...(extra?.pendingApprovalDescription !== undefined
        ? { pendingApprovalDescription: extra.pendingApprovalDescription }
        : {}),
      ...(extra?.providerContext ? { providerContext: extra.providerContext } : {}),
      ...(extra?.phase ? { phase: extra.phase } : {}),
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
