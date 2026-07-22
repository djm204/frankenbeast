import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const README = readFileSync(resolve(ROOT, "README.md"), "utf8");
const REFERENCES = README.match(
  /### References([\s\S]*?)## Configuration/,
)?.[1];

describe("issue #3482 ADR reference guidance", () => {
  it("identifies ADRs as historical rationale rather than current implementation guidance", () => {
    expect(REFERENCES).toContain("ADRs are historical decision records");
    expect(REFERENCES).toContain("not current implementation guidance");
    expect(REFERENCES).toContain(
      "package READMEs, architecture docs, and source",
    );
  });

  it("retains the secret-store and network-operator ADR links", () => {
    expect(REFERENCES).toContain(
      "[ADR-018](docs/adr/018-secret-store-architecture.md)",
    );
    expect(REFERENCES).toContain(
      "[ADR-017](docs/adr/017-network-operator-control-plane.md)",
    );
  });
});
