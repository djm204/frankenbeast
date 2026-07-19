import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const README = readFileSync(resolve(ROOT, "README.md"), "utf8");
const INTERACTIVE_SESSION = README.match(
  /### Interactive Session \(idea to PR\)([\s\S]*?)### Subcommands/,
)?.[1];

describe("issue #3378 design-doc CLI example", () => {
  it("uses the explicit plan-then-run flow for an existing design document", () => {
    expect(INTERACTIVE_SESSION).toContain(
      "frankenbeast plan --design-doc docs/my-feature-design.md\nfrankenbeast run",
    );
    expect(INTERACTIVE_SESSION).not.toMatch(/^frankenbeast\s+--design-doc\b/m);
  });
});
