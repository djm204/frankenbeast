import { describe, it, expect, vi } from 'vitest';
import { InterviewLoop } from '../../src/planning/interview-loop.js';
import type { InterviewIO } from '../../src/planning/interview-loop.js';
import type { LlmGraphBuilder } from '../../src/planning/llm-graph-builder.js';
import type { PlanIntent, PlanGraph, PlanTask } from '../../src/deps.js';
import type { ILlmClient } from '@franken/core';

/** Builds a mock ILlmClient with sequential responses. */
function mockLlm(...responses: string[]): ILlmClient {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce(r);
  }
  return { complete: fn };
}

/** Builds a mock InterviewIO that returns sequential answers. */
function mockIO(...answers: string[]): InterviewIO {
  const askFn = vi.fn();
  for (const a of answers) {
    askFn.mockResolvedValueOnce(a);
  }
  return {
    ask: askFn,
    display: vi.fn(),
  };
}

/** Builds a mock LlmGraphBuilder that returns a fixed PlanGraph. */
function mockGraphBuilder(graph?: PlanGraph): LlmGraphBuilder {
  const defaultGraph: PlanGraph = {
    tasks: [
      { id: 'impl:01_setup', objective: 'Setup', requiredSkills: ['cli:01_setup'], dependsOn: [] },
      { id: 'harden:01_setup', objective: 'Harden', requiredSkills: ['cli:01_setup'], dependsOn: ['impl:01_setup'] },
    ],
  };
  return {
    build: vi.fn().mockResolvedValue(graph ?? defaultGraph),
  } as unknown as LlmGraphBuilder;
}

const intent: PlanIntent = { goal: 'Build a user authentication system' };

// LLM response formats
const questionsResponse = `1. What authentication method do you prefer?
2. Should we support OAuth?
3. What database will be used?`;

const designDocResponse = `# Design Document

## Problem
Need user authentication.

## Goal
Implement secure auth system.

## Architecture
JWT-based authentication with refresh tokens.`;

const revisedDesignDocResponse = `# Design Document

## Problem
Need user authentication.

## Goal
Implement secure auth system with OAuth.

## Architecture
OAuth2 with JWT tokens and refresh flow.`;

