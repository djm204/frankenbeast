# Chunk 1.1: Absorb franken-comms into Orchestrator

**Phase:** 1 — Remove Dead Packages
**Depends on:** Phase 0 (clean main)
**Estimated size:** Medium (move + re-import, not rewrite)

---

## Context

`franken-comms` provides bidirectional Slack/Discord/Telegram/WhatsApp integration — beast status updates OUT, user commands IN (including HITL approval via Slack buttons). This is real operational functionality that users depend on.

Unlike the other 4 deleted packages (firewall, skills, heartbeat, mcp) which are being replaced by new components, franken-comms is **absorbed into the orchestrator** as-is. The code moves, imports update, the package directory goes away — but the functionality survives.

## What Gets Absorbed

| Component | Source | Destination |
|-----------|--------|-------------|
| `ChatGateway` | `franken-comms/src/gateway/` | `franken-orchestrator/src/comms/gateway/` |
| `ChatSocketBridge` | `franken-comms/src/core/` | `franken-orchestrator/src/comms/core/` |
| `SessionMapper` | `franken-comms/src/core/` | `franken-orchestrator/src/comms/core/` |
| Channel types | `franken-comms/src/core/types.ts` | `franken-orchestrator/src/comms/types.ts` |
| `SlackAdapter` + router | `franken-comms/src/channels/slack/` | `franken-orchestrator/src/comms/channels/slack/` |
| `DiscordAdapter` + router | `franken-comms/src/channels/discord/` | `franken-orchestrator/src/comms/channels/discord/` |
| `TelegramAdapter` + router | `franken-comms/src/channels/telegram/` | `franken-orchestrator/src/comms/channels/telegram/` |
| `WhatsAppAdapter` + router | `franken-comms/src/channels/whatsapp/` | `franken-orchestrator/src/comms/channels/whatsapp/` |
| Signature verification | `franken-comms/src/security/` | `franken-orchestrator/src/comms/security/` |
| Comms config | `franken-comms/src/config/` | `franken-orchestrator/src/comms/config/` |
| Hono app + server | `franken-comms/src/server/` | Routes merge into orchestrator's existing Hono server |
| 14 test files | `franken-comms/tests/` | `franken-orchestrator/tests/unit/comms/` |

## What to Do

### 1. Move source files

```bash
# Create destination directory
mkdir -p packages/franken-orchestrator/src/comms/{gateway,core,channels/slack,channels/discord,channels/telegram,channels/whatsapp,security,config}

# Copy source files (preserving directory structure)
cp -r packages/franken-comms/src/gateway/* packages/franken-orchestrator/src/comms/gateway/
cp packages/franken-comms/src/core/types.ts packages/franken-orchestrator/src/comms/types.ts
cp packages/franken-comms/src/core/session-mapper.ts packages/franken-orchestrator/src/comms/core/
cp packages/franken-comms/src/core/chat-socket-bridge.ts packages/franken-orchestrator/src/comms/core/
cp -r packages/franken-comms/src/channels/* packages/franken-orchestrator/src/comms/channels/
cp -r packages/franken-comms/src/security/* packages/franken-orchestrator/src/comms/security/
cp -r packages/franken-comms/src/config/* packages/franken-orchestrator/src/comms/config/
```

### 2. Fix imports

All internal imports in the moved files change from relative paths within franken-comms to relative paths within franken-orchestrator:

```typescript
// Before (in slack-adapter.ts):
import type { ChannelAdapter } from '../../core/types.js';

// After:
import type { ChannelAdapter } from '../../types.js';
```

The `@franken/types` import stays — franken-types is retained.

### 3. Merge Hono routes into orchestrator's server

The franken-comms `server/app.ts` creates its own Hono app with channel webhook routes. Instead, merge these routes into the orchestrator's existing `chat-server.ts` or `chat-app.ts`:

```typescript
// packages/franken-orchestrator/src/http/routes/comms-routes.ts
//
// Register the channel webhook routes on the orchestrator's Hono app
import { slackRouter } from '../../comms/channels/slack/slack-router.js';
import { discordRouter } from '../../comms/channels/discord/discord-router.js';
// ... etc

export function registerCommsRoutes(app: Hono, gateway: ChatGateway, config: CommsConfig): void {
  if (config.slack?.enabled) {
    app.route('/webhooks/slack', slackRouter(gateway, config.slack));
  }
  if (config.discord?.enabled) {
    app.route('/webhooks/discord', discordRouter(gateway, config.discord));
  }
  // ... telegram, whatsapp
}
```

