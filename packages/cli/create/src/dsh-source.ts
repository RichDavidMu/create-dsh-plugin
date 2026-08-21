/**
 * Where a project's dsh source snapshot lives, and what still has to happen
 * before a code graph over it can answer questions.
 *
 * A project installs dsh as built tarballs: `lib/` and `lib/types/*.d.ts`, never
 * `src/`. That is enough to know a contract and not enough to read an
 * implementation, so anything past the declared surface — how a service actually
 * schedules work, why a guard exists, what calls what — needs the repository at
 * the exact release tag.
 *
 * Both halves of that address come from the installed manifest rather than from
 * anything typed by hand, which is the whole point: the snapshot cannot drift
 * from the version the project depends on. Snapshot and graph are disposable —
 * one immutable tag in, one command to rebuild — so neither is committed.
 *
 * This module decides; `./dsh-graph.ts` performs.
 * @module @rdmu/create-dsh-plugin/dsh-source
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cloneRemoteFor, releaseTag, tracePackage, type PackageTrace } from './trace.ts'

/** Project-relative directory holding source snapshots, one directory per dsh release. */
export const SOURCE_ROOT = '.dsh-source'

/** Directory codegraph writes its index into, inside whichever project it indexes. */
export const GRAPH_DIR = '.codegraph'

/**
 * Path of the file that marks one snapshot directory as completely fetched.
 *
 * Beside the snapshot rather than inside it, so the clone stays a clean checkout
 * of the tag and nothing this tool writes can show up in its `git status`.
 */
function markerFor(directory: string): string {
  return `${directory}.fetched`
}

/**
 * dsh packages consulted for the snapshot address, in preference order.
 *
 * Every dsh package is published from one monorepo at one tag, so any of them
 * answers both questions (which remote, which release). Several are listed
 * because a plugin declares only the services it uses, and the first that
 * resolves is as authoritative as the rest.
 */
export const REFERENCE_PACKAGES = [
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-invariants',
] as const

/** One dsh release, as it is fetched into a project. */
export interface SourceSnapshot {
  /** The release this snapshot is of, e.g. `0.1.0-rc.7`. */
  readonly version: string
  /** The tag the clone checks out, e.g. `dsh-v0.1.0-rc.7`. */
  readonly tag: string
  /** The clone remote, always the https form. */
  readonly remote: string
  /** Absolute directory the snapshot occupies. */
  readonly directory: string
  /**
   * Absolute path of the file written once the clone has completed.
   *
   * `git clone` creates `.git` before it checks anything out and keeps it when a
   * checkout fails, so the clone's own artifacts cannot distinguish a finished
   * snapshot from one a killed `postinstall` left half-written. This marker can,
   * and it sits beside the snapshot rather than inside it so the clone stays a
   * clean checkout.
   */
  readonly marker: string
  /** Absolute path of the reference package's own source inside the snapshot, when its manifest declares one. */
  readonly packagePath?: string
}

/**
 * Directories a reference package can be resolved from, nearest first.
 *
 * dsh packages are a plugin's peers rather than the workspace root's
 * dependencies, so resolution has to start inside a package. Every
 * `packages/<group>/<name>` is a candidate rather than one hardcoded path,
 * because the group differs by layout — a generated project keeps its plugin
 * under `packages/plugin/`, the scaffold repository keeps the template's copy
 * under `packages/example/` — and one shared script serves both. The project root
 * comes last, where pnpm's `NODE_PATH` sometimes answers on its own.
 * @param projectRoot - absolute directory of the project.
 * @returns absolute directories to attempt resolution from, in order.
 */
export function resolutionRoots(projectRoot: string): readonly string[] {
  const packagesDir = join(projectRoot, 'packages')
  if (!existsSync(packagesDir)) return [projectRoot]
  const roots: string[] = []
  for (const group of readdirSync(packagesDir).sort()) {
    const groupDir = join(packagesDir, group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const name of readdirSync(groupDir).sort()) {
      const candidate = join(groupDir, name)
      if (existsSync(join(candidate, 'package.json'))) roots.push(candidate)
    }
  }
  roots.push(projectRoot)
  return roots
}

