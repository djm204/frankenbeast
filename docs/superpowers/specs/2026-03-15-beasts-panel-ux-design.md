# Beasts Panel UX Redesign — Design Spec

**Date:** 2026-03-15
**Status:** Draft
**Scope:** `packages/franken-web` — Beasts panel rewrite with Radix UI + Tailwind CSS v4 + Zustand

---

## 1. Overview

Redesign the beasts panel from a 3-column dispatch page into a modern agent management surface. The new design centers on an agent list as the primary view, a slide-in detail panel for inspection and editing, and a multi-step wizard for agent creation with full configuration depth.

### Goals

- Replace the current `beast-dispatch-page.tsx` 3-column layout with a list-first design
- Introduce a guided agent creation wizard (toggleable to single-page form)
- Expose deep per-module configuration, per-action LLM targeting, skill selection, prompt frontloading, and git workflow presets
- Adopt Radix UI primitives for accessible, keyboard-navigable controls
- Introduce Tailwind CSS v4 for utility-first styling on all new components
- Add Zustand for wizard form state and dirty tracking
- Gracefully degrade where backend plumbing doesn't exist yet

### Non-Goals

- Migrating existing dashboard CSS to Tailwind (fast-follow doc covers this)
- Building backend endpoints for gaps (remediation doc covers this)
- Redesigning other dashboard tabs (chat, network, sessions, etc.)

---

## 2. Main Beasts Screen — Agent List

### Layout

Full-width list view replaces the current 3-column layout.

**Top bar:**
- **"Create Agent" button** — primary action, top-right, opens the creation wizard
- **Density toggle** — compact / comfortable / detailed, icon-based toggle group (Radix `ToggleGroup`)
- **Search/filter bar** — filter by status, workflow type, agent name

### Agent Row Density

| Density | Content | Lines |
|---------|---------|-------|
| **Compact** | Name, workflow type icon, status badge, timestamp | 1 |
| **Comfortable** | Above + LLM target chip, module count chip, git strategy chip | 2 |
| **Detailed** | Above + last log line, linked run ID, creator | 3 |

### Status Badges

Each status badge includes a **status light** — a small circle (8px) with a CSS `box-shadow` glow matching the badge color. Active states (running, initializing, dispatching) glow with a soft radial pulse animation. Inactive states (stopped, completed) show a solid dim circle with no glow. Failed shows a static red glow (no pulse — urgency without distraction).