describe('InterviewLoop', () => {
  describe('implements GraphBuilder interface', () => {
    it('has a build method that accepts PlanIntent and returns PlanGraph', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      const graph = await loop.build(intent);

      expect(graph).toBeDefined();
      expect(graph.tasks).toBeDefined();
      expect(Array.isArray(graph.tasks)).toBe(true);
    });
  });

  describe('clarifying questions', () => {
    it('sends intent.goal to LLM to generate clarifying questions', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      const firstPrompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(firstPrompt).toContain(intent.goal);
      expect(firstPrompt).toMatch(/clarif|question/i);
    });

    it('asks each parsed question via io.ask()', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      // 3 questions + 1 approval = 4 ask calls
      expect(io.ask).toHaveBeenCalledTimes(4);
      // First 3 calls should be the questions
      expect((io.ask as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('authentication method');
      expect((io.ask as ReturnType<typeof vi.fn>).mock.calls[1][0]).toContain('OAuth');
      expect((io.ask as ReturnType<typeof vi.fn>).mock.calls[2][0]).toContain('database');
    });

    it('limits to 5 clarifying questions maximum', async () => {
      const manyQuestions = `1. Q1?
2. Q2?
3. Q3?
4. Q4?
5. Q5?
6. Q6?
7. Q7?`;
      const llm = mockLlm(manyQuestions, designDocResponse);
      const io = mockIO('A1', 'A2', 'A3', 'A4', 'A5', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      // 5 questions (capped) + 1 approval = 6 ask calls
      expect(io.ask).toHaveBeenCalledTimes(6);
    });

    it('handles LLM returning no questions gracefully', async () => {
      const noQuestions = 'No clarifying questions needed.';
      const llm = mockLlm(noQuestions, designDocResponse);
      const io = mockIO('yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      const graph = await loop.build(intent);

      expect(graph).toBeDefined();
      // Only the approval question
      expect(io.ask).toHaveBeenCalledTimes(1);
    });
  });

  describe('design document generation', () => {
    it('sends goal + answers to LLM for design doc generation', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      const secondPrompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
      expect(secondPrompt).toContain(intent.goal);
      expect(secondPrompt).toContain('JWT');
      expect(secondPrompt).toContain('Yes');
      expect(secondPrompt).toContain('PostgreSQL');
      expect(secondPrompt).toMatch(/design\s*doc/i);
    });

    it('displays generated design doc to user via io.display()', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      expect(io.display).toHaveBeenCalled();
      const displayedContent = (io.display as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(displayedContent).toContain(designDocResponse);
    });
  });

  describe('approval flow', () => {
    it('asks user to approve the design doc', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      // Last ask call should be the approval question
      const lastCall = (io.ask as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as string;
      expect(lastCall).toMatch(/approv|confirm|yes.*no/i);
    });

    it('on approval, delegates to LlmGraphBuilder.build()', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      expect(graphBuilder.build).toHaveBeenCalledOnce();
      // The intent passed to graphBuilder should contain the design doc as the goal
      const passedIntent = (graphBuilder.build as ReturnType<typeof vi.fn>).mock.calls[0][0] as PlanIntent;
      expect(passedIntent.goal).toContain(designDocResponse);
    });

    it('returns PlanGraph from graphBuilder', async () => {
      const expectedGraph: PlanGraph = {
        tasks: [
          { id: 'impl:auth', objective: 'Auth', requiredSkills: ['cli:auth'], dependsOn: [] },
        ],
      };
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'yes');
      const graphBuilder = mockGraphBuilder(expectedGraph);
      const loop = new InterviewLoop(llm, io, graphBuilder);

      const graph = await loop.build(intent);

      expect(graph).toEqual(expectedGraph);
    });
  });

  describe('rejection flow', () => {
    it('on rejection, asks what to change and generates revised design doc', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse, revisedDesignDocResponse);
      // Q1, Q2, Q3 answers, then reject, feedback, then approve
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'no', 'Add OAuth support', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      // LLM called 3 times: questions, first design doc, revised design doc
      expect(llm.complete).toHaveBeenCalledTimes(3);
      // Revision prompt should include feedback
      const revisionPrompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[2][0] as string;
      expect(revisionPrompt).toContain('Add OAuth support');
    });

    it('displays revised design doc after rejection', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse, revisedDesignDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'no', 'Add OAuth support', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      // display called twice: original + revised
      expect(io.display).toHaveBeenCalledTimes(2);
    });

    it('allows multiple rejection rounds before approval', async () => {
      const rev2 = '# Revised design v2';
      const rev3 = '# Revised design v3';
      const llm = mockLlm(questionsResponse, designDocResponse, revisedDesignDocResponse, rev2, rev3);
      // answers, reject, feedback, reject, feedback, reject, feedback, approve
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'no', 'change1', 'no', 'change2', 'no', 'change3', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      // 3 rejections should succeed (max is 3)
      // Wait — re-reading the spec: "Maximum 3 revision rounds after rejection (then abort with error)"
      // So: first attempt + 3 revisions. After 3 rejections, on the 3rd revision if rejected again -> abort
      // Rejections: no, no, no => 3 revision rounds => last one must be approved or error
      // Let me fix: 3 rejections => 3 revision attempts, last one approved
      await loop.build(intent);

      expect(llm.complete).toHaveBeenCalledTimes(5); // questions + initial + 3 revisions
      expect(graphBuilder.build).toHaveBeenCalledOnce();
    });

    it('aborts with error after maximum 3 revision rounds', async () => {
      const llm = mockLlm(
        questionsResponse,
        designDocResponse,
        revisedDesignDocResponse,
        '# rev2',
        '# rev3',
      );
      // answers, reject, fb, reject, fb, reject, fb, reject (4th rejection = abort)
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'no', 'fb1', 'no', 'fb2', 'no', 'fb3', 'no');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await expect(loop.build(intent)).rejects.toThrow(/max.*revision|revision.*limit|abort/i);
    });
  });

  describe('approval variants', () => {
    it('treats "yes" as approval (case insensitive)', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'YES');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      const graph = await loop.build(intent);

      expect(graph).toBeDefined();
      expect(graphBuilder.build).toHaveBeenCalledOnce();
    });

    it('treats "y" as approval', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'y');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      const graph = await loop.build(intent);

      expect(graph).toBeDefined();
      expect(graphBuilder.build).toHaveBeenCalledOnce();
    });

    it('treats anything other than yes/y as rejection', async () => {
      const llm = mockLlm(questionsResponse, designDocResponse, revisedDesignDocResponse);
      const io = mockIO('JWT', 'Yes', 'PostgreSQL', 'nah', 'fix it', 'yes');
      const graphBuilder = mockGraphBuilder();
      const loop = new InterviewLoop(llm, io, graphBuilder);

      await loop.build(intent);

      // Should have gone through rejection flow
      expect(llm.complete).toHaveBeenCalledTimes(3);
    });
  });
});
