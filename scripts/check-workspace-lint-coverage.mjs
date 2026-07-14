import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('..', import.meta.url));
const testFilePattern = /(?:^|\/).+\.(?:integration\.)?test\.[cm]?[jt]sx?$/u;
const ignoredTestSearchDirs = new Set(['dist', 'node_modules', 'coverage', '.turbo']);
const lintOptionNamesWithValues = new Set([
  '--config',
  '-c',
  '--ext',
  '--format',
  '-f',
  '--global',
  '--ignore-pattern',
  '--parser',
  '--parser-options',
  '--plugin',
  '--resolve-plugins-relative-to',
  '--rule',
]);

const normalizePathToken = (token) => token
  .trim()
  .replace(/^['"]|['"]$/gu, '')
  .replace(/\\/gu, '/')
  .replace(/^\.\//u, '')
  .replace(/:\d+(?::\d+)?$/u, '');

const shellCommandSeparators = new Set(['&&', '||', ';']);

const joinRelativePath = (baseDir, target) => {
  const normalizedTarget = normalizePathToken(target);
  if (baseDir === '' && normalizedTarget === '.') return '.';
  if (normalizedTarget === '') return baseDir;
  if (normalizedTarget.startsWith('/')) return normalizedTarget.slice(1);
  return posix.normalize(posix.join(baseDir, normalizedTarget)).replace(/^\.\/?/u, '');
};

const lintPathConfig = (lintScript) => {
  const tokens = lintScript.match(/(?:[^\s'"]+|"[^"]*"|'[^']*')+/gu) ?? [];
  const targets = [];
  const ignorePatterns = [];
  let currentDir = '';
  let seenEslint = false;
  let skipNext = false;
  let optionAwaitingValue = null;
  let awaitingCdTarget = false;

  for (const rawToken of tokens) {
    const token = normalizePathToken(rawToken);

    if (awaitingCdTarget) {
      currentDir = joinRelativePath(currentDir, token);
      awaitingCdTarget = false;
      continue;
    }

    if (optionAwaitingValue !== null) {
      if (optionAwaitingValue === '--ignore-pattern') {
        ignorePatterns.push(joinRelativePath(currentDir, token));
      }

      optionAwaitingValue = null;
      continue;
    }

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (shellCommandSeparators.has(token)) {
      seenEslint = false;
      continue;
    }

    if (!seenEslint) {
      if (token === 'cd') {
        awaitingCdTarget = true;
        continue;
      }

      seenEslint = token === 'eslint' || token.endsWith('/eslint');
      continue;
    }

    if (token.startsWith('-')) {
      const optionName = token.includes('=') ? token.slice(0, token.indexOf('=')) : token;
      if (optionName === '--ignore-pattern') {
        if (token.includes('=')) {
          ignorePatterns.push(joinRelativePath(currentDir, token.slice(token.indexOf('=') + 1)));
        } else {
          optionAwaitingValue = optionName;
        }
        continue;
      }

      skipNext = lintOptionNamesWithValues.has(optionName) && !token.includes('=');
      continue;
    }

    targets.push(joinRelativePath(currentDir, token));
  }

  return { targets, ignorePatterns };
};

const globToRegExp = (glob) => {
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];

    if (char === '*' && next === '*') {
      const afterGlobstar = glob[index + 2];
      if (afterGlobstar === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
      continue;
    }

    if (char === '*') {
      source += '[^/]*';
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += char.replace(/[|\\{}()[\]^$+?.]/gu, '\\$&');
  }

  source += '$';
  return new RegExp(source, 'u');
};

const pathMatchesGlob = (pattern, testFile) => {
  if (!/[?*[{]/u.test(pattern)) return false;
  return globToRegExp(pattern).test(testFile);
};

const lintTargetCoversTestFile = (target, testFile) => {
  const normalizedTarget = normalizePathToken(target);
  if (normalizedTarget === '.' || normalizedTarget === '') return normalizedTarget === '.';

  if (pathMatchesGlob(normalizedTarget, testFile)) {
    return true;
  }

  if (/[?*[{]/u.test(normalizedTarget)) {
    return false;
  }

  if (normalizedTarget.endsWith('/')) {
    return testFile.startsWith(normalizedTarget);
  }

  return testFile === normalizedTarget || testFile.startsWith(`${normalizedTarget}/`);
};

const lintScriptCoversTestFile = (lintScript, testFile) => {
  const { targets, ignorePatterns } = lintPathConfig(lintScript);
  if (ignorePatterns.some((pattern) => pathMatchesGlob(pattern, testFile) || lintTargetCoversTestFile(pattern, testFile))) {
    return false;
  }

  return targets.some((target) => lintTargetCoversTestFile(target, testFile));
};

const collectTestFiles = (dir, relativeDir = '') => {
  if (!existsSync(dir)) return [];

  const testFiles = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredTestSearchDirs.has(entry.name)) continue;
      testFiles.push(...collectTestFiles(join(dir, entry.name), relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`));
      continue;
    }

    const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
    if (entry.isFile() && testFilePattern.test(relativePath)) {
      testFiles.push(relativePath);
    }
  }

  return testFiles;
};

export const collectWorkspaceLintCoverageFailures = (root = defaultRoot) => {
  const packagesDir = join(root, 'packages');
  const docsPath = join(root, 'docs', 'lint-coverage.md');
  const docs = existsSync(docsPath) ? readFileSync(docsPath, 'utf8') : '';
  const failures = [];

  if (!existsSync(packagesDir) || !statSync(packagesDir).isDirectory()) {
    failures.push('packages/ directory is missing');
    return failures;
  }

  for (const entry of readdirSync(packagesDir, { withFileTypes: true }).filter((dirent) => dirent.isDirectory())) {
    const packageDir = join(packagesDir, entry.name);
    const manifestPath = join(packageDir, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const packagePath = `packages/${entry.name}`;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const lintScript = manifest.scripts?.lint;
    const configExists = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs']
      .some((configName) => existsSync(join(packageDir, configName)));
    const documented = docs.includes(`| \`${manifest.name}\` | \`${packagePath}\` |`);

    if (typeof lintScript !== 'string' || lintScript.trim().length === 0) {
      failures.push(`${packagePath} (${manifest.name}) is missing scripts.lint`);
    }

    if (!configExists) {
      failures.push(`${packagePath} (${manifest.name}) is missing an ESLint config`);
    }

    if (!documented) {
      failures.push(`${packagePath} (${manifest.name}) is missing from docs/lint-coverage.md`);
    }

    if (typeof lintScript === 'string' && lintScript.trim().length > 0) {
      for (const testFile of collectTestFiles(packageDir)) {
        if (!lintScriptCoversTestFile(lintScript, testFile)) {
          failures.push(`${packagePath} (${manifest.name}) lint script does not cover test file ${testFile}`);
        }
      }
    }
  }

  if (!docs.includes('npm run lint')) {
    failures.push('docs/lint-coverage.md must document the root npm run lint gate');
  }

  return failures;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = collectWorkspaceLintCoverageFailures(process.argv[2] ?? defaultRoot);

  if (failures.length > 0) {
    console.error('Workspace lint coverage is incomplete:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Workspace lint coverage is explicit for every package.');
}
