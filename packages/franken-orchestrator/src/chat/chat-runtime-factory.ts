import type { ILlmClient } from '@franken/core';
import { ConversationEngine } from './conversation-engine.js';
import { ChatRuntime } from './runtime.js';
import { ChatAgentExecutor } from './chat-agent-executor.js';
import { TurnRunner } from './turn-runner.js';

export interface CreateChatRuntimeOptions {
  chatLlm: ILlmClient;
  executionLlm?: ILlmClient;
  projectName: string;
  sessionContinuation?: boolean;
  turnRunner?: TurnRunner;
}

export interface ChatRuntimeBundle {
  engine: ConversationEngine;
  runtime: ChatRuntime;
  turnRunner: TurnRunner;
}

export function createChatRuntime(options: CreateChatRuntimeOptions): ChatRuntimeBundle {
  const engine = new ConversationEngine({
    llm: options.chatLlm,
    projectName: options.projectName,
    ...(options.sessionContinuation !== undefined
      ? { sessionContinuation: options.sessionContinuation }
      : {}),
  });
  const turnRunner = options.turnRunner ?? new TurnRunner(new ChatAgentExecutor({
    llm: options.executionLlm ?? options.chatLlm,
  }));
  const runtime = new ChatRuntime({ engine, turnRunner });

  return {
    engine,
    runtime,
    turnRunner,
  };
}