### 4. Wire ChatGateway to existing orchestrator WebSocket

The `ChatGateway` connects to the orchestrator via WebSocket (`ChatSocketBridge`). Since the gateway now lives *inside* the orchestrator, the WebSocket connection can become an internal event bus call instead. However, for this chunk, we keep the WebSocket approach — it works and avoids a rewrite. The gateway connects to `ws://localhost:PORT` on the same server.

### 5. Update existing orchestrator references

The orchestrator already has comms integration code:
- `src/network/services/comms-gateway-service.ts` — update imports to point to `../comms/` instead of `@frankenbeast/comms`
- `src/init/comms-transport-registry.ts` — update imports
- `src/init/init-verify.ts` — update imports
- `src/init/init-wizard.ts` — update imports
- `src/config/orchestrator-config.ts` — `comms.*` config stays as-is

### 6. Move tests

```bash
mkdir -p packages/franken-orchestrator/tests/unit/comms/security
cp packages/franken-comms/tests/unit/*.test.ts packages/franken-orchestrator/tests/unit/comms/
cp packages/franken-comms/tests/unit/security/*.test.ts packages/franken-orchestrator/tests/unit/comms/security/
```

Fix test imports to point to the new source locations.

### 7. Delete the package

```bash
rm -rf packages/franken-comms/
```

### 8. Remove workspace references

- **`package.json` (root):** Remove `packages/franken-comms` from workspaces
- **`turbo.json`:** Remove any franken-comms pipeline entries
- **`tsconfig.json` (root):** Remove from references

### 9. Add `ws` dependency to orchestrator

franken-comms depends on `ws` for the WebSocket bridge. Add it to the orchestrator's `package.json`:

```bash
cd packages/franken-orchestrator && npm install ws && npm install -D @types/ws
```

### 10. Run verification

```bash
npm install  # regenerate lockfile
npm run build
npm run typecheck
npm test
```

## Known References

Check these locations for `@frankenbeast/comms` or `franken-comms` imports:
- `packages/franken-orchestrator/package.json` — remove `@frankenbeast/comms` dependency
- `packages/franken-orchestrator/src/network/services/comms-gateway-service.ts` — update imports
- `packages/franken-orchestrator/src/init/comms-transport-registry.ts` — update imports
- `packages/franken-orchestrator/src/init/init-verify.ts` — update imports
- `packages/franken-orchestrator/src/init/init-wizard.ts` — update imports
- `packages/franken-orchestrator/src/init/init-types.ts` — `InitModuleId` includes 'comms'
- `packages/franken-orchestrator/src/config/orchestrator-config.ts` — `comms.*` config stays

## Files

- **Move:** `packages/franken-comms/src/` → `packages/franken-orchestrator/src/comms/`
- **Move:** `packages/franken-comms/tests/` → `packages/franken-orchestrator/tests/unit/comms/`
- **Add:** `packages/franken-orchestrator/src/http/routes/comms-routes.ts` (merge webhook routes)
- **Modify:** `packages/franken-orchestrator/src/network/services/comms-gateway-service.ts` (update imports)
- **Modify:** `packages/franken-orchestrator/src/init/` files (update imports)
- **Modify:** `packages/franken-orchestrator/package.json` (add `ws` dep, remove `@frankenbeast/comms`)
- **Delete:** `packages/franken-comms/` (entire directory)
- **Modify:** Root `package.json`, `turbo.json`, `tsconfig.json`

## Exit Criteria

- `packages/franken-comms/` does not exist
- All comms source code lives in `packages/franken-orchestrator/src/comms/`
- All 14 comms tests live in `packages/franken-orchestrator/tests/unit/comms/` and pass
- `grep -r "@frankenbeast/comms" packages/` returns zero results
- `grep -r "franken-comms" .` returns zero results (excluding git history and this doc)
- Slack/Discord/Telegram/WhatsApp webhook routes registered on orchestrator's Hono server
- `ChatGateway` functional — inbound messages reach orchestrator, outbound status relayed to channels
- HITL approval via Slack buttons still works (approve/reject actions)
- `npm install && npm run build && npm run typecheck && npm test` succeeds
