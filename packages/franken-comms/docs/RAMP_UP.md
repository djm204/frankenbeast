# franken-comms Ramp-Up

**Status**: **GHOST (External Channels)** — This module provides adapters for connecting the Beast Loop to external chat platforms. It is currently separate from the orchestrator's internal WebSocket chat server.

## Module Overview
`franken-comms` acts as a gateway between the Frankenbeast framework and third-party messaging services like Slack, Discord, and Telegram. It handles incoming webhook validation and outgoing message formatting.

## Current Functionality
- **Multi-Channel Adapters**:
    - `SlackAdapter`: Validates Slack signatures and maps events.
    - `DiscordAdapter`: Integrates with Discord bot API.
    - `TelegramAdapter`: Bot API support.
    - `WhatsAppAdapter`: Early-stage support for business API.
- **Chat Socket Bridge**: Provides a way to bridge these external events into an internal message bus.
- **Security**: Robust signature verification for each platform.

## Integration Status
This package is currently a standalone capability. **Next Steps**: Standardize the orchestrator's communication ports so that any of these adapters can be swapped in for the default CLI or Web interaction.

## Key API
- `ChatGateway`: The unified entry point for sending/receiving across channels.
- `SlackSignature`: Utility for verifying inbound requests.
- `ChatSocketBridge`: Logic for multiplexing sessions.

## Build & Test
```bash
npm run build       # tsc
npm test            # vitest run (unit)
```

## Dependencies
- `@franken/types`: For shared message and session shapes.
- No production dependencies (built on standard fetch/web crypto).
