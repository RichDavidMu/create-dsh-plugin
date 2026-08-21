#!/usr/bin/env node
/**
 * `dsh-trace <package>…` — print where each installed dsh dependency's contract
 * can be read: its emitted declarations, its README, its upstream source URL for
 * the installed release, and the local source snapshot when `dsh-graph` has
 * fetched one. Run from a project that has them installed.
 *
 * This file and its `./trace.ts` sibling are copied into every generated project
 * under `scripts/`, so a project can trace its own dependencies without
 * depending on this scaffold.
 * @module @rdmu/create-dsh-plugin/dsh-trace
 */

import { localSnapshotOf, resolutionRoots, traceFromRoots } from './dsh-source.ts'
import { formatTrace } from './trace.ts'

const names = process.argv.slice(2)
if (names.length === 0) {
  process.stderr.write(
    'usage: dsh-trace <package>...\n'
    + '  e.g. dsh-trace @deepseek-ai/dsh-tools @deepseek-ai/dsh-system-prompt\n',
  )
  process.exit(2)
}

let failed = false
const roots = resolutionRoots(process.cwd())
for (const name of names) {
  try {
    // Resolved from the packages that declare dsh, not just the working directory:
    // dsh packages are a plugin's peers, and the workspace root only sees them
    // when pnpm happens to expose them through NODE_PATH.
    const trace = traceFromRoots(name, roots)
    const snapshot = localSnapshotOf(trace, process.cwd())
    process.stdout.write(`${formatTrace(snapshot === undefined ? trace : { ...trace, localSource: snapshot })}\n`)
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    failed = true
  }
}
if (failed) process.exit(1)
