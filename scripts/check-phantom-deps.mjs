#!/usr/bin/env node
/**
 * Phantom-dependency guard.
 *
 * For every publishable package, parses its BUILT output (dist/) with acorn and
 * asserts every bare module specifier it imports at runtime — static
 * `import`/`export ... from`, dynamic `import('x')`, and `require('x')` — is
 * declared in that package's own dependencies / optionalDependencies /
 * peerDependencies.
 *
 * This catches the class of bug the in-monorepo test suite hides via workspace
 * hoisting: a runtime import of a package that isn't declared (e.g. the
 * undeclared `sharp` that crashed the installed CLI, the undeclared `acorn`
 * imported by the logic-loop evaluator, or an internal `@franken/*` dep
 * silently dropped from `dependencies`). Using a real parser (not a regex)
 * means comments and string literals like `{ name: '@franken/observer' }` are
 * not mistaken for imports, and scanning dist (not src) ignores type-only
 * imports that are erased at compile time.
 *
 * Run: node scripts/check-phantom-deps.mjs   (requires a prior build)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { parse } from 'acorn';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgsDir = join(repoRoot, 'packages');
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** Resolve a bare specifier to its package name (handles scoped + subpaths). */
function packageOf(spec) {
  if (spec.startsWith('@')) {
    const [scope, name] = spec.split('/');
    return name ? `${scope}/${name}` : spec;
  }
  return spec.split('/')[0];
}

const isBare = (spec) =>
  typeof spec === 'string' &&
  spec.length > 0 &&
  !spec.startsWith('.') &&
  !spec.startsWith('/') &&
  !spec.startsWith('node:') &&
  !NODE_BUILTINS.has(spec);

function jsFilesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs)$/.test(entry)) out.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** Collect runtime import specifiers from one JS file via acorn AST walk. */
function importsIn(file) {
  const src = readFileSync(file, 'utf8');
  let ast;
  for (const sourceType of ['module', 'script']) {
    try {
      ast = parse(src, { ecmaVersion: 'latest', sourceType, allowReturnOutsideFunction: true });
      break;
    } catch {
      /* try next sourceType */
    }
  }
  if (!ast) throw new Error(`acorn could not parse ${file}`);

  const specs = new Set();
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (node.source?.type === 'Literal' && typeof node.source.value === 'string') specs.add(node.source.value);
        break;
      case 'ImportExpression': // dynamic import('x')
        if (node.source?.type === 'Literal' && typeof node.source.value === 'string') specs.add(node.source.value);
        break;
      case 'CallExpression':
        if (
          node.callee?.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments[0]?.type === 'Literal' &&
          typeof node.arguments[0].value === 'string'
        ) {
          specs.add(node.arguments[0].value);
        }
        break;
      default:
        break;
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === 'string' && visit(c));
      else if (child && typeof child.type === 'string') visit(child);
    }
  };
  visit(ast);

  return new Set([...specs].filter(isBare).map(packageOf));
}

let failures = 0;
for (const name of readdirSync(pkgsDir)) {
  const pkgDir = join(pkgsDir, name);
  let pj;
  try {
    pj = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  } catch {
    continue;
  }
  if (pj.private) continue;
  const declared = new Set([
    ...Object.keys(pj.dependencies ?? {}),
    ...Object.keys(pj.optionalDependencies ?? {}),
    ...Object.keys(pj.peerDependencies ?? {}),
  ]);
  const dist = join(pkgDir, 'dist');
  if (!existsSync(dist)) {
    console.error(`FAIL: ${pj.name} has no dist/ — run the build before this check`);
    failures += 1;
    continue;
  }
  const used = new Set();
  for (const f of jsFilesUnder(dist)) for (const s of importsIn(f)) used.add(s);
  // A package importing itself by name is always allowed (barrel re-exports).
  used.delete(pj.name);
  const missing = [...used].filter((s) => !declared.has(s)).sort();
  for (const s of missing) {
    console.error(`FAIL: ${pj.name} imports "${s}" at runtime but does not declare it as a dependency`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} undeclared (phantom) dependency import(s) found.`);
  process.exit(1);
}
console.log('phantom-dependency check OK — every runtime import in dist is declared');
