import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';

export class FixtureStore {
  readonly fixturesRoot: string;
  private readonly fixturesRootReal: string;

  constructor(fixturesRoot: string) {
    this.fixturesRoot = resolve(fixturesRoot);
    if (!existsSync(this.fixturesRoot)) {
      throw new Error(`Fixtures root not found: ${this.fixturesRoot}`);
    }
    if (lstatSync(this.fixturesRoot).isSymbolicLink()) {
      throw new Error(`Fixtures root must not be a symlink: ${this.fixturesRoot}`);
    }
    if (!statSync(this.fixturesRoot).isDirectory()) {
      throw new Error(`Fixtures root is not a directory: ${this.fixturesRoot}`);
    }
    this.fixturesRootReal = realpathSync(this.fixturesRoot);
  }

  resolveFixture(name: string): string {
    if (!name || name === '.' || name !== basename(name) || name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid fixture name: ${name}`);
    }

    const fixturePath = resolve(this.fixturesRoot, name);
    const containedPrefix = this.fixturesRoot.endsWith(sep) ? this.fixturesRoot : `${this.fixturesRoot}${sep}`;
    if (!fixturePath.startsWith(containedPrefix)) {
      throw new Error(`Fixture path escapes fixtures root: ${name}`);
    }

    if (!existsSync(fixturePath)) {
      throw new Error(`Fixture not found: ${name}`);
    }
    if (lstatSync(fixturePath).isSymbolicLink()) {
      throw new Error(`Fixture must not be a symlink: ${name}`);
    }
    if (!statSync(fixturePath).isDirectory()) {
      throw new Error(`Fixture is not a directory: ${name}`);
    }

    const fixtureRealPath = realpathSync(fixturePath);
    const containedRealPrefix = this.fixturesRootReal.endsWith(sep)
      ? this.fixturesRootReal
      : `${this.fixturesRootReal}${sep}`;
    if (!fixtureRealPath.startsWith(containedRealPrefix)) {
      throw new Error(`Fixture real path escapes fixtures root: ${name}`);
    }

    return fixturePath;
  }
}
