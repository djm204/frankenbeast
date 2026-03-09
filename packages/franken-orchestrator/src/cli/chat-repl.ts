import { createInterface, type Interface } from 'node:readline';
import type { ConversationEngine, TurnResult } from '../chat/conversation-engine.js';
import type { TurnRunner, TurnRunResult } from '../chat/turn-runner.js';
import type { ISessionStore } from '../chat/session-store.js';
import type { TranscriptMessage } from '../chat/types.js';
import { ANSI } from '../logging/beast-logger.js';
import { withSpinner, QUIRKY_PHRASES } from './spinner.js';

/**
 * Strips Claude CLI tool metadata from chat responses:
 * - "Web search results for query: ..." header + raw JSON "Links: [...]" blob
 * - "REMINDER: ..." system instruction blocks
 * Keeps the actual conversational answer.
 */
export function sanitizeChatOutput(text: string): string {
  let cleaned = text;

  // Strip "Web search results for query: ..." line + "Links: [{...}]" JSON blob
  cleaned = cleaned.replace(/Web search results for query:.*\n\n?Links:\s*\[[\s\S]*?\]\n*/gi, '');

  // Strip "REMINDER:" blocks (from REMINDER to next double-newline or end)
  cleaned = cleaned.replace(/\n*REMINDER:[\s\S]*$/gi, '');

  return cleaned.trim();
}

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
  private readonly engine: ConversationEngine;
  private readonly turnRunner: TurnRunner;
  private readonly projectId: string;
  private readonly sessionStore: ISessionStore | undefined;
  private readonly verbose: boolean;
  private readonly io: ChatIO;
  private transcript: TranscriptMessage[] = [];
  private pendingApproval = false;

  constructor(opts: ChatReplOptions) {
    this.engine = opts.engine;
    this.turnRunner = opts.turnRunner;
    this.projectId = opts.projectId;
    this.sessionStore = opts.sessionStore;
    this.verbose = opts.verbose ?? false;
    this.io = opts.io ?? createReadlineIO();
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
    let result: TurnResult;
    try {
      result = await withSpinner(QUIRKY_PHRASES, () => this.engine.processTurn(input, this.transcript), { silent: !process.stderr.isTTY });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.io.print(`${ANSI.red}error: ${msg}${ANSI.reset}`);
      return;
    } finally {
      this.io.resume?.();
    }

    this.transcript.push(...result.newMessages);

    switch (result.outcome.kind) {
      case 'reply':
        this.io.print(`${ANSI.green}${sanitizeChatOutput(result.outcome.content)}${ANSI.reset}`);
        if (this.verbose) {
          this.io.print(`${ANSI.dim}  [${result.tier}]${ANSI.reset}`);
        }
        break;

      case 'execute':
        await this.handleExecute(result);
        break;

      case 'plan':
        this.io.print(
          `${ANSI.blue}plan:${ANSI.reset} ${result.outcome.planSummary} (${result.outcome.chunkCount} chunks)`,
        );
        break;

      case 'clarify':
        this.io.print(`${ANSI.yellow}${result.outcome.question}${ANSI.reset}`);
        if (result.outcome.options.length > 0) {
          this.io.print(`  ${result.outcome.options.join(', ')}`);
        }
        break;
    }
  }

  private async handleExecute(result: TurnResult): Promise<void> {
    const outcome = result.outcome;
    if (outcome.kind !== 'execute') return;

    this.io.print(`${ANSI.magenta}running:${ANSI.reset} ${outcome.taskDescription}`);

    let runResult: TurnRunResult;
    try {
      runResult = await this.turnRunner.run(outcome);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.io.print(`${ANSI.red}execution error: ${msg}${ANSI.reset}`);
      return;
    }

    if (runResult.status === 'pending_approval') {
      this.pendingApproval = true;
      this.io.print(
        `${ANSI.yellow}approval required:${ANSI.reset} ${outcome.taskDescription} — use /approve`,
      );
      return;
    }

    this.io.print(`${ANSI.green}${runResult.summary}${ANSI.reset}`);
  }

  private async handleSlashCommand(cmd: string, raw: string): Promise<void> {
    const description = raw.slice(cmd.length).trim();

    switch (cmd) {
      case '/plan': {
        if (!description) {
          this.io.print(`${ANSI.dim}Usage: /plan <description>${ANSI.reset}`);
          return;
        }
        const outcome = { kind: 'plan' as const, planSummary: description, chunkCount: 0 };
        const runResult = await this.turnRunner.run(outcome);
        this.io.print(`${ANSI.blue}plan:${ANSI.reset} ${runResult.summary}`);
        break;
      }
      case '/run': {
        if (!description) {
          this.io.print(`${ANSI.dim}Usage: /run <description>${ANSI.reset}`);
          return;
        }
        const outcome = { kind: 'execute' as const, taskDescription: description, approvalRequired: false };
        await this.handleExecute({
          outcome,
          tier: 'premium_execution' as const,
          newMessages: [{ role: 'user' as const, content: raw, timestamp: new Date().toISOString() }],
        });
        break;
      }
      case '/status':
        this.io.print(
          `${ANSI.dim}project=${this.projectId} messages=${this.transcript.length}${ANSI.reset}`,
        );
        break;
      case '/diff':
        this.io.print(`${ANSI.dim}No diff available.${ANSI.reset}`);
        break;
      case '/approve':
        if (this.pendingApproval) {
          this.pendingApproval = false;
          this.io.print(`${ANSI.green}Approved.${ANSI.reset}`);
        } else {
          this.io.print(`${ANSI.dim}Nothing pending.${ANSI.reset}`);
        }
        break;
      case '/session':
        this.io.print(
          `${ANSI.dim}project=${this.projectId} messages=${this.transcript.length}${ANSI.reset}`,
        );
        break;
    }
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
