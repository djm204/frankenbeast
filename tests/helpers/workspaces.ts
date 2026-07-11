import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");

export type PackageJson = {
  name?: string;
  version?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
  license?: string;
  description?: string;
  keywords?: string[];
  author?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

export type WorkspacePackage = {
  dir: string;
  manifestPath: string;
  name: string;
  packageDirName: string;
  packageJson: PackageJson;
};

// Preserve the historical loose JSON fixture typing used by root tests while
// allowing callers to opt into a narrower manifest shape when useful.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseJson = Record<string, any>;

export const readJson = <T = LooseJson>(rel: string): T =>
  JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as T;

const expandWorkspacePackageDirs = (workspaces: string[]): string[] => {
  const packageDirs = new Set<string>();

  for (const workspace of workspaces) {
    if (
      workspace.endsWith("/*") &&
      workspace.indexOf("*") === workspace.length - 1
    ) {
      const parentDir = workspace.slice(0, -2);
      for (const entry of readdirSync(join(ROOT, parentDir), {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = join(parentDir, entry.name, "package.json");
        if (existsSync(join(ROOT, manifestPath))) {
          packageDirs.add(posix.join(parentDir, entry.name));
        }
      }
      continue;
    }

    if (
      !workspace.includes("*") &&
      existsSync(join(ROOT, workspace, "package.json"))
    ) {
      packageDirs.add(workspace);
      continue;
    }

    throw new Error(
      `Unsupported workspace glob in root package.json: ${workspace}`,
    );
  }

  return [...packageDirs].sort();
};

export const getWorkspacePackages = (): WorkspacePackage[] => {
  const rootPkg = readJson<PackageJson>("package.json");
  return expandWorkspacePackageDirs(rootPkg.workspaces ?? []).map((dir) => {
    const manifestPath = `${dir}/package.json`;
    const packageJson = readJson<PackageJson>(manifestPath);
    if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
      throw new Error(`${manifestPath} must declare a package name`);
    }

    return {
      dir,
      manifestPath,
      name: packageJson.name,
      packageDirName: dir.slice("packages/".length),
      packageJson,
    };
  });
};

export const getWorkspacePackageDirNames = (): string[] =>
  getWorkspacePackages().map(
    (workspacePackage) => workspacePackage.packageDirName,
  );

export const getWorkspacePackageManifestPaths = (): string[] =>
  getWorkspacePackages().map(
    (workspacePackage) => workspacePackage.manifestPath,
  );
