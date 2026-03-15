# @frankenbeast/web Ramp-Up

**Status**: **INTEGRATED (Frontend)** — This is the primary human-facing dashboard for the Frankenbeast framework. It connects to the `franken-orchestrator` via WebSockets and HTTP.

## Module Overview
A React-based single-page application (SPA) that provides a "Control Plane" for the agent. It allows users to chat with the agent, view live execution traces, manage tracked agents, and monitor system costs.

## Current Functionality
- **Beast Dashboard**: Launch and monitor autonomous agent runs.
- **Live Chat**: Real-time interaction via the orchestrator's `ChatServer`.
- **Tracked Agents**: Lifecycle management for long-running agent tasks (Design -> Planning -> Execution).
- **Trace Viewer**: Visual representation of the spans and tokens recorded by the `Observer` module.
- **Cost Analytics**: View real-time spend across projects and sessions.

## Integration Details
- **Backend**: Communicates with the `franken-orchestrator` HTTP server (default port 3737).
- **Authentication**: Uses a shared `FRANKENBEAST_BEAST_OPERATOR_TOKEN` defined in the root `.env`.
- **Protocol**: Uses standard REST for agent management and WebSockets for the live chat feed.

## Key Components (src/)
- `components/BeastControl`: UI for starting/stopping agent runs.
- `components/Chat`: The live interaction feed.
- `hooks/useBeastStream`: WebSocket hook for live updates.
- `services/api-client.ts`: Typed client for the orchestrator's REST API.

## Build & Test
```bash
npm run dev          # Start Vite dev server
npm run build        # Production build (tsc + vite)
npm test             # Vitest component tests
```

## Dependencies
- **React 19**: Modern UI framework.
- **Vite**: Fast build tool and dev server.
- **TailwindCSS**: For rapid, consistent styling.
