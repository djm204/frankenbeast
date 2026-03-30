# Chunk Plan

Decomposes a design document into chunked implementation artifacts.

## Usage

```bash
frankenbeast plan --design-doc "<design-doc-path>" --output-dir "<output-dir>"
```

## Parameters

- **designDocPath** (required): Path to the design document to decompose
- **outputDir** (required): Directory where chunk plan files will be written

## Behavior

1. Reads the design document
2. Uses an LLM to decompose the design into implementation chunks
3. Validates chunk dependencies and structure
4. Writes numbered chunk files to the output directory

## Beast Definition Equivalent

This skill mirrors the `chunk-plan` beast definition in `src/beasts/definitions/chunk-plan-definition.ts`. The beast definition remains operational for process-based dispatch via `frankenbeast beasts spawn chunk-plan`.
