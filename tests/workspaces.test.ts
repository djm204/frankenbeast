import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const readPkg = readJson;

const majorMinorPatch = (version: string) => {
  const match = version.match(/^(?:\^|~)?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported semver range: ${version}`);
  }
  return match.slice(1).map(Number) as [number, number, number];
};

const isAtLeast = (version: string, minimum: string) => {
  const current = majorMinorPatch(version);
  const target = majorMinorPatch(minimum);
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] > target[index]) return true;
    if (current[index] < target[index]) return false;
  }
  return true;
};

describe('npm workspaces configuration', () => {
  describe('root package.json', () => {
    const rootPkg = readPkg('package.json');

    it('has workspaces field set to packages/*', () => {
      expect(rootPkg.workspaces).toEqual(['packages/*']);
    });

    it('remains private (required for workspaces)', () => {
      expect(rootPkg.private).toBe(true);
    });

    it('pins ws to a security-fixed version for all workspace consumers', () => {
      expect(rootPkg.overrides?.ws).toBeDefined();
      expect(isAtLeast(rootPkg.overrides.ws, '8.21.0')).toBe(true);
    });

    it('uses the root package-lock.json as the only package workspace lockfile', () => {
      expect(existsSync(join(ROOT, 'package-lock.json')), 'root package-lock.json must govern workspace installs').toBe(true);

      const nestedWorkspaceLockfiles = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `packages/${entry.name}/package-lock.json`)
        .filter((path) => existsSync(join(ROOT, path)));

      expect(
        nestedWorkspaceLockfiles,
        'npm workspaces under packages/* must not commit nested lockfiles; use the root package-lock.json instead',
      ).toEqual([]);
    });

    it('pins Vite to a security-fixed version for Vitest consumers', () => {
      expect(rootPkg.overrides?.vite).toBeDefined();
      expect(isAtLeast(rootPkg.overrides.vite, '8.1.3')).toBe(true);
    });

    it('pins Anthropic SDK above the vulnerable memory-tool advisory ranges', () => {
      expect(rootPkg.overrides?.['@anthropic-ai/sdk']).toBeDefined();
      expect(isAtLeast(rootPkg.overrides['@anthropic-ai/sdk'], '0.110.0')).toBe(true);
    });

    it('keeps Turbo above the local execution/session advisory range', () => {
      expect(rootPkg.devDependencies?.turbo).toBeDefined();
      expect(isAtLeast(rootPkg.devDependencies.turbo, '2.10.3')).toBe(true);
    });

    it('fans out coverage through workspace package scripts instead of root-only Vitest', () => {
      expect(rootPkg.scripts?.['test:coverage']).toContain('turbo run test:coverage');
      expect(rootPkg.scripts?.['test:coverage']).toContain('--filter="./packages/*"');
      expect(rootPkg.scripts?.['test:coverage:root']).toBe('vitest run --coverage');
    });
  });

  describe('workspace coverage scripts', () => {
    const packageJsonPaths = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `packages/${entry.name}/package.json`);

    it('registers a Turbo coverage task for package workspaces', () => {
      const turbo = readJson('turbo.json');
      expect(turbo.tasks?.['test:coverage']).toBeDefined();
      expect(turbo.tasks?.['test:coverage']?.dependsOn).toContain('^build');
      expect(turbo.tasks?.['test:coverage']?.outputs).toContain('coverage/**');
    });

    it('exposes coverage consistently for every tested package workspace', () => {
      const missingCoverage = packageJsonPaths
        .map((path) => ({ path, pkg: readPkg(path) }))
        .filter(({ pkg }) => pkg.scripts?.test && !pkg.scripts?.['test:coverage'])
        .map(({ path }) => path);

      expect(
        missingCoverage,
        'tested package workspaces must expose test:coverage or be explicitly excluded',
      ).toEqual([]);
    });
  });

  describe('Vitest toolchain security floor', () => {
    const minimumVitest = '4.1.9';
    const packageJsonPaths = [
      'package.json',
      ...readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `packages/${entry.name}/package.json`),
    ];
    const dependencySections = [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ] as const;
    const getDirectDependencies = (pkg: Record<string, Record<string, string> | undefined>, dependencyName: string) => dependencySections
      .map((dependencySection) => ({
        dependencySection,
        version: pkg[dependencySection]?.[dependencyName],
      }))
      .filter((entry): entry is { dependencySection: typeof dependencySections[number]; version: string } => entry.version !== undefined);
    const majorOf = (version: string) => majorMinorPatch(version)[0];

    it('keeps workspace Vitest declarations on the root Vitest major', () => {
      const rootPkg = readPkg('package.json');
      const rootVitest = rootPkg.devDependencies?.vitest;

      expect(rootVitest).toBeDefined();
      const rootVitestMajor = majorOf(rootVitest);

      for (const path of packageJsonPaths) {
        const pkg = readPkg(path);
        const vitestDeclarations = getDirectDependencies(pkg, 'vitest');

        for (const { dependencySection, version } of vitestDeclarations) {
          expect(
            majorOf(version),
            `vitest in ${path} ${dependencySection} must stay on root major ${rootVitestMajor}`,
          ).toBe(rootVitestMajor);
        }
      }
    });

    it('keeps workspace coverage-v8 declarations on the same major as Vitest', () => {
      for (const path of packageJsonPaths) {
        const pkg = readPkg(path);
        const vitestDeclarations = getDirectDependencies(pkg, 'vitest');
        const coverageDeclarations = getDirectDependencies(pkg, '@vitest/coverage-v8');
        if (coverageDeclarations.length === 0) continue;

        expect(vitestDeclarations.length, `${path} declares @vitest/coverage-v8 without vitest`).toBeGreaterThan(0);
        const vitestMajors = new Set(vitestDeclarations.map(({ version }) => majorOf(version)));
        for (const { dependencySection, version } of coverageDeclarations) {
          expect(
            vitestMajors.has(majorOf(version)),
            `@vitest/coverage-v8 in ${path} ${dependencySection} must match a declared vitest major`,
          ).toBe(true);
        }
      }
    });

    it('keeps every Vitest and coverage dependency on the non-vulnerable floor', () => {
      for (const path of packageJsonPaths) {
        const pkg = readPkg(path);
        for (const dependencySection of [
          'dependencies',
          'devDependencies',
          'optionalDependencies',
          'peerDependencies',
        ]) {
          const dependencies = pkg[dependencySection] ?? {};

          for (const dependencyName of ['vitest', '@vitest/coverage-v8']) {
            const version = dependencies[dependencyName];
            if (version === undefined) continue;

            expect(
              isAtLeast(version, minimumVitest),
              `${dependencyName} in ${path} ${dependencySection} must stay >= ${minimumVitest}`,
            ).toBe(true);
          }
        }
      }
    });

    it('keeps every locked Vitest, Vite, and Turbo package on its security floor', () => {
      const lockfile = readJson('package-lock.json');
      const toolchainFloors = {
        vitest: minimumVitest,
        '@vitest/coverage-v8': minimumVitest,
        vite: '8.1.3',
        turbo: '2.10.3',
        '@turbo/darwin-64': '2.10.3',
        '@turbo/darwin-arm64': '2.10.3',
        '@turbo/linux-64': '2.10.3',
        '@turbo/linux-arm64': '2.10.3',
        '@turbo/windows-64': '2.10.3',
        '@turbo/windows-arm64': '2.10.3',
      };

      for (const [packageName, minimumVersion] of Object.entries(toolchainFloors)) {
        const lockedEntries = Object.entries(lockfile.packages ?? {})
          .filter(([path]) => path === `node_modules/${packageName}` || path.endsWith(`/node_modules/${packageName}`));

        expect(lockedEntries.length, `${packageName} missing from package-lock.json`).toBeGreaterThan(0);

        for (const [path, packageDetails] of lockedEntries) {
          const lockedVersion = (packageDetails as { version?: string }).version;

          expect(lockedVersion, `${packageName} at ${path} is missing a locked version`).toBeDefined();
          expect(
            isAtLeast(lockedVersion ?? '0.0.0', minimumVersion),
            `${packageName} at ${path} must stay >= ${minimumVersion}`,
          ).toBe(true);
        }
      }
    });

    it('keeps the issue #498 npm audit packages on non-vulnerable locked versions', () => {
      const lockfile = readJson('package-lock.json');
      const packageFloors = {
        '@anthropic-ai/sdk': '0.110.0',
        '@babel/core': '7.29.1',
        '@protobufjs/utf8': '1.1.1',
        esbuild: '0.28.1',
        'fast-uri': '3.1.3',
        'form-data': '4.0.6',
        hono: '4.12.27',
        'ip-address': '10.2.0',
        'js-yaml': '4.3.0',
        postcss: '8.5.10',
        protobufjs: '7.6.5',
        qs: '6.15.3',
        vite: '8.1.3',
        'vite-node': '4.1.9',
        vitest: minimumVitest,
        '@vitest/coverage-v8': minimumVitest,
        '@vitest/mocker': minimumVitest,
        ws: '8.21.0',
      };

      for (const [packageName, minimumVersion] of Object.entries(packageFloors)) {
        const lockedEntries = Object.entries(lockfile.packages ?? {})
          .filter(([path]) => path === `node_modules/${packageName}` || path.endsWith(`/node_modules/${packageName}`));

        if (packageName === '@anthropic-ai/sdk') {
          expect(lockedEntries.length, `${packageName} missing from package-lock.json`).toBeGreaterThan(0);
        }

        for (const [path, packageDetails] of lockedEntries) {
          const lockedVersion = (packageDetails as { version?: string }).version;

          expect(lockedVersion, `${packageName} at ${path} is missing a locked version`).toBeDefined();
          expect(
            isAtLeast(lockedVersion ?? '0.0.0', minimumVersion),
            `${packageName} at ${path} must stay >= ${minimumVersion}`,
          ).toBe(true);
        }
      }

      const braceExpansionEntries = Object.entries(lockfile.packages ?? {})
        .filter(([path]) => path === 'node_modules/brace-expansion' || path.endsWith('/node_modules/brace-expansion'));
      const braceExpansionFloorsByMajor: Record<number, string> = {
        1: '1.1.15',
        2: '2.1.1',
        3: '3.0.2',
        4: '4.0.1',
        5: '5.0.7',
      };

      expect(braceExpansionEntries.length, 'brace-expansion missing from package-lock.json').toBeGreaterThan(0);
      for (const [path, packageDetails] of braceExpansionEntries) {
        const lockedVersion = (packageDetails as { version?: string }).version;

        expect(lockedVersion, `brace-expansion at ${path} is missing a locked version`).toBeDefined();
        const [major] = majorMinorPatch(lockedVersion ?? '0.0.0');
        const minimumVersion = braceExpansionFloorsByMajor[major];

        expect(
          minimumVersion,
          `brace-expansion at ${path} uses unsupported major ${major}; add its fixed floor before allowing it`,
        ).toBeDefined();
        expect(
          isAtLeast(lockedVersion ?? '0.0.0', minimumVersion ?? '999.999.999'),
          `brace-expansion at ${path} must stay on the fixed floor for major ${major}`,
        ).toBe(true);
      }
    });
  });

  describe('cross-module dependencies use coherent internal versions', () => {
    const packageJsonPaths = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `packages/${entry.name}/package.json`);
    const packageManifests = packageJsonPaths.map((path) => ({
      path,
      pkg: readPkg(path),
    }));
    const internalPackageVersions = new Map(
      packageManifests.map(({ pkg }) => [pkg.name, pkg.version]),
    );

    it('pins every internal dependency to the matching package version instead of registry wildcards', () => {
      for (const { path, pkg } of packageManifests) {
        for (const dependencySection of [
          'dependencies',
          'devDependencies',
          'optionalDependencies',
          'peerDependencies',
        ]) {
          const dependencies = pkg[dependencySection] ?? {};

          for (const [name, version] of Object.entries(dependencies)) {
            const internalVersion = internalPackageVersions.get(name);
            if (internalVersion === undefined) continue;

            expect(
              version,
              `${name} in ${path} ${dependencySection} must match the internal package version`,
            ).toBe(internalVersion);
          }
        }
      }
    });
  });

  describe('publishable package manifests', () => {
    const packageJsonPaths = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `packages/${entry.name}/package.json`);

    it('declares the shared MIT license on every publishable package and the top-level README', () => {
      for (const path of packageJsonPaths) {
        const pkg = readPkg(path);
        if (pkg.private === true) continue;

        expect(pkg.license, `${path} must declare the shared product license`).toBe('MIT');
      }

      const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
      expect(readme).toMatch(/## License\n\nMIT\n?$/);
    });

    it('keeps publishable package discovery metadata intentional', () => {
      for (const path of packageJsonPaths) {
        const pkg = readPkg(path);
        if (pkg.private === true) continue;

        expect(typeof pkg.description, `${path} must describe the package for npm discovery`).toBe('string');
        expect(pkg.description.trim().length, `${path} must use a non-empty package description`).toBeGreaterThan(0);
        expect(Array.isArray(pkg.keywords), `${path} must declare npm keywords`).toBe(true);
        expect(pkg.keywords.length, `${path} must include at least one npm keyword`).toBeGreaterThan(0);
        expect(pkg.keywords, `${path} must include the shared frankenbeast discovery keyword`).toContain('frankenbeast');
        if (pkg.author !== undefined) {
          expect(typeof pkg.author, `${path} author must be a string when declared`).toBe('string');
          expect(pkg.author.trim().length, `${path} must not declare an empty author`).toBeGreaterThan(0);
        }
      }
    });

    it('builds dist artifacts before publishing publishable packages', () => {
      for (const path of packageJsonPaths) {
        const pkg = readPkg(path);
        if (pkg.private === true) continue;

        expect(pkg.scripts?.build, `${path} must define a build script`).toBeDefined();
        expect(
          pkg.scripts?.prepublishOnly,
          `${path} must build the workspace before npm publish so dist/bin entries and internal dependency types are fresh`,
        ).toBe('npm --prefix ../.. run build');
      }
    });
  });

  describe('no file: dependencies remain anywhere', () => {
    const allPackages = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const module of allPackages) {
      it(`packages/${module}/package.json has no file: dependencies`, () => {
        const pkg = readPkg(`packages/${module}/package.json`);
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };
        for (const [name, version] of Object.entries(allDeps)) {
          expect(version, `${name} in ${module} uses file: path`).not.toMatch(
            /^file:/,
          );
        }
      });
    }
  });

  describe('canonical package namespace strategy', () => {
    const expectedNames: Record<string, string> = {
      'franken-brain': '@franken/brain',
      'franken-critique': '@franken/critique',
      'franken-governor': '@franken/governor',
      'franken-mcp-suite': '@franken/mcp-suite',
      'franken-observer': '@franken/observer',
      'franken-orchestrator': '@franken/orchestrator',
      'franken-planner': '@franken/planner',
      'franken-types': '@franken/types',
      'franken-web': '@franken/web',
      'live-bench': '@franken/live-bench',
    };

    for (const [dir, name] of Object.entries(expectedNames)) {
      it(`packages/${dir}/package.json uses canonical name "${name}"`, () => {
        const pkg = readPkg(`packages/${dir}/package.json`);
        expect(pkg.name).toBe(name);
      });
    }

    it('keeps every publishable package under the @franken npm scope', () => {
      const allPackageJsonPaths = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `packages/${entry.name}/package.json`);

      for (const path of allPackageJsonPaths) {
        const pkg = readPkg(path);
        if (pkg.private === true) continue;
        expect(pkg.name, `${path} must use the canonical @franken scope`).toMatch(/^@franken\//);
      }
    });
  });
});