/**
 * Trace one named package from the first root that can resolve it.
 * @param name - the package name.
 * @param roots - directories to resolve from, nearest first; see {@link resolutionRoots}.
 * @returns the trace from the first root that resolves it.
 * @throws Error from the last attempt, so the message still names the package and how to install it.
 */
export function traceFromRoots(name: string, roots: readonly string[]): PackageTrace {
  let failure: Error | undefined
  for (const from of roots) {
    try {
      return tracePackage(name, from)
    } catch (error) {
      failure = error as Error
    }
  }
  if (failure !== undefined) throw failure
  throw new Error(`create-dsh-plugin: cannot resolve ${name}: no directory was offered to resolve from`)
}

/**
 * Resolve the first installed dsh package that can address a snapshot.
 * @param roots - directories to resolve from, nearest first; see {@link resolutionRoots}.
 * @returns the trace of the first reference package that resolves.
 * @throws Error when no dsh package resolves anywhere, which means dependencies are not installed.
 */
export function traceReference(roots: readonly string[]): PackageTrace {
  for (const name of REFERENCE_PACKAGES) {
    try {
      return traceFromRoots(name, roots)
    } catch {
      // A plugin declares only the services it uses, and only one package has to
      // answer. Exhausting the list is the only real failure.
    }
  }
  throw new Error(
    'create-dsh-plugin: no @deepseek-ai/dsh-* package resolves from this project;'
    + ' run `pnpm install` before building the source graph',
  )
}

/**
 * Address the snapshot one traced release corresponds to.
 * @param trace - the reference package's trace, carrying the version and the repository metadata.
 * @param projectRoot - absolute directory of the project the snapshot is fetched into.
 * @returns where that release's source belongs and where it comes from.
 * @throws Error when the manifest declares no GitHub remote, leaving no source to fetch.
 */
export function snapshotFor(trace: PackageTrace, projectRoot: string): SourceSnapshot {
  const remote = trace.repositoryUrl === undefined ? undefined : cloneRemoteFor(trace.repositoryUrl)
  if (remote === undefined) {
    throw new Error(
      `create-dsh-plugin: ${trace.name}@${trace.version} declares no GitHub repository, so its source cannot be`
      + ` located; the declarations in ${trace.directory} remain the contract`,
    )
  }
  const tag = releaseTag(trace.version)
  const directory = join(projectRoot, SOURCE_ROOT, tag)
  return {
    version: trace.version,
    tag,
    remote,
    directory,
    marker: markerFor(directory),
    ...trace.packageDirectory !== undefined ? { packagePath: join(directory, trace.packageDirectory) } : {},
  }
}

/**
 * Arguments that fetch one snapshot: one commit at one tag, nothing else.
 *
 * Shallow and single-branch deliberately. The tag is immutable, so no other
 * commit in that history can answer a question about this release, and the fetch
 * stays a fraction of a full clone — which is what makes running this from
 * `postinstall` defensible.
 * @param snapshot - the snapshot to fetch.
 * @returns argv for `git`, excluding the program name.
 */
export function cloneArgs(snapshot: SourceSnapshot): readonly string[] {
  return ['clone', '--depth', '1', '--single-branch', '--branch', snapshot.tag, snapshot.remote, snapshot.directory]
}

/**
 * Arguments that bring one directory's codegraph index up to date.
 *
 * Three commands, and the difference matters. `init` initializes and builds, and
 * is the only one that works on a directory codegraph has never seen. `sync`
 * updates an existing graph from what changed, which is what a project whose own
 * code moved needs and costs seconds. `index` rebuilds from scratch, for a `--force`
 * that distrusts what is there.
 * @param directory - absolute directory to index.
 * @param rebuild - rebuild from scratch instead of syncing an existing graph.
 * @returns argv for `codegraph`, excluding the program name.
 */
