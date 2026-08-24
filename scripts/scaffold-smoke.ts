/**
 * End-to-end smoke test for the published path.
 *
 * The unit tests generate from the SOURCE layout. This packs a real tarball,
 * installs it the way a person would, and generates from the PUBLISHED layout —
 * the only way to catch a missing `files` entry, a broken `prepack`, or a
 * template tree that resolves in a checkout and not in a tarball.
 *
 * Then it runs the generated project's own `pnpm run check`, so the thing this
 * scaffold hands out is proven to typecheck, lint, test, and build before any
 * release. Slow by nature (two real installs); not part of `pnpm run test`.
 *
 * Usage: `pnpm run scaffold:smoke [--keep]`
 * @module scripts/scaffold-smoke
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const smokeRoot = join(repoRoot, '.smoke')
const keep = process.argv.includes('--keep')

/** Run one command, echoing it first, and abort the smoke test on failure. */
function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = {}): void {
  process.stdout.write(`\n$ ${command} ${args.join(' ')}    (in ${cwd})\n`)
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`scaffold-smoke: \`${command} ${args.join(' ')}\` failed with exit code ${String(result.status)}`)
  }
}

/** Run one command, echo its output, and return stdout; abort the smoke test on failure. */
function capture(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = {}): string {
  process.stdout.write(`\n$ ${command} ${args.join(' ')}    (in ${cwd})\n`)
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  })
  if (result.error !== undefined) throw result.error
  process.stdout.write(result.stdout)
  if (result.status !== 0) {
    throw new Error(
      `scaffold-smoke: \`${command} ${args.join(' ')}\` failed with exit code ${String(result.status)}\n${result.stderr}`,
    )
  }
  return result.stdout
}

rmSync(smokeRoot, { recursive: true, force: true })
mkdirSync(smokeRoot, { recursive: true })

// 1. Build first. The tarball publishes `lib/`, so packing a stale build would
//    test yesterday's scaffold against today's template — exactly the kind of
//    source/artifact mismatch this smoke test exists to catch.
run('pnpm', ['run', 'build'], repoRoot)

// 2. Pack the scaffold, which runs `prepack` and therefore assembles template/.
//    Filtered by path, not by package name, so a rename needs no change here.
run('pnpm', ['--filter', './packages/cli/create', 'pack', '--pack-destination', smokeRoot], repoRoot)
const tarball = readdirSync(smokeRoot).find(entry => entry.endsWith('.tgz'))
if (tarball === undefined) throw new Error(`scaffold-smoke: no tarball landed in ${smokeRoot}`)

// 3. Install it as a real dependency, so the bin and template resolve exactly as
//    they would for a person running `pnpm create`. `--ignore-workspace` because
//    the host sits inside this repository and has no manifest of its own: without
//    it, pnpm records the throwaway tarball's integrity hash in the repository's
//    committed lockfile, which then churns on every smoke run.
const host = join(smokeRoot, 'host')
mkdirSync(host, { recursive: true })
run('pnpm', ['init'], host)
run('pnpm', ['add', '--ignore-workspace', join(smokeRoot, tarball)], host)

// 4. Generate from the PUBLISHED layout, once per project shape, with a renamed
//    role and a scope so the substitution paths are exercised too. The single
//    layout is generated WITHOUT `--layout`, because the default is what most
//    people will actually get.
const shared = [
  join('scripts', 'dsh-trace.ts'),
  join('scripts', 'trace.ts'),
  join('scripts', 'dsh-source.ts'),
  join('scripts', 'graph-runner.ts'),
  join('scripts', 'dsh-graph.ts'),
  join('scripts', 'install-lefthook.mjs'),
  join('scripts', 'postinstall.mjs'),
  join('docs', 'plugin-authoring.md'),
  'tsconfig.json',
  'tsdown.config.ts',
  'pnpm-workspace.yaml',
  '.mcp.json',
  join('.claude', 'settings.json'),
  join('.claude', 'skills', 'dsh-source', 'SKILL.md'),
]

