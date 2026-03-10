import type { ILlmClient } from '@franken/core';
import type { PlanGraph, PlanIntent } from '../deps.js';
import type { GraphBuilder } from './chunk-file-graph-builder.js';

/**
 * IO abstraction for user interaction during interviews.
 * The build-runner provides a stdin/stdout implementation; tests provide mocks.
 */
export interface InterviewIO {
  ask(question: string): Promise<string>;
  display(message: string): void;
}

const MAX_QUESTIONS = 5;
const MAX_REVISIONS = 3;

/**
 * GraphBuilder that interviews the user to gather requirements,
 * generates a design document via LLM, and delegates to LlmGraphBuilder
 * for decomposition into a PlanGraph.
 *
 * This is Mode 3 (interview input) — the full "idea to PR" pipeline.
 */
export class InterviewLoop implements GraphBuilder {
  constructor(
    private readonly llm: ILlmClient,
    private readonly io: InterviewIO,
    private readonly graphBuilder: GraphBuilder,
  ) {}

  async build(intent: PlanIntent): Promise<PlanGraph> {
    const answers = await this.gatherAnswers(intent.goal);
    let designDoc = await this.generateDesignDoc(intent.goal, answers);

    let revisions = 0;
    while (true) {
      this.io.display(designDoc);
      const approval = await this.io.ask('Approve this design? (yes/no)');

      if (this.isApproved(approval)) {
        return this.graphBuilder.build({ ...intent, goal: designDoc });
      }

      revisions++;
      if (revisions > MAX_REVISIONS) {
        throw new Error(
          `Maximum ${MAX_REVISIONS} revision rounds reached. Aborting interview loop.`,
        );
      }

      const feedback = await this.io.ask('What would you like to change?');
      designDoc = await this.reviseDesignDoc(intent.goal, answers, designDoc, feedback);
    }
  }

  private async gatherAnswers(
    goal: string,
  ): Promise<Array<{ question: string; answer: string }>> {
    const raw = await this.llm.complete(
      `Given the following goal, what clarifying questions do you need to ask?\n\n` +
        `Goal: ${goal}\n\n` +
        `Respond with numbered questions only (e.g., "1. Question?"). ` +
        `Maximum ${MAX_QUESTIONS} questions.`,
    );

    const questions = this.parseQuestions(raw);
    const answers: Array<{ question: string; answer: string }> = [];

    for (const question of questions) {
      const answer = await this.io.ask(question);
      answers.push({ question, answer });
    }

    return answers;
  }

  private parseQuestions(raw: string): string[] {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const questions: string[] = [];

    for (const line of lines) {
      // Match numbered questions like "1. What...?" or "1) What...?"
      const match = line.match(/^\d+[.)]\s*(.+)/);
      if (match) {
        questions.push(match[1]!);
      }
    }

    return questions.slice(0, MAX_QUESTIONS);
  }

  private async generateDesignDoc(
    goal: string,
    answers: Array<{ question: string; answer: string }>,
  ): Promise<string> {
    const answersText = answers
      .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
      .join('\n\n');

    return this.llm.complete(
      `Generate a design document for the following project.\n\n` +
        `## Goal\n${goal}\n\n` +
        (answersText
          ? `## Clarifying Questions and Answers\n${answersText}\n\n`
          : '') +
        `## Format\n` +
        `The design document should include these sections:\n` +
        `- Problem\n- Goal\n- Architecture\n- Components\n- Data Flow\n- Success Criteria\n\n` +
        `Write the complete design document now.`,
    );
  }

  private async reviseDesignDoc(
    goal: string,
    answers: Array<{ question: string; answer: string }>,
    currentDoc: string,
    feedback: string,
  ): Promise<string> {
    const answersText = answers
      .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
      .join('\n\n');

    return this.llm.complete(
      `Revise the following design document based on the user's feedback.\n\n` +
        `## Goal\n${goal}\n\n` +
        (answersText
          ? `## Clarifying Questions and Answers\n${answersText}\n\n`
          : '') +
        `## Current Design Document\n${currentDoc}\n\n` +
        `## User Feedback\n${feedback}\n\n` +
        `Write the revised design document now.`,
    );
  }

  private isApproved(response: string): boolean {
    const normalized = response.trim().toLowerCase();
    return normalized === 'yes' || normalized === 'y';
  }
}
