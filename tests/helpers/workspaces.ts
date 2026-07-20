import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");

export type PackageJson = {
  name?: string;
  version?: string;
  workspaces?: string[];
  main?: string;
  types?: string;
  exports?: Record<
    string,
    | string
    | {
        import?: string;
        types?: string;
        default?: string;
      }
  >;
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

const sourcePathFromPublishedEntry = (publishedEntry: string): string | null => {
  const normalizedEntry = publishedEntry.replace(/^\.\//u, "");
  if (!normalizedEntry.startsWith("dist/")) return null;

  if (normalizedEntry.endsWith(".d.ts")) {
    return `src/${normalizedEntry.slice("dist/".length, -".d.ts".length)}.ts`;
  }
  if (normalizedEntry.endsWith(".js")) {
    return `src/${normalizedEntry.slice("dist/".length, -".js".length)}.ts`;
  }
  return null;
};

const getPublishedEntry = (
  target: NonNullable<PackageJson["exports"]>[string],
): string | undefined =>
  typeof target === "string"
    ? target
    : (target.types ?? target.import ?? target.default);

export const getWorkspaceSourceAliases = (): Record<string, string> => {
  const aliases: Array<[string, string]> = [];

  for (const workspacePackage of getWorkspacePackages()) {
    const exportedEntries = Object.entries(
      workspacePackage.packageJson.exports ?? {},
    );
    const entries: Array<
      [string, NonNullable<PackageJson["exports"]>[string] | undefined]
    > =
      exportedEntries.length > 0
        ? exportedEntries
        : [
            [
              ".",
              workspacePackage.packageJson.types ??
                workspacePackage.packageJson.main,
            ],
          ];

    for (const [exportName, target] of entries) {
      if (exportName === undefined || target === undefined) continue;
      const publishedEntry = getPublishedEntry(target);
      if (publishedEntry === undefined) continue;
      const sourcePath = sourcePathFromPublishedEntry(publishedEntry);
      if (sourcePath === null) {
        throw new Error(
          `${workspacePackage.name} export ${exportName} has unsupported entry ${publishedEntry}`,
        );
      }

      const alias =
        exportName === "."
          ? workspacePackage.name
          : `${workspacePackage.name}/${exportName.replace(/^\.\//u, "")}`;
      const targetPath = `./${workspacePackage.dir}/${sourcePath}`;
      if (!existsSync(join(ROOT, workspacePackage.dir, sourcePath))) {
        throw new Error(
          `${alias} maps from ${publishedEntry} to missing source entry ${targetPath}`,
        );
      }
      aliases.push([alias, targetPath]);
    }
  }

  return Object.fromEntries(
    aliases.sort(([left], [right]) => left.localeCompare(right)),
  );
};

export const getWorkspacePackageDirNames = (): string[] =>
  getWorkspacePackages().map(
    (workspacePackage) => workspacePackage.packageDirName,
  );

export const getWorkspacePackageManifestPaths = (): string[] =>
  getWorkspacePackages().map(
    (workspacePackage) => workspacePackage.manifestPath,
  );
