/**
 * Assemble the publishable `@rdmu/create-dsh-plugin` tarball.
 *
 * A source checkout keeps the template split across three places for good
 * reasons: `packages/example/plugin-hello` is a real workspace package so this
 * repository's own typecheck, lint, and tests cover the code it hands out;
 * `templates/root` and `templates/bundle` hold files whose real names would be
 * picked up by this repository's tooling; `docs/` is shared with this
 * repository's own README links.
 *
 * A published tarball cannot reach any of that, so this collapses the three into
 * one `template/` tree plus a `docs/` copy inside the package, which is the
 * layout `resolveTemplateRoots()` looks for first.
 *
 * Run by the package's `prepack`, so `npm pack` and `npm publish` cannot ship a
 * stale or absent template.
 * @module scripts/prepare-cli-package
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const packageRoot = join(repoRoot, 'packages', 'cli', 'create')
const templateOut = join(packageRoot, 'template')
const docsOut = join(packageRoot, 'docs')

/** Copy one tree, replacing whatever was there. */
function replace(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true })
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
}

rmSync(templateOut, { recursive: true, force: true })

replace(join(repoRoot, 'templates', 'root'), join(templateOut, 'root'))
replace(join(repoRoot, 'templates', 'bundle'), join(templateOut, 'bundle'))
replace(join(repoRoot, 'docs'), docsOut)

// The example plugin travels without its build output or installed dependencies.
cpSync(join(repoRoot, 'packages', 'example', 'plugin-hello'), join(templateOut, 'plugin-hello'), {
  recursive: true,
  filter: source => !source.includes('node_modules') && !source.includes(join('plugin-hello', 'lib')),
})

// The tracing and source-graph tools ship as source because a generated project
// receives them as its own `scripts/` files rather than as a dependency on this
// package.
mkdirSync(join(templateOut, 'tools'), { recursive: true })
for (const file of ['trace.ts', 'dsh-trace.ts', 'dsh-source.ts', 'graph-runner.ts', 'dsh-graph.ts']) {
  cpSync(join(packageRoot, 'src', file), join(templateOut, 'tools', file))
}

process.stdout.write(`prepare-cli-package: assembled ${templateOut} and ${docsOut}\n`)
