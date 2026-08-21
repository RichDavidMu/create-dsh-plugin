/**
 * Carry out a {@link GraphPlan}: fetch the snapshot, then bring both graphs up to
 * date, giving up with a stated reason rather than propagating a failure.
 *
 * Separate from the `dsh-graph` bin because the ordering rules here are the
 * interesting part and they are worth testing: a clone is marked complete only
 * after it finishes, an index over a directory about to be replaced is never
 * built, and the first failure stops the run instead of indexing a tree that is
 * not there. The bin owns argv, the environment, the real process spawning, and
 * the exit code; every effect this module needs arrives through {@link GraphIo}.
 * @module @rdmu/create-dsh-plugin/graph-runner
 */

import { cloneArgs, type GraphPlan } from './dsh-source.ts'

/**
 * Quote one argument for a shell that will otherwise split it.
 *
 * Node does not quote argv when `shell` is set, and the bin sets `shell` on
 * Windows because `codegraph` installs as a `.cmd` shim a bare spawn cannot
 * execute. Without this, a project under `C:\Users\Some Name\…` reaches `git` as
 * two arguments and the clone lands in the wrong place.
 * @param value - one argument.
 * @returns the argument, quoted when it contains whitespace.
 */
export function quoteForShell(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

/** The effects a run needs, so the sequencing above can be exercised without a network. */export interface GraphIo {
  /**
   * Run one program to completion.
   * @returns a human-readable reason it failed, or `undefined` on success.
   */
  readonly spawn: (command: string, argv: readonly string[]) => string | undefined
  /** Discard whatever occupies the snapshot directory and its marker, and make the parent directory. */
  readonly clear: (plan: GraphPlan) => void
  /** Record that the clone completed, which is what distinguishes a snapshot from an interrupted fetch. */
  readonly markFetched: (plan: GraphPlan) => void
  /** Report progress; each step is tens of seconds, so silence would read as a hang. */
  readonly say: (line: string) => void
  /** Report why the graph is not there, in terms of what to do next. */
  readonly warn: (line: string) => void
}

/**
 * Perform one plan.
 * @param plan - the work to do, from `planGraph`.
 * @param io - the effects to perform it with.
 * @returns whether every step succeeded; a `false` return has already been explained through `io.warn`.
 */
export function runGraph(plan: GraphPlan, io: GraphIo): boolean {
  const { snapshot } = plan
  if (plan.fetch) {
    // `git clone` refuses a directory with contents, and a half-fetched snapshot is
    // exactly what a refetch exists to discard.
    io.clear(plan)
    io.say(`fetching ${snapshot.tag} source into ${snapshot.directory}`)
    const failure = io.spawn('git', cloneArgs(snapshot))
    if (failure !== undefined) {
      io.warn(
        `could not fetch ${snapshot.tag}: ${failure}.`
        + ' Run `pnpm run dsh:graph` once git, credentials, and the network are available',
      )
      return false
    }
    io.markFetched(plan)
  }

  for (const argv of [...plan.snapshotIndex === undefined ? [] : [plan.snapshotIndex], plan.projectIndex]) {
    io.say(`codegraph ${argv.join(' ')}`)
    const failure = io.spawn('codegraph', argv)
    if (failure !== undefined) {
      io.warn(
        `\`codegraph ${argv.join(' ')}\` did not build a graph: ${failure}.`
        + ' Install the CLI with `npm i -g @colbymchenry/codegraph`'
        + ' (or https://github.com/colbymchenry/codegraph), then run `pnpm run dsh:graph`',
      )
      return false
    }
  }
  return true
}
