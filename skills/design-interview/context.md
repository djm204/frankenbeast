# Design Interview

Drives an interactive design interview and writes a design document artifact.

## Usage

```bash
frankenbeast interview --goal "<goal>" --output "<output-path>"
```

## Parameters

- **goal** (required): What the design interview should produce
- **output** (required): Path where the design document will be written

## Behavior

1. Starts an interactive interview loop with an LLM
2. Gathers requirements through conversational prompts
3. Generates a design document summarizing the requirements
4. Writes the document to the specified output path

## Beast Definition Equivalent

This skill mirrors the `design-interview` beast definition in `src/beasts/definitions/design-interview-definition.ts`. The beast definition remains operational for process-based dispatch via `frankenbeast beasts spawn design-interview`.
