import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath: string) =>
  readFileSync(resolve(ROOT, relativePath), "utf8");
const readJson = <T>(relativePath: string): T =>
  JSON.parse(readText(relativePath)) as T;

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type PackageLock = {
  packages: Record<string, PackageManifest>;
};

const directDependency = (manifest: PackageManifest, name: string) =>
  manifest.dependencies?.[name] ??
  manifest.devDependencies?.[name] ??
  manifest.optionalDependencies?.[name];

describe("issue #3361 static banner cleanup", () => {
  it("does not declare sharp after removing the image-rendered banner", () => {
    const rootPackage = readJson<PackageManifest>("package.json");
    const orchestratorPackage = readJson<PackageManifest>(
      "packages/franken-orchestrator/package.json",
    );
    const packageLock = readJson<PackageLock>("package-lock.json");

    expect(directDependency(rootPackage, "sharp")).toBeUndefined();
    expect(directDependency(orchestratorPackage, "sharp")).toBeUndefined();
    expect(
      directDependency(packageLock.packages[""] ?? {}, "sharp"),
    ).toBeUndefined();
    expect(
      directDependency(
        packageLock.packages["packages/franken-orchestrator"] ?? {},
        "sharp",
      ),
    ).toBeUndefined();
  });

  it("does not document the removed plain-banner flag", () => {
    expect(readText("README.md")).not.toContain("FRANKENBEAST_PLAIN_BANNER");
    expect(readText(".env.example")).not.toContain("FRANKENBEAST_PLAIN_BANNER");
  });
});
