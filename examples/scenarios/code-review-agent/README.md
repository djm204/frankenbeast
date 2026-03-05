# Code Review Agent -- Full Beast Loop Scenario

Demonstrates the complete 4-phase Beast Loop pipeline by simulating an AI code review agent. Uses `FakeLlmAdapter` with pattern-matched responses, so no API keys or external services are needed.

## The Beast Loop Pipeline

The Beast Loop is the orchestrator's core execution model. Every request flows through four phases in order:

```
Input --> [Ingestion] --> [Planning] --> [Execution] --> [Closure] --> Result
```

### Phase 1: Ingestion

Deterministic regex scanning -- no LLM involved. The input (code to review) is checked against known injection patterns:

- **Ignore instructions** (`ignore previous instructions`)
- **System prompt leaks** (`reveal your prompt`)
- **Role overrides** (`you are now`)
- **Jailbreak attempts** (`DAN`, `do anything now`)

If any pattern matches, the loop aborts before any LLM call is made. This is a hard guardrail -- it cannot be overridden by the LLM.

### Phase 2: Planning

Two LLM calls:

1. **Plan generation** -- The LLM receives the code and produces a structured 3-task review plan (SQL injection analysis, input validation, authentication review).
2. **Critique evaluation** -- The plan is submitted to a critique step that scores it for completeness and quality. If the critique verdict is "fail", the planner would re-generate (this scenario always passes).

The critique loop is a key design element: it prevents the LLM from producing low-quality or incomplete plans that would waste execution budget.

### Phase 3: Execution

One LLM call per task (3 calls total). Each task sends a focused prompt to the LLM and receives a structured finding with severity, detail, and recommendation. Tasks run in sequence -- each must complete before the next starts.

### Phase 4: Closure

Assembles the final `BeastResult` with:

- All phase results and their durations
- All findings from the execution phase
- Summary statistics (finding count, severity breakdown)
- LLM call count and estimated token cost

## How FakeLlmAdapter Works

`FakeLlmAdapter` is a test double that replaces real LLM API calls with pattern-matched responses. It lives in `franken-orchestrator/tests/helpers/fake-llm-adapter.ts`.

```typescript
interface FakeLlmOptions {
  patterns?: Array<{ match: RegExp | string; response: string }>;
  defaultResponse?: string;
  latencyMs?: number;
  errorOnCall?: { callNumber: number; error: Error };
}
```

- **patterns** -- An ordered list of regex/string matchers. First match wins. When the `complete()` method receives a prompt, it checks each pattern in order and returns the first matching response.
- **defaultResponse** -- Returned when no pattern matches. Defaults to `"OK"`.
- **latencyMs** -- Artificial delay per call, simulating network round-trips.
- **errorOnCall** -- Throws a specific error on the Nth call, useful for testing error recovery.
- **callCount / calls** -- Built-in call tracking for assertions and cost estimation.

This scenario configures five patterns:

| Pattern | Response |
|---------|----------|
| `/plan\|review\|analyze/i` | 3-task review plan (JSON) |
| `/critique\|evaluate/i` | Critique with verdict "pass", score 0.85 |
| `/SQL injection/i` | Finding about parameterized queries |
| `/input validation/i` | Finding about missing phone/email validation |
| `/authentication/i` | Finding about JWT and refresh tokens |

## What This Demonstrates

1. **Deterministic guardrails first** -- Injection scanning happens before any LLM call. The firewall is a hard gate, not a suggestion.

2. **Plan-then-critique** -- The orchestrator never jumps straight to execution. Every plan goes through a critique loop that can reject and force re-planning.

3. **Structured task execution** -- Tasks are defined with typed IDs and run in order. Each produces a structured output, not free-form text.

4. **Cost tracking** -- Even with fake calls, the closure phase estimates token spend. In production, real adapter usage metrics feed into the Governor's budget breakers.

5. **No API keys needed** -- The entire pipeline runs locally with deterministic outputs, making it suitable for CI, demos, and onboarding.

## Prerequisites

- Node.js 18+
- No API keys required

## Run

```bash
npm start
```

## Expected Output

```
=== Code Review Agent -- Full Beast Loop Scenario ===

This scenario uses FakeLlmAdapter (no API keys needed).
It demonstrates the 4-phase Beast Loop pipeline with pattern-matched LLM responses.

--- Code Under Review ---

app.post('/register', async (req, res) => {
  const { email, password, phone } = req.body;
  const user = await db.query(
    'INSERT INTO users (email, pwd) VALUES ($1, $2)',
    [email, hashPassword(password)]
  );
  const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: '24h' });
  res.json({ token });
});

--- Phase 1: Ingestion ---
  Scanning for prompt injection patterns...
  No injection patterns detected. Input is clean.

--- Phase 2: Planning ---
  Requesting review plan from LLM...
  Plan received: 3 tasks
    - [task-1] SQL injection analysis (focus: database queries)
    - [task-2] Input validation check (focus: request body fields)
    - [task-3] Authentication review (focus: JWT and session handling)
  Submitting plan for critique evaluation...
  Critique verdict: pass (score: 0.85)
  Rationale: Plan covers the three most critical security domains...

--- Phase 3: Execution ---
  Executing [task-1]: SQL injection analysis...
    Severity: info
    Detail: The query uses parameterized placeholders ($1, $2)...
    Recommendation: Adopt parameterized queries project-wide...

  Executing [task-2]: Input validation check...
    Severity: high
    Detail: The 'phone' field is destructured from req.body...
    Recommendation: Add Zod or Joi schema validation...

  Executing [task-3]: Authentication review...
    Severity: medium
    Detail: JWT token expires in 24h which is reasonable...
    Recommendation: Implement refresh token rotation...

--- Phase 4: Closure ---
  LLM calls made: 5
  Prompts sent:
    [1] Analyze this code and create a review plan with 3 tasks: ...
    [2] Evaluate this review plan for completeness and quality: ...
    [3] Perform a SQL injection analysis review focusing on database queries...
    [4] Perform a Input validation check review focusing on request body fields...
    [5] Perform a Authentication review review focusing on JWT and session handling...

--- Beast Loop Result ---

{
  "sessionId": "review-...",
  "status": "completed",
  "phases": [ ... ],
  "findings": [ ... ],
  "summary": {
    "totalFindings": 3,
    "bySeverity": { "info": 1, "high": 1, "medium": 1 },
    "llmCallCount": 5,
    "estimatedCostUsd": "0.022500"
  },
  "durationMs": ...
}
```
