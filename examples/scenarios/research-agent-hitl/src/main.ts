/**
 * Research Agent with Human-in-the-Loop (HITL) Approval
 *
 * Demonstrates a research agent that triggers HITL approval when a budget
 * threshold is crossed or when a task is marked as requiring human approval.
 * Uses Ollama (local) so no API keys are needed.
 *
 * Key concepts:
 *   - HITL approval as a first-class primitive via CLI readline
 *   - Budget gates that pause execution and prompt the human
 *   - Task-level `requiresApproval` flags for high-stakes operations
 *   - OllamaAdapter for zero-cost local inference
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { OllamaAdapter } from "../../../../frankenfirewall/src/adapters/ollama/ollama-adapter.js";
import type { UnifiedRequest } from "../../../../frankenfirewall/src/types/unified-request.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const BUDGET_THRESHOLD = parseFloat(process.env.BUDGET_THRESHOLD ?? "0.00");

// ---------------------------------------------------------------------------
// HITL Approval Channel
// ---------------------------------------------------------------------------

async function requestApproval(reason: string, details: Record<string, unknown>): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log();
  console.log("========================================");
  console.log("  HUMAN-IN-THE-LOOP APPROVAL REQUIRED");
  console.log("========================================");
  console.log(`Reason: ${reason}`);
  console.log(`Details: ${JSON.stringify(details, null, 2)}`);
  const answer = await rl.question("Approve this action? (y/n): ");
  rl.close();
  return answer.toLowerCase().startsWith("y");
}

// ---------------------------------------------------------------------------
// Research Task Definitions
// ---------------------------------------------------------------------------

interface ResearchTask {
  id: string;
  name: string;
  prompt: string;
  requiresApproval: boolean;
  estimatedCostUsd: number;
}

const RESEARCH_TASKS: ResearchTask[] = [
  {
    id: "task-1",
    name: "Literature survey",
    prompt:
      "You are a research assistant. Provide a brief 3-sentence summary of recent advances " +
      "in transformer architectures for natural language processing. Focus on efficiency improvements.",
    requiresApproval: false,
    estimatedCostUsd: 0.0,
  },
  {
    id: "task-2",
    name: "Methodology comparison",
    prompt:
      "You are a research assistant. Compare two approaches to model compression: " +
      "knowledge distillation vs quantization. List 2 pros and 2 cons for each in a short list.",
    requiresApproval: false,
    estimatedCostUsd: 0.0,
  },
  {
    id: "task-3",
    name: "Deep analysis with external data",
    prompt:
      "You are a research assistant performing a deep analysis. Analyze the trade-offs between " +
      "fine-tuning large language models vs using retrieval-augmented generation (RAG) for " +
      "domain-specific applications. Provide a structured comparison with cost, latency, and " +
      "accuracy considerations.",
    requiresApproval: true,
    estimatedCostUsd: 0.0,
  },
];

// ---------------------------------------------------------------------------
// Task Result Tracking
// ---------------------------------------------------------------------------

interface TaskResult {
  taskId: string;
  taskName: string;
  status: "completed" | "skipped";
  response?: string;
  skipReason?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Adapter Helper -- send a prompt through the OllamaAdapter pipeline
// ---------------------------------------------------------------------------

let requestCounter = 0;

async function sendPrompt(
  adapter: OllamaAdapter,
  prompt: string,
): Promise<{ content: string; inputTokens: number; outputTokens: number; costUsd: number }> {
  requestCounter++;
  const requestId = `req-${requestCounter}`;

  const unifiedRequest: UnifiedRequest = {
    id: requestId,
    provider: "ollama",
    model: OLLAMA_MODEL,
    system: "You are a helpful research assistant. Be concise and factual.",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 512,
  };

  // IAdapter pipeline: transformRequest -> execute -> transformResponse
  const providerRequest = adapter.transformRequest(unifiedRequest);
  const rawResponse = await adapter.execute(providerRequest);
  const unifiedResponse = adapter.transformResponse(rawResponse, requestId);

  return {
    content: unifiedResponse.content ?? "",
    inputTokens: unifiedResponse.usage.input_tokens,
    outputTokens: unifiedResponse.usage.output_tokens,
    costUsd: unifiedResponse.usage.cost_usd,
  };
}

// ---------------------------------------------------------------------------
// Budget Gate -- check whether approval is needed
// ---------------------------------------------------------------------------

async function checkBudgetGate(
  task: ResearchTask,
  totalSpend: number,
): Promise<{ approved: boolean; reason?: string }> {
  // Condition 1: Task explicitly requires approval
  if (task.requiresApproval) {
    const approved = await requestApproval(
      `Task "${task.name}" is flagged as requiring human approval`,
      {
        taskId: task.id,
        taskName: task.name,
        flag: "requiresApproval",
        currentTotalSpend: `$${totalSpend.toFixed(6)}`,
        budgetThreshold: `$${BUDGET_THRESHOLD.toFixed(6)}`,
      },
    );
    if (!approved) {
      return { approved: false, reason: "Human denied approval (requiresApproval flag)" };
    }
  }

  // Condition 2: Total spend exceeds budget threshold
  if (totalSpend > BUDGET_THRESHOLD) {
    const approved = await requestApproval(
      `Total spend ($${totalSpend.toFixed(6)}) exceeds budget threshold ($${BUDGET_THRESHOLD.toFixed(6)})`,
      {
        taskId: task.id,
        taskName: task.name,
        currentTotalSpend: `$${totalSpend.toFixed(6)}`,
        budgetThreshold: `$${BUDGET_THRESHOLD.toFixed(6)}`,
        overage: `$${(totalSpend - BUDGET_THRESHOLD).toFixed(6)}`,
      },
    );
    if (!approved) {
      return { approved: false, reason: "Human denied approval (budget threshold exceeded)" };
    }
  }

  return { approved: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Research Agent with HITL Approval ===");
  console.log();
  console.log("This scenario uses OllamaAdapter for local LLM inference.");
  console.log("HITL approval is triggered when:");
  console.log("  1. A task has requiresApproval: true");
  console.log(`  2. Total spend exceeds the budget threshold ($${BUDGET_THRESHOLD.toFixed(2)})`);
  console.log();
  console.log(`Ollama endpoint: ${OLLAMA_BASE_URL}`);
  console.log(`Model: ${OLLAMA_MODEL}`);
  console.log(`Budget threshold: $${BUDGET_THRESHOLD.toFixed(2)}`);
  console.log();

  // Initialize the OllamaAdapter
  const adapter = new OllamaAdapter({
    model: OLLAMA_MODEL,
    baseUrl: OLLAMA_BASE_URL,
  });

  const results: TaskResult[] = [];
  let totalSpend = 0;
  let completedCount = 0;
  let skippedCount = 0;

  // Execute each research task
  for (const task of RESEARCH_TASKS) {
    console.log("-------------------------------------------");
    console.log(`Task [${task.id}]: ${task.name}`);
    console.log(`  Requires approval: ${task.requiresApproval}`);
    console.log();

    // Check budget gate before executing
    const gate = await checkBudgetGate(task, totalSpend);

    if (!gate.approved) {
      console.log(`  SKIPPED: ${gate.reason}`);
      console.log();
      results.push({
        taskId: task.id,
        taskName: task.name,
        status: "skipped",
        skipReason: gate.reason,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      });
      skippedCount++;
      continue;
    }

    // Execute the task via OllamaAdapter
    console.log("  Sending prompt to Ollama...");
    try {
      const response = await sendPrompt(adapter, task.prompt);

      totalSpend += response.costUsd;
      completedCount++;

      console.log(`  Response (${response.outputTokens} tokens):`);
      console.log();
      // Indent each line of the response for readability
      const indentedResponse = response.content
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      console.log(indentedResponse);
      console.log();
      console.log(`  Tokens: ${response.inputTokens} in / ${response.outputTokens} out`);
      console.log(`  Cost: $${response.costUsd.toFixed(6)}`);
      console.log(`  Running total: $${totalSpend.toFixed(6)}`);
      console.log();

      results.push({
        taskId: task.id,
        taskName: task.name,
        status: "completed",
        response: response.content,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: response.costUsd,
      });
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      console.log();
      results.push({
        taskId: task.id,
        taskName: task.name,
        status: "skipped",
        skipReason: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      });
      skippedCount++;
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log("===========================================");
  console.log("  RESEARCH AGENT SUMMARY");
  console.log("===========================================");
  console.log();
  console.log(`  Tasks completed: ${completedCount}`);
  console.log(`  Tasks skipped (denied): ${skippedCount}`);
  console.log(`  Total spend: $${totalSpend.toFixed(6)}`);
  console.log(`  Budget threshold: $${BUDGET_THRESHOLD.toFixed(6)}`);
  console.log();

  console.log("--- Task Details ---");
  for (const r of results) {
    const statusLabel = r.status === "completed" ? "DONE" : "SKIP";
    console.log(`  [${statusLabel}] ${r.taskId}: ${r.taskName}`);
    if (r.status === "skipped") {
      console.log(`         Reason: ${r.skipReason}`);
    } else {
      console.log(`         Tokens: ${r.inputTokens} in / ${r.outputTokens} out | Cost: $${r.costUsd.toFixed(6)}`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error("Research agent failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
