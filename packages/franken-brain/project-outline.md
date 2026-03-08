# Module 03: Memory Systems (State & Context Management)

## 1. Overview
MOD-03 provides the "tiered" memory architecture for the Frankenbeast. It ensures that the agent can recall past successes/failures, adhere to architectural standards, and maintain context without hitting token limits.

## 2. The Tiered Memory Architecture

### 2.1 Working Memory (The Context Window)
- **Role:** The immediate, high-fidelity data currently in the prompt.
- **Optimization:** Implements **Context Pruning**. As the conversation grows, MOD-03 summarizes older turns while keeping the most recent "Plan" and "Tool Outputs" in full.
- **Agnostic Handling:** Since different models have different window sizes (Claude vs. GPT), this tier dynamically calculates token density to avoid "Lost in the Middle" syndrome.

### 2.2 Episodic Memory (The Execution Trace)
- **Role:** A history of specific actions taken and their results.
- **Logic:** If a skill from `@djm204/agent-skills` fails (e.g., a build error), the result is stored here. 
- **Recall:** Before starting a new task, the Planner queries Episodic Memory: *"Have I tried to fix this bug before? What was the outcome?"*

### 2.3 Semantic Memory (The Knowledge Base)
- **Role:** RAG-based storage for "Static" but vital project data.
- **Contents:**
    - Your **ADR-driven architecture** rules.
    - TypeScript coding standards.
    - Project-specific documentation (e.g., GlobalVision's Release Track logic).
- **Implementation:** Vector store (e.g., Pinecone, Milvus, or a local ChromaDB) indexed by semantic similarity.



## 3. Memory Operations

### 3.1 Compression & Summarization
- To prevent "Token Burn," the module periodically runs a background task to compress long Episodic traces into "Lessons Learned" (e.g., *"Attempting to use Library X for Currency failed because of Y"*).

### 3.2 Metadata Tagging
Every memory entry is tagged with:
- `project_id`: (e.g., `Bold-Commerce-MultiCurrency`)
- `status`: `Success` | `Failure`
- `timestamp`: To prioritize recent information.

## 4. Interaction with Other Modules
- **MOD-01 (Guardrails):** Memory is scanned for PII before being persisted to the long-term vector store.
- **MOD-04 (Planner):** The Planner pulls from Semantic Memory during the "Frontloading" phase to set the project's architectural constraints.

## 5. Persistence Layer
Memory must survive system restarts.
- **Short-term:** Redis or local SQLite for high-speed Working/Episodic access.
- **Long-term:** Vector database for Semantic "Wisdom."