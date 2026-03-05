/**
 * Code Review Agent -- Full Beast Loop Scenario
 *
 * Simulates the complete 4-phase Beast Loop pipeline using FakeLlmAdapter,
 * so no API keys or external services are needed. This demonstrates how the
 * orchestrator's ingestion, planning, execution, and closure phases work
 * together to produce a structured code review.
 *
 * Phases:
 *   1. Ingestion  -- Deterministic regex scan for injection patterns
 *   2. Planning   -- FakeLlm generates a 3-task review plan; critique evaluates it
 *   3. Execution  -- FakeLlm executes each review task in order
 *   4. Closure    -- Assemble results with call count and cost summary
 */

import { FakeLlmAdapter } from "../../../../franken-orchestrator/tests/helpers/fake-llm-adapter.js";

// ---------------------------------------------------------------------------
// Sample code to review
// ---------------------------------------------------------------------------

const SAMPLE_CODE = `
app.post('/register', async (req, res) => {
  const { email, password, phone } = req.body;
  const user = await db.query(
    'INSERT INTO users (email, pwd) VALUES ($1, $2)',
    [email, hashPassword(password)]
  );
  const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: '24h' });
  res.json({ token });
});
`.trim();

// ---------------------------------------------------------------------------
// Pattern-matched FakeLlm responses
// ---------------------------------------------------------------------------

const REVIEW_PLAN = JSON.stringify({
  tasks: [
    { id: "task-1", name: "SQL injection analysis", focus: "database queries" },
    { id: "task-2", name: "Input validation check", focus: "request body fields" },
    { id: "task-3", name: "Authentication review", focus: "JWT and session handling" },
  ],
});

const CRITIQUE_RESULT = JSON.stringify({
  verdict: "pass",
  score: 0.85,
  rationale: "Plan covers the three most critical security domains for a registration endpoint.",
});

const SQL_FINDING = JSON.stringify({
  finding: "SQL injection",
  severity: "info",
  detail:
    "The query uses parameterized placeholders ($1, $2) which prevents SQL injection. " +
    "However, consider adding an ORM layer or query builder for consistency across the codebase.",
  recommendation: "Adopt parameterized queries project-wide; consider an ORM like Drizzle or Prisma.",
});

const VALIDATION_FINDING = JSON.stringify({
  finding: "Missing input validation",
  severity: "high",
  detail:
    "The 'phone' field is destructured from req.body but never validated or stored. " +
    "The 'email' field is passed directly to the query without format validation. " +
    "The 'password' field has no minimum length or complexity check.",
  recommendation:
    "Add Zod or Joi schema validation for all request body fields before processing.",
});

const AUTH_FINDING = JSON.stringify({
  finding: "Authentication concerns",
  severity: "medium",
  detail:
    "JWT token expires in 24h which is reasonable but there is no refresh token mechanism. " +
    "The SECRET is referenced as a variable -- ensure it is loaded from environment variables " +
    "and is sufficiently long (256+ bits). No rate limiting on the registration endpoint.",
  recommendation:
    "Implement refresh token rotation, load SECRET from env, add rate limiting middleware.",
});

// ---------------------------------------------------------------------------
// Configure FakeLlmAdapter with pattern-matched responses
// ---------------------------------------------------------------------------

// Pattern order matters: FakeLlmAdapter uses first-match-wins.
// The critique prompt includes a [CRITIQUE] marker so it can be matched
// before task-specific patterns (since the plan JSON may contain task names
// like "Authentication review" that would otherwise trigger a task pattern).
// The broad "create a.*plan" pattern is last because it only appears in the
// initial planning prompt.
const llm = new FakeLlmAdapter({
  patterns: [
    { match: /\[CRITIQUE\]/i, response: CRITIQUE_RESULT },
    { match: /SQL injection/i, response: SQL_FINDING },
    { match: /input validation/i, response: VALIDATION_FINDING },
    { match: /authentication/i, response: AUTH_FINDING },
    { match: /create a.*plan/i, response: REVIEW_PLAN },
  ],
  defaultResponse: JSON.stringify({ error: "No matching pattern for this prompt" }),
  latencyMs: 50,
});

