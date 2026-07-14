# Safe JSON parsing limits

Frankenbeast treats operator config files, run config files, GitHub issue payloads, and LLM-generated issue decomposition payloads as bounded JSON inputs. YAML is not accepted for these inputs; operators should convert YAML to JSON before passing it to the CLI.

The default config/run-config limits are intentionally conservative for local operator files:

- Maximum UTF-8 input size: 1 MiB
- Maximum nested object/array depth: 64
- Maximum object/array containers: 10,000
- Maximum object keys across the document: 20,000
- Maximum array items across the document: 50,000

Issue ingestion uses a 2 MiB input cap with bounds on depth, containers, object keys, and array fan-out. LLM issue-decomposition responses use a smaller 256 KiB cap and tighter structure limits because they should contain only chunk definitions.

When a document exceeds a limit, parsing fails before the value is trusted and the thrown error names the exceeded limit, for example `maxBytes`, `maxDepth`, `maxObjectKeys`, `maxArrayItems`, or `maxContainers`.

Trusted admin contexts can override limits by calling `parseSafeJson(text, { ...limits })` directly from code that intentionally accepts larger local input. Do not raise limits for repository-controlled config or external issue/LLM payloads without adding targeted tests for the new bound.
