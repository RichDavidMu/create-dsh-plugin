// Post-install conveniences, neither of which may fail the install.
//
// `pnpm install` has to succeed on a machine with no network, no `git`, and no
// `codegraph` binary. Both steps here are conveniences — git hooks, and a code
// graph over the pinned dsh source — so each is spawned, watched, and forgiven.
// `pnpm run check` remains the real gate, and `pnpm run dsh:graph` rebuilds the
// graph on demand.
//
// The graph step runs through `tsx` because its logic is TypeScript shared with
// the scaffold that generated this project. A `--prod` install has no `tsx`, and
// that is a skip rather than a failure.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const onWindows = process.platform === 'win32'

spawnSync(process.execPath, [join('scripts', 'install-lefthook.mjs')], { stdio: 'inherit' })

const tsx = join('node_modules', '.bin', onWindows ? 'tsx.cmd' : 'tsx')
if (!existsSync(tsx)) {
  process.stdout.write('postinstall: no tsx, skipping the dsh source graph; run `pnpm run dsh:graph` when you want it\n')
  process.exit(0)
}

spawnSync(tsx, [join('scripts', 'dsh-graph.ts'), '--quiet'], { stdio: 'inherit', shell: onWindows })
