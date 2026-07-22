import { describe, expect, it } from "vitest";
import { findRemovedWorkspaceReferences } from "./helpers/removed-workspace-wiring.js";

const REMOVED_WORKSPACE_REFERENCES = [
  "@franken/firewall",
  "@franken/skills",
  "franken-heartbeat",
  "@franken/mcp",
  "franken-comms",
] as const;

describe("removed workspace wiring", () => {
  it("reports removed workspace references in active configuration", () => {
    const references = findRemovedWorkspaceReferences(
      [
        {
          path: "package.json",
          content: JSON.stringify({
            dependencies: { "@franken/mcp": "workspace:*" },
          }),
        },
        {
          path: "tsconfig.json",
          content: JSON.stringify({
            compilerOptions: {
              paths: {
                "franken-heartbeat": [
                  "./packages/franken-heartbeat/src/index.ts",
                ],
              },
            },
          }),
        },
      ],
      REMOVED_WORKSPACE_REFERENCES,
    );

    expect(references).toEqual([
      { path: "package.json", reference: "@franken/mcp" },
      { path: "tsconfig.json", reference: "franken-heartbeat" },
    ]);
  });

  it("does not confuse active workspace names with removed prefixes", () => {
    const references = findRemovedWorkspaceReferences(
      [
        {
          path: "vitest.config.ts",
          content:
            "alias: { '@franken/mcp-suite': 'packages/franken-mcp-suite/src/index.ts' }",
        },
      ],
      REMOVED_WORKSPACE_REFERENCES,
    );

    expect(references).toEqual([]);
  });
});
