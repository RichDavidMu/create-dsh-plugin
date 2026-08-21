// Install lefthook's git hooks, but only where they can exist.
//
// A freshly generated project, a CI checkout that fetched a tarball, or a
// vendored copy inside another repository may have no `.git` directory. Running
// `lefthook install` there fails, and because this runs from `postinstall` that
// failure takes the whole `pnpm install` down with it — a broken install for a
// missing convenience. Detect first, and stay quiet when there is nothing to do.

import { spawnSync } from 'node:child_process'

const inGitRepository = spawnSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }).status === 0
if (!inGitRepository) {
  process.stdout.write('install-lefthook: not a git repository, skipping hook install\n')
  process.exit(0)
}

const result = spawnSync('lefthook', ['install'], { stdio: 'inherit', shell: process.platform === 'win32' })
if (result.error !== undefined || result.status !== 0) {
  // Hooks are a local convenience; `pnpm run check` is the real gate. Warn and
  // succeed rather than block the install.
  process.stderr.write('install-lefthook: could not install hooks; run `pnpm exec lefthook install` manually\n')
}
