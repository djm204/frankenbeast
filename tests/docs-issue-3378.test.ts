import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const README = readFileSync(resolve(ROOT, "README.md"), "utf8");

describe("issue #3378 design-doc CLI example", () => {
  it("routes design documents through the plan subcommand", () => {
    expect(README).toContain(
      "frankenbeast plan --design-doc docs/my-feature-design.md",
    );
    expect(README).not.toMatch(/^frankenbeast\s+--design-doc\b/m);
  });
});
