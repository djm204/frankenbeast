import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const WorkflowRegressionMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1),
}).strict();

export const WorkflowRegressionFixtureSchema = z.object({
  fixtureId: z.string().min(1),
  title: z.string().min(1),
  transcript: z.array(WorkflowRegressionMessageSchema).min(1),
  expectedDecisions: z.array(z.string().min(1)).min(1),
  prohibitedActions: z.array(z.string().min(1)),
  tags: z.array(z.string().min(1)).default([]),
  notes: z.string().optional(),
}).strict();

export const WorkflowRegressionCandidateResultSchema = z.object({
  fixtureId: z.string().min(1),
  decisions: z.array(z.string().min(1)),
  actions: z.array(z.string().min(1)),
  notes: z.string().optional(),
}).strict();

export const WorkflowRegressionCandidateResultsSchema = z.array(WorkflowRegressionCandidateResultSchema);

export type WorkflowRegressionMessage = z.infer<typeof WorkflowRegressionMessageSchema>;
export type WorkflowRegressionFixture = z.infer<typeof WorkflowRegressionFixtureSchema>;
export type WorkflowRegressionCandidateResult = z.infer<typeof WorkflowRegressionCandidateResultSchema>;

export interface WorkflowRegressionOptions {
  readonly minPassRate?: number;
  readonly minDelta?: number;
}

export interface WorkflowRegressionFixtureResult {
  readonly fixtureId: string;
  readonly title: string;
  readonly passed: boolean;
  readonly baselinePassed: boolean;
  readonly delta: number;
  readonly expectedDecisionsFound: readonly string[];
  readonly missingExpectedDecisions: readonly string[];
  readonly prohibitedActionsObserved: readonly string[];
  readonly candidateExamples: readonly string[];
  readonly baselineExamples: readonly string[];
}

export interface WorkflowRegressionReport {
  readonly passed: boolean;
  readonly thresholds: {
    readonly minPassRate: number;
    readonly minDelta: number;
  };
  readonly summary: {
    readonly fixtureCount: number;
    readonly candidatePassed: number;
    readonly baselinePassed: number;
    readonly passRate: number;
    readonly averageDelta: number;
  };
  readonly results: readonly WorkflowRegressionFixtureResult[];
}

export function loadWorkflowRegressionFixtures(root: string): WorkflowRegressionFixture[] {
  return workflowFixtureFiles(root)
    .map((path) => loadWorkflowRegressionFixture(path))
    .sort((left, right) => left.fixtureId.localeCompare(right.fixtureId));
}

export function loadWorkflowRegressionFixture(path: string): WorkflowRegressionFixture {
  try {
    return WorkflowRegressionFixtureSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) as WorkflowRegressionFixture;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid workflow regression fixture ${path}: ${detail}`);
  }
}

export function loadWorkflowRegressionCandidateResults(path: string): WorkflowRegressionCandidateResult[] {
  try {
    return WorkflowRegressionCandidateResultsSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) as WorkflowRegressionCandidateResult[];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid workflow regression result ${path}: ${detail}`);
  }
}

export function evaluateWorkflowRegression(
  fixtures: readonly WorkflowRegressionFixture[],
  baselineResults: readonly WorkflowRegressionCandidateResult[],
  candidateResults: readonly WorkflowRegressionCandidateResult[],
  options: WorkflowRegressionOptions = {},
): WorkflowRegressionReport {
  assertUniqueFixtureIds(fixtures);
  const baselineByFixture = indexResults('baseline', baselineResults);
  const candidateByFixture = indexResults('candidate', candidateResults);
  const minPassRate = options.minPassRate ?? 1;
  const minDelta = options.minDelta ?? 0;
  validateThreshold('minPassRate', minPassRate, 0, 1);
  validateThreshold('minDelta', minDelta, -2, 2);

  const results = fixtures.map((fixture) => {
    const baseline = requireResult('baseline', baselineByFixture, fixture.fixtureId);
    const candidate = requireResult('candidate', candidateByFixture, fixture.fixtureId);
    const baselineEvaluation = evaluateOne(fixture, baseline);
    const candidateEvaluation = evaluateOne(fixture, candidate);
    return {
      fixtureId: fixture.fixtureId,
      title: fixture.title,
      passed: candidateEvaluation.passed,
      baselinePassed: baselineEvaluation.passed,
      delta: candidateEvaluation.score - baselineEvaluation.score,
      expectedDecisionsFound: candidateEvaluation.expectedDecisionsFound,
      missingExpectedDecisions: candidateEvaluation.missingExpectedDecisions,
      prohibitedActionsObserved: candidateEvaluation.prohibitedActionsObserved,
      candidateExamples: candidateEvaluation.examples,
      baselineExamples: baselineEvaluation.examples,
    } satisfies WorkflowRegressionFixtureResult;
  });

  const fixtureCount = results.length;
  const candidatePassed = results.filter((result) => result.passed).length;
  const baselinePassed = results.filter((result) => result.baselinePassed).length;
  const passRate = fixtureCount === 0 ? 0 : candidatePassed / fixtureCount;
  const averageDelta = fixtureCount === 0
    ? 0
    : results.reduce((sum, result) => sum + result.delta, 0) / fixtureCount;

  return {
    passed: fixtureCount > 0 && passRate >= minPassRate && averageDelta >= minDelta,
    thresholds: { minPassRate, minDelta },
    summary: { fixtureCount, candidatePassed, baselinePassed, passRate, averageDelta },
    results,
  };
}

