import { createInterface, type Interface } from 'node:readline';
import type { ConversationEngine } from '../chat/conversation-engine.js';
import type { TurnRunner } from '../chat/turn-runner.js';
import { ChatRuntime } from '../chat/runtime.js';
import type { ISessionStore } from '../chat/session-store.js';
import type { TranscriptMessage } from '../chat/types.js';
import { sanitizeChatOutput } from '../chat/output-sanitizer.js';
import { ANSI } from '../logging/beast-logger.js';
import { withSpinner, QUIRKY_PHRASES } from './spinner.js';
import { CHAT_COLOR, CHAT_GLYPHS, chatBanner, chatBlock, chatStatusLine, statusRule } from './chat-style.js';
import { isoNow, type ProviderContext, type TokenUsage } from '@franken/types';


function printLine(...args: unknown[]): void {
  console.info(...args);
}
export { sanitizeChatOutput } from '../chat/output-sanitizer.js';

const SLASH_COMMANDS = new Set([
  '/plan',
  '/run',
  '/status',
  '/diff',
  '/approve',
  '/session',
  '/quit',
]);

export interface ChatIO {
  prompt(): Promise<string>;
  /** Ask an arbitrary question through this same terminal owner. */
  ask?(question: string): Promise<string>;
  /** Cancel the currently pending question without closing the shared terminal owner. */
  cancelQuestion?(): void;
  print(msg: string): void;
  close(): void;
  /** Pause input (block typing while processing). */
  pause?(): void;
  /** Resume input after processing. */
  resume?(): void;
}

export interface ChatReplOptions {
  engine: ConversationEngine;
  turnRunner: TurnRunner;
  projectId: string;
  sessionStore?: ISessionStore;
  verbose?: boolean;
  io?: ChatIO;
  /** Resolved provider's declared context window, for the status rule's usage bar. */
  contextMaxTokens?: number;
  /** Resolve the serving provider's context window after a fallback. */
  contextMaxTokensForProvider?: (provider: string) => number | undefined;
  /** Chat model label shown on the status rule. */
  modelLabel?: string;
}

export function createReadlineIO(): ChatIO {
  let rl: Interface | undefined;
  let activeQuestion: AbortController | undefined;
  const getReadline = (): Interface => {
    rl ??= createInterface({ input: process.stdin, output: process.stdout });
    return rl;
  };
  const cancelQuestion = (): void => {
    activeQuestion?.abort();
  };
  const ask = (question: string) => {
    const reader = getReadline();
    const controller = new AbortController();
    activeQuestion = controller;
    return new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        const error = new Error('Terminal question cancelled');
        error.name = 'AbortError';
        reject(error);
      };
      controller.signal.addEventListener('abort', onAbort, { once: true });
      reader.question(question, { signal: controller.signal }, (answer) => {
        controller.signal.removeEventListener('abort', onAbort);
        resolve(answer);
      });
    }).finally(() => {
      if (activeQuestion === controller) activeQuestion = undefined;
    });
  };
  return {
    prompt: () => ask(`${CHAT_COLOR.user}${CHAT_GLYPHS.user}${ANSI.reset} `),
    ask,
    cancelQuestion,
    print: (msg: string) => printLine(msg),
    close: () => { cancelQuestion(); rl?.close(); },
    pause: () => { rl?.pause(); process.stdin.pause(); },
    resume: () => { process.stdin.resume(); rl?.resume(); },
  };
}

export class ChatRepl {
  private readonly projectId: string;
  private readonly sessionStore: ISessionStore | undefined;
  private readonly verbose: boolean;
  private readonly io: ChatIO;
  private readonly runtime: ChatRuntime;
  private readonly configuredContextMaxTokens: number | undefined;
  private readonly contextMaxTokensForProvider: ((provider: string) => number | undefined) | undefined;
  private readonly modelLabel: string;
  private transcript: TranscriptMessage[] = [];
  private pendingApproval = false;
  private readonly sessionStartedAt = Date.now();
  private latestUsage: TokenUsage | undefined;
  private compactionCount = 0;
  private lastProviderContext: ProviderContext | undefined;

  constructor(opts: ChatReplOptions) {
    this.projectId = opts.projectId;
    this.sessionStore = opts.sessionStore;
    this.verbose = opts.verbose ?? false;
    this.io = opts.io ?? createReadlineIO();
    this.configuredContextMaxTokens = opts.contextMaxTokens;
    this.contextMaxTokensForProvider = opts.contextMaxTokensForProvider;
    this.modelLabel = opts.modelLabel ?? 'frankenbeast';
    this.runtime = new ChatRuntime({
      engine: opts.engine,
      turnRunner: opts.turnRunner,
    });
  }

