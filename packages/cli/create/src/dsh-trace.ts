#!/usr/bin/env node
/**
 * `dsh-trace <package>…` — print where each installed dsh dependency's contract
 * can be read: its emitted declarations, its README, and its upstream source
 * URL for the installed release. Run from a project that has them installed.
 *
 * This file and its `./trace.ts` sibling are copied into every generated project
 * under `scripts/`, so a project can trace its own dependencies without
 * depending on this scaffold.
 * @module create-dsh-plugin/dsh-trace
 */

import { formatTrace, tracePackage } from './trace.ts'

const names = process.argv.slice(2)
if (names.length === 0) {
  process.stderr.write(
    'usage: dsh-trace <package>...\n'
    + '  e.g. dsh-trace @deepseek-ai/dsh-tools @deepseek-ai/dsh-system-prompt\n',
  )
  process.exit(2)
}

let failed = false
for (const name of names) {
  try {
    process.stdout.write(`${formatTrace(tracePackage(name))}\n`)
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    failed = true
  }
}
if (failed) process.exit(1)