interface SingleEvaluation {
  readonly passed: boolean;
  readonly score: number;
  readonly expectedDecisionsFound: readonly string[];
  readonly missingExpectedDecisions: readonly string[];
  readonly prohibitedActionsObserved: readonly string[];
  readonly examples: readonly string[];
}

function evaluateOne(fixture: WorkflowRegressionFixture, result: WorkflowRegressionCandidateResult): SingleEvaluation {
  const decisions = new Set(result.decisions.map(normalize));
  const actions = result.actions.map(normalize);
  const expectedDecisionsFound = fixture.expectedDecisions.filter((decision) => decisions.has(normalize(decision)));
  const missingExpectedDecisions = fixture.expectedDecisions.filter((decision) => !decisions.has(normalize(decision)));
  const prohibitedActionsObserved = fixture.prohibitedActions.filter((action) => matchesObservedAction(actions, normalize(action)));
  const passed = missingExpectedDecisions.length === 0 && prohibitedActionsObserved.length === 0;
  const decisionScore = expectedDecisionsFound.length / fixture.expectedDecisions.length;
  const prohibitedPenalty = fixture.prohibitedActions.length === 0
    ? 0
    : prohibitedActionsObserved.length / fixture.prohibitedActions.length;
  return {
    passed,
    score: decisionScore - prohibitedPenalty,
    expectedDecisionsFound,
    missingExpectedDecisions,
    prohibitedActionsObserved,
    examples: [...result.decisions.slice(0, 3), ...result.actions.slice(0, 3)],
  };
}

function workflowFixtureFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...workflowFixtureFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.workflow.json') && statSync(path).isFile()) {
      out.push(path);
    }
  }
  return out;
}

function assertUniqueFixtureIds(fixtures: readonly WorkflowRegressionFixture[]): void {
  const seen = new Set<string>();
  for (const fixture of fixtures) {
    if (seen.has(fixture.fixtureId)) {
      throw new Error(`Duplicate workflow regression fixture id: ${fixture.fixtureId}`);
    }
    seen.add(fixture.fixtureId);
  }
}

function indexResults(kind: string, results: readonly WorkflowRegressionCandidateResult[]): Map<string, WorkflowRegressionCandidateResult> {
  const byFixture = new Map<string, WorkflowRegressionCandidateResult>();
  for (const result of results) {
    if (byFixture.has(result.fixtureId)) {
      throw new Error(`Duplicate ${kind} workflow regression result for fixture: ${result.fixtureId}`);
    }
    byFixture.set(result.fixtureId, result);
  }
  return byFixture;
}

function requireResult(
  kind: string,
  byFixture: ReadonlyMap<string, WorkflowRegressionCandidateResult>,
  fixtureId: string,
): WorkflowRegressionCandidateResult {
  const result = byFixture.get(fixtureId);
  if (!result) {
    throw new Error(`Missing ${kind} workflow regression result for fixture: ${fixtureId}`);
  }
  return result;
}

function validateThreshold(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a finite number between ${min} and ${max}`);
  }
}

function matchesObservedAction(observedActions: readonly string[], prohibitedAction: string): boolean {
  return observedActions.some((observedAction) => {
    if (observedAction === prohibitedAction) {
      return true;
    }
    const index = observedAction.indexOf(prohibitedAction);
    return index >= 0 && !hasNegatedPrefix(observedAction.slice(0, index));
  });
}

function hasNegatedPrefix(prefix: string): boolean {
  return /(?:^|\b)(?:do not|don't|did not|didn't|refuse to|refused to|avoid|avoided|without)\s+$/.test(prefix);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
