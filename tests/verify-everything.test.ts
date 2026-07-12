import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getWorkspacePackageDirNames } from "./helpers/workspaces.js";

const ROOT = resolve(import.meta.dirname, "..");
const exec = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: ROOT, encoding: "utf8" }).trim();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const ALL_PACKAGES = getWorkspacePackageDirNames();

describe("Chunk 10: full verification pass", () => {
  describe("verification command portability", () => {
    it("does not rely on shell pipeline parsing in the default suite", () => {
      const source = readFileSync(import.meta.filename, "utf8");
      const pipe = String.fromCharCode(124);
      const countFlag = ["--", "count"].join("");

      expect(source).not.toContain(`${pipe} wc -l`);
      expect(source).not.toContain(`${pipe} head`);
      expect(source).not.toContain(["git", "log"].join(" "));
      expect(source).not.toContain(["git", "rev-list"].join(" "));
      expect(source).not.toContain(countFlag);
      expect(source).not.toMatch(
        /to(?:Be|Equal|BeGreaterThanOrEqual)\((?:3|108|1572)\)/,
      );
      expect(source).toMatch(
        /process\.platform\s*===\s*['"]win32['"]\s*\?\s*['"]npm\.cmd['"]\s*:\s*['"]npm['"]/,
      );
    });
  });

  describe("workspace resolution", () => {
    it("npm ls @franken/types resolves without errors", () => {
      const result = spawnSync(npmCommand, ["ls", "@franken/types"], {
        cwd: ROOT,
        encoding: "utf8",
      });
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).not.toContain("ERR!");
      expect(output).not.toContain("WARN");
      expect(output).toContain("@franken/types");
    });
  });

  describe("no gitlinks in index", () => {
    it("git ls-tree HEAD contains no mode-160000 entries", () => {
      const output = exec("git", ["ls-tree", "HEAD"]);
      const gitlinks = output
        .split("\n")
        .filter((line: string) => line.includes("160000"));
      expect(gitlinks).toHaveLength(0);
    });
  });

  describe("no root-level module directories", () => {
    for (const dir of ALL_PACKAGES) {
      it(`${dir}/ should not exist at root level`, () => {
        expect(existsSync(resolve(ROOT, dir))).toBe(false);
      });
    }
  });

  describe("no .git dirs inside packages", () => {
    for (const dir of ALL_PACKAGES) {
      it(`packages/${dir}/.git should not exist`, () => {
        expect(existsSync(resolve(ROOT, "packages", dir, ".git"))).toBe(false);
      });
    }
  });
});