export function indexArgs(directory: string, rebuild: boolean = false): readonly string[] {
  if (!existsSync(join(directory, GRAPH_DIR))) return ['init', directory]
  return [rebuild ? 'index' : 'sync', directory]
}

/** What one `dsh-graph` run has to do. */
export interface GraphPlan {
  /** The release the source graph is built over. */
  readonly snapshot: SourceSnapshot
  /** Absolute directory of the project whose own graph is built alongside the snapshot's. */
  readonly projectRoot: string
  /** Whether the source still has to be fetched. */
  readonly fetch: boolean
  /** Arguments for the snapshot's graph, or `undefined` when it is already built over this snapshot. */
  readonly snapshotIndex?: readonly string[]
  /** Arguments for the project's own graph. Never absent: the project's code is the thing that changes. */
  readonly projectIndex: readonly string[]
}

/**
 * Decide what a run has to do.
 *
 * Two states an interrupted `postinstall` leaves behind are distinguished here: a
 * snapshot fetched but never indexed, and a clone that never finished. The first
 * is why the clone and its graph are checked separately; the second is why the
 * check is the completion marker rather than `.git`, which `git clone` creates up
 * front and leaves behind on failure.
 *
 * The snapshot's graph is skipped when present, because a snapshot's content
 * cannot change without a refetch. The project's graph is never skipped — a `sync`
 * costs seconds and a stale graph silently answers questions about code that no
 * longer exists.
 * @param snapshot - the snapshot address.
 * @param projectRoot - absolute directory of the project being indexed.
 * @param force - refetch the snapshot and rebuild both graphs from scratch.
 * @returns the work to do.
 */
export function planGraph(snapshot: SourceSnapshot, projectRoot: string, force: boolean = false): GraphPlan {
  const fetch = force || !existsSync(snapshot.marker)
  // `init` in both cases that need work: a fetch replaces the directory, so any
  // graph over it describes the old copy, and a directory with no graph is one
  // codegraph has never seen. Only `init` handles either.
  const snapshotIndex = fetch || !existsSync(join(snapshot.directory, GRAPH_DIR))
    ? ['init', snapshot.directory]
    : undefined
  return {
    snapshot,
    projectRoot,
    fetch,
    ...snapshotIndex === undefined ? {} : { snapshotIndex },
    projectIndex: indexArgs(projectRoot, force),
  }
}

/**
 * Render a plan as the report `--dry-run` prints.
 *
 * Every line names the command that would run, so the dry run doubles as the
 * answer to "where does this source come from" — verifiable without a network.
 * @param plan - the plan from {@link planGraph}.
 * @returns the report text, without a trailing newline.
 */
export function formatPlan(plan: GraphPlan): string {
  const { snapshot } = plan
  return [
    `dsh source graph for ${snapshot.tag}`,
    `  remote         ${snapshot.remote}`,
    `  snapshot       ${snapshot.directory}`,
    `  fetch          ${plan.fetch ? `git ${cloneArgs(snapshot).join(' ')}` : 'already fetched'}`,
    `  snapshot graph ${plan.snapshotIndex === undefined ? 'already built' : `codegraph ${plan.snapshotIndex.join(' ')}`}`,
    `  project graph  codegraph ${plan.projectIndex.join(' ')}`,
  ].join('\n')
}

/**
 * The snapshot directory for a traced release, when a completed one is on disk.
 *
 * Version alone answers this, so it holds for a package whose manifest carries no
 * repository metadata at all: a report can name the local source without being
 * able to fetch it. A half-fetched directory is not a snapshot and is not named.
 * @param trace - the traced package.
 * @param projectRoot - absolute directory of the project.
 * @returns the absolute snapshot directory, or `undefined` when nothing complete is fetched.
 */
export function localSnapshotOf(trace: PackageTrace, projectRoot: string): string | undefined {
  const directory = join(projectRoot, SOURCE_ROOT, releaseTag(trace.version))
  return existsSync(markerFor(directory)) ? directory : undefined
}