/** What each layout must have produced, beyond the files both share. */
const expectedFiles: Record<string, readonly string[]> = {
  single: [
    ...shared,
    join('src', 'index.ts'),
    join('tests', 'plugin.spec.ts'),
    join('tests', 'tsconfig.json'),
    join('bundle', 'cordis.patch.yml'),
    join('bundle', 'package.json'),
  ],
  workspace: [
    ...shared,
    join('packages', 'plugin', 'word-count', 'src', 'index.ts'),
    join('packages', 'plugin', 'word-count', 'tests', 'plugin.spec.ts'),
    join('packages', 'bundle', 'word-count-bundle', 'cordis.patch.yml'),
  ],
}

for (const layout of ['single', 'workspace'] as const) {
  const name = `generated-${layout}`
  const target = join(host, name)
  const layoutFlags = layout === 'single' ? [] : ['--layout', layout]
  run('pnpm', ['exec', 'create-dsh-plugin', name, '--scope', '@smoke', '--plugin', 'word-count', ...layoutFlags], host)

  for (const relative of expectedFiles[layout] ?? []) {
    if (!existsSync(join(target, relative))) {
      throw new Error(`scaffold-smoke: the ${layout} project is missing ${relative}`)
    }
  }
  if (layout === 'single' && existsSync(join(target, 'packages'))) {
    throw new Error('scaffold-smoke: the single layout produced a packages/ directory')
  }

  // 5. Prove the generated project stands on its own, coverage floor included.
  //    DSH_GRAPH=0 for the install: the release gate must not clone a 340 MB dsh
  //    snapshot, and must pass on a machine with no network. Step 7 covers that
  //    path offline instead.
  run('pnpm', ['install'], target, { DSH_GRAPH: '0' })
  run('pnpm', ['run', 'check'], target)
  run('pnpm', ['run', 'test:coverage'], target)

  // 6. The tracing tool must work inside the generated project, since that is
  //    where a plugin author reads a dsh contract from. Where dsh resolves from
  //    differs by layout — root dependencies against a package's peers — so this
  //    is worth running in both.
  run('pnpm', ['run', 'trace', '@deepseek-ai/dsh-tools'], target)

  // 7. The source graph has to resolve its own remote and tag from the installed
  //    manifest, and `--dry-run` proves that offline. `DSH_GRAPH=0` is set on
  //    purpose: a dry run must stay available where CI disables the graph, or this
  //    assertion would quietly stop asserting anything.
  const report = capture('pnpm', ['run', 'dsh:graph', '--dry-run'], target, { DSH_GRAPH: '0' })
  for (const expected of [
    /dsh source graph for dsh-v\d+\.\d+\.\d+/,
    /remote\s+https:\/\/github\.com\/deepseek-ai\/deepseek-harness\.git/,
    /snapshot\s+.*\.dsh-source[/\\]dsh-v/,
    /project graph\s+codegraph init /,
  ]) {
    if (!expected.test(report)) {
      throw new Error(`scaffold-smoke: the ${layout} dry run did not report ${String(expected)}:\n${report}`)
    }
  }

  // 8. In the single layout the project root IS the published package, so its
  //    `files` list is the only thing keeping `docs/`, `scripts/`, and a 300 MB dsh
  //    snapshot out of a plugin author's tarball.
  if (layout === 'single') {
    run('pnpm', ['run', 'pack:bundle'], target)
    const packed = capture('pnpm', ['pack', '--pack-destination', target], target).trim().split('\n').at(-1) ?? ''
    for (const entry of capture('tar', ['-tzf', packed], target).split('\n').filter(line => line.length > 0)) {
      if (!/^package\/(lib\/|package\.json|README\.md)/.test(entry)) {
        throw new Error(`scaffold-smoke: the single layout would publish ${entry}`)
      }
    }
  }
}

if (!keep) rmSync(smokeRoot, { recursive: true, force: true })
process.stdout.write(`\nscaffold-smoke: passed${keep ? ` (kept ${smokeRoot})` : ''}\n`)
