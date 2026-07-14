# Handling Missing Rate-Limit Header

## Overview
When the system makes an HTTP request to an external API that enforces rate limiting, it typically relies on the `Rate-Limit` (or similar) response header to determine how many requests remain and when the limit resets. However, some providers may omit this header, especially when the request is unauthenticated or when the limit has not been reached.

## What Happens
- The request succeeds, but the response does not include a rate‑limit header.
- The Hermes tooling logs a generic message such as:
  
  `"Rate limit header missing; falling back to default retry strategy."`
- Without the header, the normal back‑off logic cannot calculate an exact retry‑after time, so a default exponential back‑off is used.

## How to Interpret the Log
- **Presence of the log** indicates the provider did not supply rate‑limit metadata.
- **No immediate failure** – the request was still processed; the system will retry later if it receives a `429 Too Many Requests` response.
- **Default back‑off** starts at 1 second and doubles on each retry, up to a configurable maximum (default 60 seconds).

## Mitigation Steps
1. **Check Provider Documentation** – Verify whether the provider is expected to emit rate‑limit headers. Some APIs only provide them for authenticated requests.
2. **Enable Authentication** – If possible, supply an API token or client credentials so the provider includes rate‑limit information.
3. **Adjust Back‑off Settings** – In `frankenbeast.config.example.json` you can set `rateLimitFallbackBackoff` to control the maximum back‑off duration.
4. **Monitor Logs** – Look for repeated missing‑header warnings; if they are frequent, consider reducing request frequency or batch‑ing calls.
5. **Contact Provider** – If the missing header seems erroneous (e.g., you receive a `429` without a reset time), reach out to the API provider for clarification.

## Example Log Entry
```
[2026-07-13T10:45:12Z] WARN: Rate limit header missing for request to https://api.example.com/v1/data; using default back‑off.
```

## Further Reading
- See the **Rate‑Limit Fallback** section in `docs/guides/add-llm-provider.md` for configuration details.
- Review the **Provider fallback chain** discussion in `docs/adr/010-pluggable-cli-providers.md`.
