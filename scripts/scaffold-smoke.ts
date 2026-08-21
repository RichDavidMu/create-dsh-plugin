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
function run(command: string, args: readonly string[], cwd: string): void {
  process.stdout.write(`\n$ ${command} ${args.join(' ')}    (in ${cwd})\n`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`scaffold-smoke: \`${command} ${args.join(' ')}\` failed with exit code ${String(result.status)}`)
  }
}

rmSync(smokeRoot, { recursive: true, force: true })
mkdirSync(smokeRoot, { recursive: true })

// 1. Build first. The tarball publishes `lib/`, so packing a stale build would
//    test yesterday's scaffold against today's template — exactly the kind of
//    source/artifact mismatch this smoke test exists to catch.
run('pnpm', ['run', 'build'], repoRoot)

// 2. Pack the scaffold, which runs `prepack` and therefore assembles template/.
run('pnpm', ['--filter', 'create-dsh-plugin', 'pack', '--pack-destination', smokeRoot], repoRoot)
const tarball = readdirSync(smokeRoot).find(entry => entry.endsWith('.tgz'))
if (tarball === undefined) throw new Error(`scaffold-smoke: no tarball landed in ${smokeRoot}`)

// 3. Install it as a real dependency, so the bin and template resolve exactly as
//    they would for a person running `pnpm create`.
const host = join(smokeRoot, 'host')
mkdirSync(host, { recursive: true })
run('pnpm', ['init'], host)
run('pnpm', ['add', join(smokeRoot, tarball)], host)

// 4. Generate from the PUBLISHED layout, with a renamed role and a scope so the
//    substitution paths are exercised too.
const target = join(host, 'generated')
run('pnpm', ['exec', 'create-dsh-plugin', 'generated', '--scope', '@smoke', '--plugin', 'word-count'], host)
for (const relative of [
  join('packages', 'plugin', 'word-count', 'src', 'index.ts'),
  join('scripts', 'dsh-trace.ts'),
  join('scripts', 'trace.ts'),
  join('scripts', 'install-lefthook.mjs'),
  join('docs', 'plugin-authoring.md'),
]) {
  if (!existsSync(join(target, relative))) {
    throw new Error(`scaffold-smoke: the generated project is missing ${relative}`)
  }
}

// 5. Prove the generated project stands on its own, coverage floor included.
run('pnpm', ['install'], target)
run('pnpm', ['run', 'check'], target)
run('pnpm', ['run', 'test:coverage'], target)

// 6. The tracing tool must work inside the generated project, since that is
//    where a plugin author reads a dsh contract from.
run('pnpm', ['run', 'trace', '@deepseek-ai/dsh-tools'], target)

if (!keep) rmSync(smokeRoot, { recursive: true, force: true })
process.stdout.write(`\nscaffold-smoke: passed${keep ? ` (kept ${smokeRoot})` : ''}\n`)