  private printStatusRule(): void {
    // Once a turn has actually completed, prefer the real serving
    // provider/model over the static configured label — the configured
    // provider can silently differ from what's actually answering (e.g.
    // after a rate-limit fallback), and the status rule should never
    // contradict what the model itself can now truthfully say about itself.
    const label = this.lastProviderContext?.model ?? this.lastProviderContext?.provider ?? this.modelLabel;
    const contextMaxTokens = this.lastProviderContext
      ? this.contextMaxTokensForProvider?.(this.lastProviderContext.provider)
      : this.configuredContextMaxTokens;
    this.io.print(statusRule(process.stdout.columns ?? 80, {
      ...(this.latestUsage ? { usage: this.latestUsage } : {}),
      ...(contextMaxTokens !== undefined ? { contextMaxTokens } : {}),
      compactions: this.compactionCount,
      sessionDurationMs: Date.now() - this.sessionStartedAt,
      modelLabel: label,
    }));
  }

  async start(): Promise<void> {
    this.loadExistingSession();
    this.io.print(chatBanner('frankenbeast', `· project ${this.projectId} · /quit to exit`));

    for (;;) {
      this.printStatusRule();
      const input = await this.io.prompt();
      this.printStatusRule();
      const trimmed = input.trim();

      if (trimmed === '') continue;

      if (trimmed.startsWith('/')) {
        const cmd = trimmed.split(/\s+/)[0]!.toLowerCase();
        if (cmd === '/quit') {
          this.saveSession();
          this.io.close();
          break;
        }
        if (SLASH_COMMANDS.has(cmd)) {
          await this.handleSlashCommand(cmd, trimmed);
          continue;
        }
      }

      await this.processTurn(trimmed);
    }
  }

  private async processTurn(input: string): Promise<void> {
    this.io.pause?.();
    let result: Awaited<ReturnType<ChatRuntime['run']>>;
    try {
      result = await withSpinner(
        QUIRKY_PHRASES,
        () => this.runtime.run(input, {
          sessionId: this.projectId,
          pendingApproval: this.pendingApproval,
          projectId: this.projectId,
          transcript: this.transcript,
          ...(this.lastProviderContext ? { lastProviderContext: this.lastProviderContext } : {}),
        }),
        { silent: !process.stderr.isTTY },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.io.print(chatBlock(CHAT_GLYPHS.error, ANSI.red, `error: ${msg}`, ANSI.red));
      return;
    } finally {
      this.io.resume?.();
    }

    this.pendingApproval = result.pendingApproval;
    this.transcript = result.transcript;
    if (result.usage) {
      this.latestUsage = result.usage;
    }
    if (result.truncated) {
      this.compactionCount++;
    }
    if (result.providerContext) {
      this.lastProviderContext = result.providerContext;
    }

    for (const message of result.displayMessages) {
      switch (message.kind) {
        case 'reply':
          this.io.print(chatBlock(CHAT_GLYPHS.beast, CHAT_COLOR.beast, sanitizeChatOutput(message.content)));
          if (this.verbose && result.tier) {
            this.io.print(chatStatusLine(`[${result.tier}]`));
          }
          break;
        case 'clarify':
          this.io.print(chatBlock(CHAT_GLYPHS.clarify, ANSI.yellow, message.content, ANSI.yellow));
          if (message.options && message.options.length > 0) {
            this.io.print(`${ANSI.dim}  ${message.options.map((option) => `· ${option}`).join('  ')}${ANSI.reset}`);
          }
          break;
        case 'plan':
          this.io.print(chatBlock(CHAT_GLYPHS.plan, ANSI.blue, `plan\n${message.content}`));
          break;
        case 'approval':
          this.io.print(chatBlock(CHAT_GLYPHS.approval, ANSI.yellow, message.content, ANSI.yellow));
          break;
        case 'execution':
          this.io.print(chatBlock(CHAT_GLYPHS.execution, ANSI.green, message.content));
          break;
        case 'error':
          this.io.print(chatBlock(CHAT_GLYPHS.error, ANSI.red, message.content, ANSI.dim));
          break;
        case 'status':
          this.io.print(chatBlock(CHAT_GLYPHS.status, ANSI.dim, message.content, ANSI.dim));
          break;
      }
    }
  }

  private async handleSlashCommand(cmd: string, raw: string): Promise<void> {
    if (cmd === '/quit') {
      return;
    }
    await this.processTurn(raw);
  }

  private loadExistingSession(): void {
    if (!this.sessionStore) return;
    const ids = this.sessionStore.list();
    for (const id of ids) {
      const session = this.sessionStore.get(id);
      if (session && session.projectId === this.projectId && session.state === 'active') {
        this.transcript = [...session.transcript];
        this.io.print(chatBlock(CHAT_GLYPHS.session, ANSI.green, `resumed session (${session.transcript.length} messages)`, ANSI.dim));
        return;
      }
    }
  }

  private saveSession(): void {
    if (!this.sessionStore) return;

    const ids = this.sessionStore.list();
    for (const id of ids) {
      const session = this.sessionStore.get(id);
      if (session && session.projectId === this.projectId && session.state === 'active') {
        session.transcript = this.transcript;
        session.updatedAt = isoNow();
        this.sessionStore.save(session);
        return;
      }
    }

    const session = this.sessionStore.create(this.projectId);
    session.transcript = this.transcript;
    session.updatedAt = isoNow();
    this.sessionStore.save(session);
  }
}
