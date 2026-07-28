# Authenticated public Smart Swarm live acceptance

Use this non-waivable gate after deploying a reviewed `main` commit through the public HTTPS dashboard path. It complements the isolated Hermes E2E: this gate uses the current live Hermes board, the production deployment, and a real browser.

## Safety contract

- Use only a credential-free HTTPS origin in `SMART_SWARM_PUBLIC_URL`.
- Supply Basic Auth through `SMART_SWARM_PUBLIC_BASIC_AUTH`; never put it in the URL, command arguments, logs, screenshots, source, or durable evidence.
- Point `HERMES_KANBAN_DB` at the genuine current Hermes board. Never seed, copy, or substitute fixture/demo/synthetic state.
- Target the acceptance worker itself with `SMART_SWARM_ACCEPTANCE_TASK_ID`. The test adds two sanitized comments to that genuine task to prove live delivery and cursor replay; it does not create production tasks.
- The governed action is a safe Hermes `policy.apply` probe against a verified nonexistent task. The governor must audit and reject it, and the test independently proves that the target remains absent while the real task status and run pointer do not change.

## Run

Build the exact reviewed commit first, then obtain the public origin and Basic Auth credential through the operator's authorized secret channel. Export secrets without shell tracing:

```bash
set +x
export SMART_SWARM_PUBLIC_URL="https://<assigned-subdomain>.ngrok-free.app"
export SMART_SWARM_PUBLIC_BASIC_AUTH='<username>:<password>'
export SMART_SWARM_ACCEPTANCE_TASK_ID='<current acceptance task id>'
export HERMES_KANBAN_DB="${HERMES_HOME:-$HOME/.hermes}/kanban.db"
npm run test:e2e:smart-swarm:public
unset SMART_SWARM_PUBLIC_BASIC_AUTH
```

The test rejects loopback URLs, URLs containing credentials, missing live-board inputs, and malformed Basic Auth values. It does not print the supplied credential.

## What the gate proves

- unauthenticated public health is rejected and authenticated public HTTPS succeeds;
- provider, current task, run pointer, status, and title match genuine Hermes source state;
- normalized public task titles contain no stale `design-interview` staging record;
- a genuine task comment updates topology/timeline and Brain Pulse without refresh;
- bounded source detail and its event id/task id/timestamp match the source database;
- a safe governed capability probe is audited and rejected while source state remains unchanged;
- an event emitted during a deliberate network interruption is replayed once by event id after reconnect;
- credentials and authorization markers are absent from normalized runtime data;
- browser console, page, and unexpected network failures remain empty;
- focus enters and exits bounded detail correctly with Escape;
- reduced-motion preference is active and mobile/tablet/desktop viewports have no horizontal overflow.

## Durable evidence

Record only sanitized results: reviewed/deployed SHA, service and endpoint status, source/public entity counts, source task id, event ids/timestamps, replay deduplication result, governed-action status, browser error counts, responsive/reduced-motion result, and the passing command. Never record credentials, authorization headers, raw database content, authenticated URLs, or unredacted task bodies.
