import { createInterface, type Interface } from 'node:readline';
import type { ConversationEngine } from '../chat/conversation-engine.js';
import type { TurnRunner } from '../chat/turn-runner.js';
import { ChatRuntime } from '../chat/runtime.js';
import type { ISessionStore } from '../chat/session-store.js';
import type { TranscriptMessage } from '../chat/types.js';
import { sanitizeChatOutput } from '../chat/output-sanitizer.js';
import { ANSI } from '../logging/beast-logger.js';
import { withSpinner, QUIRKY_PHRASES } from './spinner.js';

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
}

function createReadlineIO(): ChatIO {
  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });
  return {
    prompt: () => new Promise<string>((resolve) =>
      rl.question(`${ANSI.cyan}>${ANSI.reset} `, resolve),
    ),
    print: (msg: string) => console.log(msg),
    close: () => rl.close(),
    pause: () => { rl.pause(); process.stdin.pause(); },
    resume: () => { process.stdin.resume(); rl.resume(); },
  };
}

export class ChatRepl {
  private readonly projectId: string;
  private readonly sessionStore: ISessionStore | undefined;
  private readonly verbose: boolean;
  private readonly io: ChatIO;
  private readonly runtime: ChatRuntime;
  private transcript: TranscriptMessage[] = [];
  private pendingApproval = false;

  constructor(opts: ChatReplOptions) {
    this.projectId = opts.projectId;
    this.sessionStore = opts.sessionStore;
    this.verbose = opts.verbose ?? false;
    this.io = opts.io ?? createReadlineIO();
    this.runtime = new ChatRuntime({
      engine: opts.engine,
      turnRunner: opts.turnRunner,
    });
  }

  async start(): Promise<void> {
    this.loadExistingSession();
    this.io.print(`\n${ANSI.cyan}${ANSI.bold}frankenbeast chat${ANSI.reset} ${ANSI.dim}— /quit to exit${ANSI.reset}\n`);

    for (;;) {
      const input = await this.io.prompt();
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
          pendingApproval: this.pendingApproval,
          projectId: this.projectId,
          transcript: this.transcript,
        }),
        { silent: !process.stderr.isTTY },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.io.print(`${ANSI.red}error: ${msg}${ANSI.reset}`);
      return;
    } finally {
      this.io.resume?.();
    }

    this.pendingApproval = result.pendingApproval;
    this.transcript = result.transcript;

    for (const message of result.displayMessages) {
      switch (message.kind) {
        case 'reply':
          this.io.print(`${ANSI.green}${sanitizeChatOutput(message.content)}${ANSI.reset}`);
          if (this.verbose && result.tier) {
            this.io.print(`${ANSI.dim}  [${result.tier}]${ANSI.reset}`);
          }
          break;
        case 'clarify':
          this.io.print(`${ANSI.yellow}${message.content}${ANSI.reset}`);
          if (message.options && message.options.length > 0) {
            this.io.print(`  ${message.options.join(', ')}`);
          }
          break;
        case 'plan':
          this.io.print(`${ANSI.blue}plan:${ANSI.reset} ${message.content}`);
          break;
        case 'approval':
          this.io.print(`${ANSI.yellow}${message.content}${ANSI.reset}`);
          break;
        case 'execution':
          this.io.print(`${ANSI.green}${message.content}${ANSI.reset}`);
          break;
        case 'error':
          this.io.print(`${ANSI.dim}${message.content}${ANSI.reset}`);
          break;
        case 'status':
          this.io.print(`${ANSI.dim}${message.content}${ANSI.reset}`);
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
        this.io.print(`${ANSI.dim}resumed session (${session.transcript.length} messages)${ANSI.reset}`);
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
        session.updatedAt = new Date().toISOString();
        this.sessionStore.save(session);
        return;
      }
    }

    const session = this.sessionStore.create(this.projectId);
    session.transcript = this.transcript;
    session.updatedAt = new Date().toISOString();
    this.sessionStore.save(session);
  }
}
