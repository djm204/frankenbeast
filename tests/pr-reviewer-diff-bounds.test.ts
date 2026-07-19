import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("automated PR reviewer diff bounds", () => {
  it("passes the bounded API and gh fallback regression suite", () => {
    expect(() =>
      execFileSync(
        "python3",
        ["-m", "unittest", "tests/test_pr_reviewer.py", "-v"],
        { cwd: repoRoot, encoding: "utf8" },
      ),
    ).not.toThrow();
  });
});