// ---------------------------------------------------------------------------
// Types for the scenario
// ---------------------------------------------------------------------------

interface ReviewTask {
  id: string;
  name: string;
  focus: string;
}

interface PhaseResult {
  phase: string;
  status: "passed" | "completed";
  durationMs: number;
  detail: unknown;
}

interface BeastResult {
  sessionId: string;
  status: "completed";
  phases: PhaseResult[];
  findings: unknown[];
  summary: {
    totalFindings: number;
    bySeverity: Record<string, number>;
    llmCallCount: number;
    estimatedCostUsd: string;
  };
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Phase 1: Ingestion -- deterministic regex scan
// ---------------------------------------------------------------------------

async function runIngestion(code: string): Promise<PhaseResult> {
  const start = performance.now();
  console.log("  Scanning for prompt injection patterns...");

  const injectionPatterns = [
    { name: "Ignore instructions", pattern: /ignore\s+(previous|all)\s+instructions/i },
    { name: "System prompt leak", pattern: /reveal\s+(your|the)\s+(system\s+)?prompt/i },
    { name: "Role override", pattern: /you\s+are\s+now\s+/i },
    { name: "Jailbreak attempt", pattern: /\bDAN\b|do\s+anything\s+now/i },
  ];

  const detectedThreats: string[] = [];
  for (const { name, pattern } of injectionPatterns) {
    if (pattern.test(code)) {
      detectedThreats.push(name);
    }
  }

  const durationMs = Math.round(performance.now() - start);

  if (detectedThreats.length > 0) {
    console.log(`  WARNING: Detected threats: ${detectedThreats.join(", ")}`);
  } else {
    console.log("  No injection patterns detected. Input is clean.");
  }

  return {
    phase: "ingestion",
    status: "passed",
    durationMs,
    detail: {
      patternsChecked: injectionPatterns.length,
      threatsDetected: detectedThreats.length,
      threats: detectedThreats,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Planning -- FakeLlm generates plan, critique evaluates it
// ---------------------------------------------------------------------------

async function runPlanning(): Promise<{ result: PhaseResult; tasks: ReviewTask[] }> {
  const start = performance.now();

  // Step 2a: Generate a review plan
  console.log("  Requesting review plan from LLM...");
  const planResponse = await llm.complete(
    `Analyze this code and create a review plan with 3 tasks:\n\n${SAMPLE_CODE}`,
  );
  const plan = JSON.parse(planResponse) as { tasks: ReviewTask[] };
  console.log(`  Plan received: ${plan.tasks.length} tasks`);
  for (const task of plan.tasks) {
    console.log(`    - [${task.id}] ${task.name} (focus: ${task.focus})`);
  }

  // Step 2b: Critique the plan
  console.log("  Submitting plan for critique evaluation...");
  const critiqueResponse = await llm.complete(
    `[CRITIQUE] Evaluate this plan for completeness and quality:\n${planResponse}`,
  );
  const critique = JSON.parse(critiqueResponse) as {
    verdict: string;
    score: number;
    rationale: string;
  };
  console.log(`  Critique verdict: ${critique.verdict} (score: ${critique.score})`);
  console.log(`  Rationale: ${critique.rationale}`);

  const durationMs = Math.round(performance.now() - start);

  return {
    result: {
      phase: "planning",
      status: "completed",
      durationMs,
      detail: {
        taskCount: plan.tasks.length,
        critiqueVerdict: critique.verdict,
        critiqueScore: critique.score,
      },
    },
    tasks: plan.tasks,
  };
}

// ---------------------------------------------------------------------------
// Phase 3: Execution -- FakeLlm runs each review task
// ---------------------------------------------------------------------------

async function runExecution(tasks: ReviewTask[]): Promise<{
  result: PhaseResult;
  findings: unknown[];
}> {
  const start = performance.now();
  const findings: unknown[] = [];

  for (const task of tasks) {
    console.log(`  Executing [${task.id}]: ${task.name}...`);
    const response = await llm.complete(
      `Perform a ${task.name} review focusing on ${task.focus} for this code:\n\n${SAMPLE_CODE}`,
    );
    const finding = JSON.parse(response);
    findings.push(finding);
    console.log(`    Severity: ${finding.severity}`);
    console.log(`    Detail: ${finding.detail}`);
    console.log(`    Recommendation: ${finding.recommendation}`);
    console.log();
  }

  const durationMs = Math.round(performance.now() - start);

  return {
    result: {
      phase: "execution",
      status: "completed",
      durationMs,
      detail: {
        tasksExecuted: tasks.length,
        findingsProduced: findings.length,
      },
    },
    findings,
  };
}

// ---------------------------------------------------------------------------
// Phase 4: Closure -- assemble results, compute cost summary
// ---------------------------------------------------------------------------

function runClosure(
  phases: PhaseResult[],
  findings: unknown[],
  totalStart: number,
): BeastResult {
  const start = performance.now();

  // Count findings by severity
  const bySeverity: Record<string, number> = {};
  for (const f of findings) {
    const severity = (f as { severity?: string }).severity ?? "unknown";
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
  }

  // Estimate cost: each FakeLlm call simulates ~500 input + 200 output tokens
  // Using approximate rates: $0.003/1K input, $0.015/1K output
  const estimatedInputTokens = llm.callCount * 500;
  const estimatedOutputTokens = llm.callCount * 200;
  const estimatedCost =
    (estimatedInputTokens / 1000) * 0.003 + (estimatedOutputTokens / 1000) * 0.015;

  const closureDurationMs = Math.round(performance.now() - start);

  const closurePhase: PhaseResult = {
    phase: "closure",
    status: "completed",
    durationMs: closureDurationMs,
    detail: {
      llmCallCount: llm.callCount,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd: estimatedCost.toFixed(6),
    },
  };

  const allPhases = [...phases, closurePhase];
  const totalDurationMs = Math.round(performance.now() - totalStart);

  return {
    sessionId: `review-${Date.now()}`,
    status: "completed",
    phases: allPhases,
    findings,
    summary: {
      totalFindings: findings.length,
      bySeverity,
      llmCallCount: llm.callCount,
      estimatedCostUsd: estimatedCost.toFixed(6),
    },
    durationMs: totalDurationMs,
  };
}

// ---------------------------------------------------------------------------
// Main -- run the full Beast Loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const totalStart = performance.now();

  console.log("=== Code Review Agent -- Full Beast Loop Scenario ===");
  console.log();
  console.log("This scenario uses FakeLlmAdapter (no API keys needed).");
  console.log("It demonstrates the 4-phase Beast Loop pipeline with pattern-matched LLM responses.");
  console.log();

  // Show the code under review
  console.log("--- Code Under Review ---");
  console.log();
  console.log(SAMPLE_CODE);
  console.log();

  // Phase 1: Ingestion
  console.log("--- Phase 1: Ingestion ---");
  const ingestionResult = await runIngestion(SAMPLE_CODE);
  console.log();

  // Phase 2: Planning
  console.log("--- Phase 2: Planning ---");
  const { result: planningResult, tasks } = await runPlanning();
  console.log();

  // Phase 3: Execution
  console.log("--- Phase 3: Execution ---");
  const { result: executionResult, findings } = await runExecution(tasks);

  // Phase 4: Closure
  console.log("--- Phase 4: Closure ---");
  const beastResult = runClosure(
    [ingestionResult, planningResult, executionResult],
    findings,
    totalStart,
  );

  console.log(`  LLM calls made: ${llm.callCount}`);
  console.log(`  Prompts sent:`);
  for (let i = 0; i < llm.calls.length; i++) {
    const prompt = llm.calls[i]!.prompt;
    const preview = prompt.length > 80 ? prompt.substring(0, 80) + "..." : prompt;
    console.log(`    [${i + 1}] ${preview}`);
  }
  console.log();

  // Final output
  console.log("--- Beast Loop Result ---");
  console.log();
  console.log(JSON.stringify(beastResult, null, 2));
}

main().catch((err) => {
  console.error("Beast Loop failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