| Status | Color Token | Light Behavior |
|--------|------------|----------------|
| `running` | `--accent` (#86e45f) | Glowing, steady pulse |
| `initializing`, `dispatching` | `--accent-strong` (#b7ff81) | Glowing, faster pulse |
| `completed` | `--text-muted` (#c0d0bc) | Solid dim, no glow |
| `stopped` | `--text-subtle` (#9fb09b) | Grey, no glow (off) |
| `failed` | `--danger` (#ff7a6b) | Static red glow, no pulse |

### Interaction

- **Click row** → opens detail slide-in panel from the right. Selected row receives `--accent-soft` highlight.
- **Empty state** — centered CTA: "No agents yet — Create your first agent" with create button.

---

## 3. Detail Slide-In Panel

### Shell

Bespoke positioned `<aside>` element (not a Radix Dialog — Dialog is designed for centered modal overlays and its focus/positioning assumptions conflict with a persistent side panel). Right-anchored via `position: fixed; right: 0; top: 0; height: 100vh; width: 45vw`. Slides in/out with a 200ms CSS `transform: translateX()` transition. Controlled by React state (`isOpen` boolean). Clicking outside or pressing Escape closes it (custom event handlers — no Radix focus trap since the panel is non-modal and the agent list behind it remains interactive).

### Header

- Agent name + status badge (left)
- Mode toggle: Readonly (default) / Edit — Radix `ToggleGroup` pill toggle (right)
- Close button (X)

### Readonly Mode

Structured sections via Radix `Accordion` (collapsible, multiple sections open simultaneously):

1. **Overview** — workflow type, created timestamp, creator, linked run ID
2. **LLM Configuration** — provider → model per action, or "using process defaults"
3. **Modules** — enabled modules with config summaries
4. **Skills** — loaded skills as chips
5. **Prompt Frontloading** — file list + text preview (truncated)
6. **Git Workflow** — preset name + overridden settings highlighted
7. **Events & Logs** — scrollable log tail with auto-scroll. **Expand button** (top-right of section) opens a Radix `Dialog` (modal=true) at ~90% viewport. Fullscreen toggle in the expanded dialog header uses the Fullscreen API. Search/filter within expanded view.

### Edit Mode

Same accordion sections become editable with inline form controls (selects, toggles, textareas).

**Save button** — in the header, disabled until form is dirty. Dirty state computed by diffing current values against last-saved snapshot (Zustand `agentEditSlice`).

**Cancel** — reverts to readonly mode. If dirty, shows Radix `AlertDialog` confirmation before discarding.

**Restart-required fields** — small warning icon + Radix `Tooltip`: "Takes effect at next turn boundary."

### Action Buttons

Bottom of panel, always visible, context-dependent on agent status:

| Status | Available Actions |
|--------|-------------------|
| `initializing`, `dispatching` | Stop |
| `running` | Stop, Restart (with "Force restart" toggle), Kill |
| `stopped` (no linked run) | Start, Delete |
| `stopped` (with linked run) | Start, Resume, Delete |
| `failed`, `completed` | Start, Delete |

**Force restart toggle** — appears next to Restart when agent is running. Default off (graceful restart at turn boundary). When on, interrupts immediately. Activating Force Restart triggers a Radix `AlertDialog` confirmation: "Force restart will interrupt the agent mid-turn. Continue?"

**Polling:** Single batched poll via `GET /v1/beasts/agents` every 4 seconds returns all agent statuses in one request (no per-agent polling). The detail panel's `GET /v1/beasts/agents/:id` call shares the same polling interval and is deduplicated — if the list poll already returned the selected agent's data, the detail call is skipped for that cycle. Action buttons reflect the last-polled status — no optimistic updates. After any user-initiated action (stop, start, restart, etc.), an immediate re-fetch of the agent list is triggered to minimize stale button state.

### Hot-Swap vs Restart-Required

| Field | Behavior |
|-------|----------|
| Agent name, description | Hot-swap (metadata only, no runtime impact) |
| LLM provider/model (default) | Hot-swap |
| Per-action LLM overrides | Hot-swap |
| Skill additions/removals | Hot-swap |
| Prompt frontloading text | Hot-swap |
| Workflow type | Restart-required (fundamentally changes agent behavior) |
| Module toggle on/off | Restart-required |
| Module deep configuration | Restart-required |
| Git workflow preset/overrides | Restart-required |

---

## 4. Agent Creation Wizard

### Shell

Radix `Dialog` (modal=true), centered, ~70% viewport width. Footer: Back / Next / Launch buttons. Top-right toggle switches between wizard and single-page form view.

**Step indicator** — custom component (not Radix Tabs — Tabs allows free navigation to any tab, which conflicts with validation-gated progression). Horizontal bar with step labels showing current/completed/upcoming visual states. Navigation is forward-only: users must complete validation on the current step before advancing. Completed steps are clickable (allowing backward navigation to review), but uncompleted future steps are not. The step indicator is purely visual + navigational — it does not manage content rendering (that's the wizard shell's responsibility).

### Step 1 — Identity

- **Agent name** — text input, required
- **Description** — textarea, optional

### Step 2 — Workflow Type

Card-based selection (radio behavior, one selected at a time):

| Workflow | Description |
|----------|-------------|
| **Design Interview** | Launch interactive design session |
| **Chunk Design Doc** | Break a design doc into implementation chunks |
| **Issues Agent** | Work through issues/tickets |
| **Run Chunked Project** | Execute an already-chunked plan |

Each card: icon, title, one-line description. Selected card gets accent border (`--accent`).

**Workflow-specific fields** appear below the cards after selection:
- **Design Interview** — topic/context textarea
- **Chunk Design Doc** — file picker (design doc path)
- **Issues Agent** — issue source config (repo URL, label filters)
- **Run Chunked Project** — directory picker (chunk directory path)

### Step 3 — LLM Targets

**Default provider/model:**
- Two cascading Radix `Select` controls: provider first → model populates from that provider's available models
- Falls back to process-level config if left unset
- Provider list populated from `GET /v1/providers` (when available)

**Per-action overrides** — expandable section. Each LLM-consuming action gets an optional provider → model pair:
- Planning
- Execution
- Critique
- Reflection
- Chat
- (Extensible — new actions get a slot automatically)

Each action has a "Use default" checkbox. Unchecking reveals the provider → model selects.

**Gap banner:** If backend doesn't support per-action routing, section renders with: "Per-action routing not yet wired — all actions will use the default model."

### Step 4 — Modules & Configuration

**Toggle grid** — 7 module cards in a responsive grid layout. Each card: module name, one-line purpose, on/off Radix `Toggle`.

Toggling a module ON expands its **deep config section** below the grid (Radix `Accordion`):

| Module | Configuration Fields |
|--------|---------------------|
| **Firewall** | Rule set selection, custom rules textarea |
| **Skills** | (Handled in Step 5) |
| **Memory** | Backend selection (in-memory / SQLite / external), retention policy |
| **Planner** | Max DAG depth, parallel task limit |
| **Critique** | Max iterations, severity threshold |
| **Governor** | Approval mode (auto / manual / threshold-based), escalation rules |
| **Heartbeat** | Reflection interval, LLM target override |

**Gap flags** rendered inline where backend config endpoints don't exist yet.

### Step 5 — Skills

**Browsable registry** with search bar (Radix `Popover` + command-style input):
- Skills displayed as cards: name, description, category tags
- Click to add → appears in "Selected Skills" chip area
- Chips are removable (click X)
- Filter by category, search by name/description
- Skill list populated from `GET /v1/skills` (when available)

### Step 6 — Prompt Frontloading

**Text section:**
- Textarea with monospace font, syntax-friendly for markdown/code

**Files section:**
- File picker supporting multiple file selection
- OS/environment-aware path handling:
  - Server reports its OS context via `GET /v1/system/environment` (returns `{ os, platform, isWsl, pathSeparator }`)
  - Client caches this on load and uses it to validate/normalize paths
  - WSL paths normalized (`/mnt/c/...` translation when applicable)
  - Displays resolved path with environment indicator (Windows / WSL / Linux / macOS)
  - Manual path entry is always available as primary fallback — detection is best-effort
- Each loaded file shows:
  - Filename, estimated token count, collapsible preview
  - **Context health indicator:**
    - Green — good (under threshold)
    - Yellow — large but manageable
    - Red — too large / context-unfriendly
  - **Red-flagged file remediation:**
    - "Optimize" button — calls configured LLM to condense the file for context
    - Fallback guidance: "This file is ~X tokens. Ask your AI provider: *'Condense this file to under Y tokens while preserving key information for an AI agent working on [describe task]'*"

### Step 7 — Git Workflow

**Preset cards** (radio selection):

| Preset | Behavior |
|--------|----------|
| **One-shot** | Direct commit to target branch, no PR |
| **Feature Branch** | Create branch, commit, open PR |
| **Feature Branch + Worktree** | Isolated git worktree, branch, PR |
| **YOLO on Main** | Commit directly to main, no branch |
| **Custom** | All fields blank, must configure manually |

**Override section** (Radix `Accordion`, below preset):

| Setting | Type | Default Source |
|---------|------|----------------|
| Base branch | Text input | Preset |
| Branch naming pattern | Template input (e.g., `feat/{agent-name}/{id}`) | Preset |
| PR creation | Toggle + template select | Preset |
| Commit message convention | Select (conventional commits / freeform) | Preset |
| Merge strategy | Select (merge / squash / rebase) | Preset |

Preset selection pre-fills all override fields. User can override any field individually.

### Step 8 — Review & Launch

- Summary of all selections organized by section
- Each section has an "Edit" link that jumps back to that wizard step
- **Launch button** — validates all required fields, creates agent via `POST /v1/beasts/agents`

### Single-Page Form Mode

Same 8 sections rendered as a vertical scroll. Each section is a Radix `Accordion` item (outer Accordion). No stepper, no back/next navigation. Single "Launch" button at the bottom. Toggle in the top-right switches back to wizard mode (preserving form state).

**Nested Accordion handling:** Steps 4 (Modules) and 7 (Git Workflow) contain inner Accordions for module deep config and git overrides respectively. To prevent keyboard navigation conflicts between outer and inner Accordion levels:
- Outer Accordion sections use `type="multiple"` (no arrow-key cycling between sections)
- Inner Accordions are self-contained — arrow keys within an inner Accordion do not bubble to the outer level
- Focus is scoped: tabbing out of an inner Accordion returns focus to the outer section's next focusable element, not the next outer Accordion trigger

---

## 5. Tech Stack

### Radix UI Packages

| Package | Used For |
|---------|----------|
| `@radix-ui/react-dialog` | Wizard modal, log fullscreen modal |
| `@radix-ui/react-accordion` | Detail panel sections, module deep config, git overrides, single-page form sections |
| `@radix-ui/react-select` | Provider/model cascading selects, preset selects |
| `@radix-ui/react-toggle` | Module on/off toggles |
| `@radix-ui/react-toggle-group` | Density selector, readonly/edit mode toggle |
| `@radix-ui/react-tooltip` | Restart-required warnings, context health hints |
| `@radix-ui/react-alert-dialog` | Discard unsaved changes, force restart confirmation |
| `@radix-ui/react-popover` | Skill search/filter dropdown |
| `@radix-ui/react-scroll-area` | Log tail, skill registry list, agent list |
| `@radix-ui/react-separator` | Visual dividers between sections |

**Not using Radix for:**
- **Slide-in detail panel** — bespoke `<aside>` with CSS transitions (see Section 3; Dialog's modal semantics are wrong for a non-modal side panel)
- **Wizard step indicator** — custom component (see Section 4; Tabs allows free navigation, incompatible with validation-gated progression)

### Tailwind CSS v4

- Native Vite plugin (`@tailwindcss/vite`) — no PostCSS config required
- Theme config maps existing CSS custom properties to Tailwind tokens:
  - `--bg` → `bg-beast-bg`
  - `--accent` → `text-beast-accent`, `border-beast-accent`, etc.
  - `--danger` → `text-beast-danger`
  - (full mapping in implementation)
- All new beasts panel components use Tailwind utility classes exclusively
- Existing `app.css` (955 lines) remains untouched — coexistence during transition

### Zustand

Single store with two slices:

- **`wizardSlice`** — current step index, form values per step, validation errors, wizard vs form mode toggle
- **`agentEditSlice`** — last-saved config snapshot, current edit values, computed `isDirty` flag

Rest of dashboard continues using React hooks. No migration required.

### CSS Convention (New Components)

- Tailwind utilities for layout, spacing, color, typography
- Radix `data-state` attributes for interactive styling (open/closed, active/inactive)
- No new BEM-style classes for the beasts panel rewrite
- Existing `.beast-*` classes in `app.css` will be superseded (not deleted until migration)

---

## 6. API Dependencies

### Existing Endpoints (Used As-Is)

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/beasts/catalog` | Populate workflow types and interview prompts |
| `POST /v1/beasts/agents` | Create agent |
| `GET /v1/beasts/agents` | List agents (polling) |
| `GET /v1/beasts/agents/:id` | Agent detail |
| `POST /v1/beasts/agents/:id/{start,stop,restart}` | Lifecycle controls |
| `DELETE /v1/beasts/agents/:id` | Delete agent |
| `POST /v1/beasts/agents/:id/resume` | Resume agent |
| `GET /v1/beasts/runs/:id` | Linked run detail |
| `GET /v1/beasts/runs/:id/logs` | Run logs |

### New Endpoints Required

See `docs/plans/2026-03-15-beasts-panel-backend-gaps.md` for full details.

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `GET /v1/providers` | List available LLM providers | P1 |
| `GET /v1/providers/:id/models` | List models for a provider | P1 |
| `GET /v1/skills` | List/search available skills | P1 |
| `PATCH /v1/beasts/agents/:id/config` | Partial config update (hot-swap) | P1 |
| `GET /v1/system/environment` | Server OS context for path validation | P2 |
| `POST /v1/tools/analyze-context` | Token count + context health analysis | P2 |
| `POST /v1/tools/optimize-context` | LLM-powered file condensation | P3 |

Priority key: P0=blocking, P1=degraded UX without it, P2=client-side workaround exists, P3=manual workaround acceptable. See `docs/plans/2026-03-15-beasts-panel-backend-gaps.md` for full details and implementation order.

---

## 7. Accessibility

All interactive controls via Radix primitives provide:
- Full keyboard navigation (Tab, Arrow keys, Enter, Escape)
- ARIA attributes (roles, labels, states, live regions)
- Focus management (trap in modals, restore on close)
- Screen reader announcements for state changes

Additional:
- Status badges include `aria-label` with full status text
- Density toggle announces current density level
- Wizard step indicator announces current step and total
- Log expansion announces modal open/close
- Force restart toggle includes `aria-description` warning
