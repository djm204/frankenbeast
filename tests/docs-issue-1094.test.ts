import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/iu;

const collectMarkdownFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return collectMarkdownFiles(entryPath);
    }

    return extname(entry.name) === ".md" ? [entryPath] : [];
  });

const docsLinkCheckFiles = (): string[] => {
  const rootDocs = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".md")
    .map((entry) => resolve(ROOT, entry.name));

  const docsTree = collectMarkdownFiles(resolve(ROOT, "docs"));

  const packageReadmes = readdirSync(resolve(ROOT, "packages"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(ROOT, "packages", entry.name, "README.md"))
    .filter((path) => existsSync(path));

  return [...rootDocs, ...docsTree, ...packageReadmes].sort();
};

const missingLocalLinks = (): string[] =>
  docsLinkCheckFiles().flatMap((filePath) => {
    const markdown = readFileSync(filePath, "utf8");
    const fileDir = dirname(filePath);
    const relativeFile = filePath.slice(ROOT.length + 1);
    const missing: string[] = [];

    for (const [lineIndex, line] of markdown.split("\n").entries()) {
      for (const match of line.matchAll(MARKDOWN_LINK_PATTERN)) {
        const rawTarget = match[1]?.replace(/^<|>$/gu, "") ?? "";
        const pathOnly = rawTarget.split("#", 1)[0];

        if (
          !pathOnly ||
          rawTarget.startsWith("#") ||
          SCHEME_PATTERN.test(rawTarget)
        ) {
          continue;
        }

        const decodedTarget = decodeURIComponent(pathOnly);
        const targetPath = resolve(fileDir, decodedTarget);
        if (!existsSync(targetPath)) {
          missing.push(`${relativeFile}:${lineIndex + 1} ${rawTarget}`);
        }
      }
    }

    return missing;
  });

describe("issue #1094 and #1447 local docs links", () => {
  it("keeps root docs, docs/**, and package READMEs free of broken local Markdown links", () => {
    expect(missingLocalLinks()).toEqual([]);
  });

  it("points renamed ADR and design references at existing retained documents", () => {
    expect(readDoc("CLAUDE.md")).toContain(
      "(docs/adr/011-real-monorepo-migration.md)",
    );
    expect(readDoc("docs/RAMP_UP.md")).toContain(
      "(adr/011-real-monorepo-migration.md)",
    );
    expect(readDoc("docs/ARCHITECTURE.md")).toContain(
      "(adr/011-real-monorepo-migration.md)",
    );
    expect(readDoc("docs/ARCHITECTURE.md")).toContain(
      "(adr/016-chat-server-entrypoint-for-dashboard.md)",
    );
    expect(readDoc("docs/adr/008-approach-c-full-pipeline.md")).toContain(
      "planning artifact has been retired",
    );
    expect(readDoc("docs/plans/consolidation/index.md")).toContain(
      "(residuals-master-plan.md)",
    );
    expect(readDoc("packages/franken-governor/README.md")).toContain(
      "(docs/adr/ADR-001-typescript-strict-nodenext.md)",
    );
    expect(readDoc("packages/franken-governor/README.md")).toContain(
      "(docs/adr/ADR-007-session-token-activation.md)",
    );
  });

  it("does not reintroduce the stale internal targets reported in issue #1447", () => {
    expect(readDoc("CLAUDE.md")).not.toContain(
      "(docs/adr/011-monorepo-migration.md)",
    );
    expect(readDoc("docs/RAMP_UP.md")).not.toContain(
      "(adr/011-monorepo-migration.md)",
    );
    expect(readDoc("docs/ARCHITECTURE.md")).not.toContain(
      "(adr/011-monorepo-migration.md)",
    );
    expect(readDoc("docs/ARCHITECTURE.md")).not.toContain(
      "(plans/2026-03-05-approach-c-full-pipeline-design.md)",
    );
    expect(readDoc("docs/ARCHITECTURE.md")).not.toContain(
      "(plans/2026-03-06-cli-e2e-design.md)",
    );
    expect(readDoc("docs/ARCHITECTURE.md")).not.toContain(
      "(adr/016-chat-server-entrypoint.md)",
    );
    expect(readDoc("docs/plans/consolidation/index.md")).not.toContain(
      "(../2026-03-18-architecture-consolidation-plan.md)",
    );
  });
});
