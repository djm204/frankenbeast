# Chunk 4.5.02: Provider-Aware Outbound Formatting

**Phase:** 4.5 — Comms Integration
**Depends on:** Chunk 01 (direct runtime integration), Phase 3 (provider registry)
**Estimated size:** Small–Medium

---

## Context

When the Beast Loop replies through a channel, users should see which LLM provider answered and what execution phase produced the response. This is especially valuable during provider failover — a Slack message showing "Switched from Claude → Codex (rate limit)" gives the user immediate visibility.

Currently, outbound messages carry `text` and `status` but no provider metadata. This chunk adds provider context to `CommsInboundResult` and teaches each channel adapter to format it appropriately.

## What to Do

### 1. Extend outbound types with provider metadata

```typescript
// Update CommsInboundResult in comms-runtime-port.ts

export interface CommsInboundResult {
  text: string;
  status?: OutboundMessageStatus;
  actions?: ChannelAction[];
  metadata?: Record<string, unknown>;
  provider?: {                      // NEW
    name: string;                   // e.g., 'claude-cli', 'anthropic-api'
    model?: string;                 // e.g., 'claude-sonnet-4-6'
    switchedFrom?: string;          // Set if failover occurred
    switchReason?: string;          // e.g., 'rate-limit', 'error'
  };
  phase?: string;                   // NEW — e.g., 'planning', 'execution', 'critique'
}
```

### 2. Populate provider metadata in ChatRuntimeCommsAdapter

The adapter reads provider info from the ChatRuntime result (which gets it from the ProviderRegistry execution context):

```typescript
// In ChatRuntimeCommsAdapter.processInbound()
return {
  text: display?.content ?? '',
  status: display?.kind as OutboundMessageStatus | undefined,
  provider: result.providerContext ? {
    name: result.providerContext.provider,
    model: result.providerContext.model,
    switchedFrom: result.providerContext.switchedFrom,
    switchReason: result.providerContext.switchReason,
  } : undefined,
  phase: result.phase,
};
```

### 3. Format per-channel adapter

Each adapter renders provider metadata in its platform's native format:

**Slack** — context block footer:
```typescript
// In SlackAdapter.send()
if (message.provider) {
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: message.provider.switchedFrom
        ? `⚡ _${message.provider.switchedFrom} → ${message.provider.name}_ (${message.provider.switchReason})`
        : `_${message.provider.name}_`,
    }],
  });
}
```

**Discord** — embed footer:
```typescript
// In DiscordAdapter.send()
if (message.provider) {
  embed.footer = {
    text: message.provider.switchedFrom
      ? `${message.provider.switchedFrom} → ${message.provider.name} (${message.provider.switchReason})`
      : message.provider.name,
  };
}
```

**Telegram** — italic footer line:
```typescript
// In TelegramAdapter.send()
if (message.provider) {
  const providerLine = message.provider.switchedFrom
    ? `_${escapeMarkdownV2(message.provider.switchedFrom)} → ${escapeMarkdownV2(message.provider.name)}_ \\(${escapeMarkdownV2(message.provider.switchReason ?? '')}\\)`
    : `_${escapeMarkdownV2(message.provider.name)}_`;
  text += `\n\n${providerLine}`;
}
```

**WhatsApp** — plain text footer:
```typescript
// In WhatsAppAdapter.send()
if (message.provider) {
  const providerLine = message.provider.switchedFrom
    ? `[${message.provider.switchedFrom} → ${message.provider.name} (${message.provider.switchReason})]`
    : `[${message.provider.name}]`;
  text += `\n\n${providerLine}`;
}
```

### 4. Make it optional

Provider metadata is informational. If not present (e.g., simple chat reply without beast loop involvement), adapters skip the footer. No breaking change to existing behavior.

## Files

- **Modify:** `src/comms/core/comms-runtime-port.ts` (add `provider` + `phase` to result type)
- **Modify:** `src/comms/core/chat-runtime-comms-adapter.ts` (populate from runtime result)
- **Modify:** `src/comms/channels/slack/slack-adapter.ts` (context block)
- **Modify:** `src/comms/channels/discord/discord-adapter.ts` (embed footer)
- **Modify:** `src/comms/channels/telegram/telegram-adapter.ts` (italic footer)
- **Modify:** `src/comms/channels/whatsapp/whatsapp-adapter.ts` (plain text footer)
- **Modify:** Adapter test files (verify formatting with and without provider metadata)

## Tests

### Per-adapter tests (4 files)
- Outbound message with `provider` present → footer rendered in correct platform format
- Outbound message with `provider.switchedFrom` → failover format shown
- Outbound message without `provider` → no footer (backwards compatible)
- Phase field rendered when present

### chat-runtime-comms-adapter.test.ts (extend)
- Provider context from runtime result maps to outbound `provider` field
- Missing provider context → `provider` is undefined

## Exit Criteria

- All four adapters render provider metadata when present
- Failover events show source → target provider + reason
- Missing metadata produces no visual change (backwards compatible)
- All adapter tests pass
- `npm run build && npm run typecheck && npm test` succeeds
