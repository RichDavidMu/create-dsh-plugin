#!/usr/bin/env node
/**
 * `dsh-graph [--dry-run] [--force] [--quiet]` — put this project's dsh source on
 * disk and build the code graphs an agent queries instead of guessing.
 *
 * Two graphs, deliberately: one over the dsh snapshot, one over this project.
 * Keeping them apart is what stops the project's own impact analysis from
 * dragging the whole dsh tree into every blast radius.
 *
 * Runs from `postinstall` with `--quiet`, which is why nothing here can fail an
 * install: a missing `git`, an absent network, an uninstalled `codegraph`, or a
 * credential prompt must leave `pnpm install` succeeding with a printed reason.
 * An explicit run reports failure through its exit code instead. `DSH_GRAPH=0`
 * skips the work — but not `--dry-run`, which stays available so a release gate
 * can assert what this resolves without a network.
 *
 * Argv, the environment, process spawning, and the exit code live here; the
 * ordering rules live in `./graph-runner.ts` and the decisions in
 * `./dsh-source.ts`.
 * @module @rdmu/create-dsh-plugin/dsh-graph
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { formatPlan, planGraph, resolutionRoots, snapshotFor, traceReference, type GraphPlan } from './dsh-source.ts'
import { quoteForShell, runGraph, type GraphIo } from './graph-runner.ts'

/**
 * Ceiling on one spawned step, as a backstop rather than a policy: git is told not
 * to prompt and codegraph does not, so reaching this means something is wedged,
 * and a wedged `postinstall` is worse than a missing graph.
 */
const STEP_TIMEOUT_MS = 600_000

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const quiet = args.includes('--quiet')
const projectRoot = process.cwd()
const onWindows = process.platform === 'win32'

/** Report a reason the graph is not there, and leave a `postinstall` run successful. */
function give(reason: string): never {
  process.stderr.write(`dsh-graph: ${reason}\n`)
  process.exit(quiet ? 0 : 1)
}

const io: GraphIo = {
  spawn: (command, argv) => {
    const result = spawnSync(command, onWindows ? argv.map(quoteForShell) : [...argv], {
      cwd: projectRoot,
      stdio: quiet ? 'ignore' : 'inherit',
      shell: onWindows,
      timeout: STEP_TIMEOUT_MS,
      // git must fail rather than ask: under `stdio: 'ignore'` a credential prompt
      // goes to /dev/tty, invisible, and blocks the install forever.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' },
    })
    if (result.error !== undefined) return `${command} could not run (${result.error.message})`
    if (result.signal !== null) return `${command} was killed by ${result.signal} (the step timeout is 10 minutes)`
    if (result.status !== 0) return `\`${command} ${argv.join(' ')}\` exited with ${String(result.status)}`
    return undefined
  },
  clear: (plan) => {
    rmSync(plan.snapshot.directory, { recursive: true, force: true })
    rmSync(plan.snapshot.marker, { force: true })
    mkdirSync(dirname(plan.snapshot.directory), { recursive: true })
  },
  markFetched: (plan) => {
    writeFileSync(plan.snapshot.marker, `${plan.snapshot.tag}\n${plan.snapshot.remote}\n`)
  },
  // Progress goes to stdout even when quiet: these steps take tens of seconds, and
  // an unexplained pause in `pnpm install` is worse than one line of output.
  say: line => process.stdout.write(`dsh-graph: ${line}\n`),
  warn: give,
}

let plan: GraphPlan
try {
  plan = planGraph(snapshotFor(traceReference(resolutionRoots(projectRoot)), projectRoot), projectRoot, force)
} catch (error) {
  give((error as Error).message)
}

if (dryRun) {
  process.stdout.write(`${formatPlan(plan)}\n`)
  process.exit(0)
}

if (process.env.DSH_GRAPH === '0') {
  if (!quiet) process.stdout.write('dsh-graph: skipped by DSH_GRAPH=0\n')
  process.exit(0)
}

// `io.warn` is `give`, which exits the process, so this only returns once every
// step has succeeded.
runGraph(plan, io)

process.stdout.write(
  quiet
    ? `dsh-graph: ${plan.snapshot.tag} indexed at ${plan.snapshot.directory}\n`
    : `dsh-graph: ${plan.snapshot.tag} ready\n`
    + `  source         ${plan.snapshot.directory}\n`
    + `  ask the graph  codegraph explore '<question>' --path ${plan.snapshot.directory}\n`
    + `  from an agent  codegraph_explore, with projectPath ${plan.snapshot.directory}\n`,
)
