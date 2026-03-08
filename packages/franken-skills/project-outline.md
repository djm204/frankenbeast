# Module 02: Skill Frontloading & Registry (The Toolbelt)

## 1. Overview
MOD-02 is the central repository for all capabilities. It leverages the `@djm204/agent-skills` package as the primary source of truth, providing an automated bridge between the CLI-based skills library and the AI system's runtime.

## 2. Integration: The `@djm204/agent-skills` Bridge

### 2.1 The Skill Discovery Parser
The Registry includes a **Discovery Service** that synchronizes with the local npm package:
- **Scanner:** Executes `npx @djm204/agent-skills --list` to fetch the inventory of available skills.
- **Parser:** Maps the CLI output and underlying JSON definitions into the **Unified Skill Contract** (see Section 3).
- **Fallback Logic:** If a required skill (e.g., `DeployToVercel`) is missing from the list, the system alerts the developer to create a new skill in the package.

### 2.2 Local vs. Global Skill Management
- **Global:** Core skills derived from `@djm204/agent-skills`.
- **Project-Specific:** Local extensions found in the `/skills` directory of the current project, which take precedence over global ones.



## 3. The Unified Skill Contract
Every skill, whether from the npm package or local, must satisfy this schema for the **Guardrails (MOD-01)** to allow execution:

```json
{
  "skill_id": "string",
  "metadata": {
    "name": "string",
    "description": "High-clarity purpose for LLM routing",
    "source": "@djm204/agent-skills | local"
  },
  "interface": {
    "input_schema": "JSON_Schema",
    "output_schema": "JSON_Schema"
  },
  "constraints": {
    "is_destructive": "boolean",
    "requires_hitl": "boolean",
    "sandbox_type": "DOCKER | WASM | LOCAL"
  }
}
4. Execution Workflow: "JIT Frontloading"
Sync: On startup, the Discovery Service parses available skills via @djm204/agent-skills --list.

Retrieve: When the Planner (MOD-04) identifies a need for a skill, the Registry retrieves the specific code/schema.

Validate: MOD-01 checks the proposed arguments against the input_schema.

Execute: The system invokes the skill handler (via the package's execution path or local script).

5. The "Skill-Gen" Scaffold
To handle cases where a needed skill is missing:

Prompt: The system notifies the user: Skill [X] not found in @djm204/agent-skills.

Scaffold: Provides a template to the developer to build the new skill, ensuring it follows the ADR-driven architecture of the rest of the system.