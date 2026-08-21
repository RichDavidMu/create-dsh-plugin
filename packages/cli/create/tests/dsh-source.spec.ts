/**
 * The dsh source snapshot: where one release's source belongs, how it is fetched,
 * and what one run has to do.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cloneArgs,
  formatPlan,
  indexArgs,
  localSnapshotOf,
  planGraph,
  resolutionRoots,
  snapshotFor,
  traceFromRoots,
  traceReference,
  GRAPH_DIR,
  REFERENCE_PACKAGES,
  SOURCE_ROOT,
} from '../src/dsh-source.ts'
import type { PackageTrace } from '../src/trace.ts'

/** The remote form an npm manifest carries: `git+https`, which is not directly cloneable. */
const REPOSITORY_URL = 'git+https://github.com/deepseek-ai/deepseek-harness.git'

/** A traced dsh package, as `tracePackage` reports one that carries full metadata. */
const traced: PackageTrace = {
  name: '@deepseek-ai/dsh-tools',
  version: '0.1.0-rc.7',
  directory: '/project/node_modules/@deepseek-ai/dsh-tools',
  declarations: [],
  readmes: [],
  repositoryUrl: REPOSITORY_URL,
  packageDirectory: 'packages/core/tools',
}

/** The same release as published without repository metadata: a contract on disk, no addressable source. */
const bare: PackageTrace = {
  name: traced.name,
  version: traced.version,
  directory: traced.directory,
  declarations: [],
  readmes: [],
}

/** Write a resolvable package manifest under `root`, with `contents` verbatim. */
function installPackage(root: string, name: string, contents: string): void {
  const directory = join(root, 'node_modules', name)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), contents)
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-source-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('resolutionRoots', () => {
  it('offers every workspace package before the project root', () => {
    mkdirSync(join(root, 'packages', 'plugin', 'greeter'), { recursive: true })
    writeFileSync(join(root, 'packages', 'plugin', 'greeter', 'package.json'), '{}')
    mkdirSync(join(root, 'packages', 'bundle', 'greeter-bundle'), { recursive: true })
    writeFileSync(join(root, 'packages', 'bundle', 'greeter-bundle', 'package.json'), '{}')

    expect(resolutionRoots(root)).toEqual([
      join(root, 'packages', 'bundle', 'greeter-bundle'),
      join(root, 'packages', 'plugin', 'greeter'),
      root,
    ])
  })

  it('skips a group entry that is not a package directory', () => {
    mkdirSync(join(root, 'packages', 'plugin', 'no-manifest'), { recursive: true })
    writeFileSync(join(root, 'packages', 'README.md'), 'not a group\n')

    expect(resolutionRoots(root)).toEqual([root])
  })

  it('falls back to the project root when there is no packages directory', () => {
    expect(resolutionRoots(root)).toEqual([root])
  })
})

describe('traceFromRoots', () => {
  it('resolves from a later root when the first cannot see the package', () => {
    const nested = join(root, 'packages', 'plugin', 'greeter')
    mkdirSync(nested, { recursive: true })
    installPackage(nested, 'declared-pkg', JSON.stringify({ name: 'declared-pkg', version: '2.0.0' }))

    expect(traceFromRoots('declared-pkg', [join(root, 'packages'), nested]).version).toBe('2.0.0')
  })

  it('rethrows the last failure, so the message still says how to install it', () => {
    expect(() => traceFromRoots('@deepseek-ai/dsh-absent', [root]))
      .toThrow(/cannot resolve @deepseek-ai\/dsh-absent.*install it first/s)
  })

  it('reports that it was given nowhere to look', () => {
    expect(() => traceFromRoots('anything', [])).toThrow(/no directory was offered to resolve from/)
  })
})

describe('traceReference', () => {
  it('traces a dsh package installed in this workspace', () => {
    const trace = traceReference(resolutionRoots(process.cwd()))
    expect(REFERENCE_PACKAGES).toContain(trace.name)
    expect(trace.repositoryUrl).toContain('deepseek-harness')
  })

  it('moves on to the next reference package when one cannot be read', () => {
    installPackage(root, join('@deepseek-ai', 'dsh-tools'), 'not json at all')
    installPackage(root, join('@deepseek-ai', 'dsh-system-prompt'), JSON.stringify({
      name: '@deepseek-ai/dsh-system-prompt',
      version: '0.1.0-rc.7',
      repository: { url: REPOSITORY_URL, directory: 'packages/core/system-prompt' },
    }))

    expect(traceReference([root]).name).toBe('@deepseek-ai/dsh-system-prompt')
  })

  it('fails with an actionable message when nothing resolves anywhere', () => {
    expect(() => traceReference([])).toThrow(/no @deepseek-ai\/dsh-\* package resolves .*pnpm install/s)
  })
})

describe('snapshotFor', () => {
  it('addresses the release by tag, remote, directory, and completion marker', () => {
    const snapshot = snapshotFor(traced, '/project')

    expect(snapshot).toEqual({
      version: '0.1.0-rc.7',
      tag: 'dsh-v0.1.0-rc.7',
      remote: 'https://github.com/deepseek-ai/deepseek-harness.git',
      directory: join('/project', SOURCE_ROOT, 'dsh-v0.1.0-rc.7'),
      marker: `${join('/project', SOURCE_ROOT, 'dsh-v0.1.0-rc.7')}.fetched`,
      packagePath: join('/project', SOURCE_ROOT, 'dsh-v0.1.0-rc.7', 'packages/core/tools'),
    })
  })

  it('keeps the marker outside the clone, so the snapshot stays a clean checkout', () => {
    const snapshot = snapshotFor(traced, '/project')

    expect(snapshot.marker.startsWith(`${snapshot.directory}/`)).toBe(false)
  })

  it('omits the package path when the manifest does not say where the package lives', () => {
    expect(snapshotFor({ ...bare, repositoryUrl: REPOSITORY_URL }, '/project').packagePath).toBeUndefined()
  })

  it('refuses to invent a location when no repository is declared, and names the contract instead', () => {
    expect(() => snapshotFor(bare, '/project'))
      .toThrow(/declares no GitHub repository.*declarations in \/project\/node_modules/s)
  })

  it('refuses a remote it cannot address, rather than guessing a layout', () => {
    expect(() => snapshotFor({ ...traced, repositoryUrl: 'https://gitlab.com/a/b.git' }, '/project'))
      .toThrow(/declares no GitHub repository/)
  })
})

describe('cloneArgs', () => {
  it('fetches one commit at the release tag and nothing else', () => {
    expect(cloneArgs(snapshotFor(traced, '/project'))).toEqual([
      'clone',
      '--depth',
      '1',
      '--single-branch',
      '--branch',
      'dsh-v0.1.0-rc.7',
      'https://github.com/deepseek-ai/deepseek-harness.git',
      join('/project', SOURCE_ROOT, 'dsh-v0.1.0-rc.7'),
    ])
  })
})

describe('indexArgs', () => {
  it('initializes a directory codegraph has never seen', () => {
    expect(indexArgs(root)).toEqual(['init', root])
  })

  it('syncs an existing graph, which is what a changed project needs', () => {
    mkdirSync(join(root, GRAPH_DIR), { recursive: true })

    expect(indexArgs(root)).toEqual(['sync', root])
  })

  it('rebuilds from scratch when asked to distrust what is there', () => {
    mkdirSync(join(root, GRAPH_DIR), { recursive: true })

    expect(indexArgs(root, true)).toEqual(['index', root])
  })

  it('still initializes under a rebuild when there is no graph yet', () => {
    expect(indexArgs(root, true)).toEqual(['init', root])
  })
})

describe('planGraph', () => {
  /** Mark the snapshot as completely fetched, as a finished clone does. */
  function fetched(marker: string): void {
    mkdirSync(join(root, SOURCE_ROOT), { recursive: true })
    writeFileSync(marker, 'dsh-v0.1.0-rc.7\n')
  }

  it('fetches and builds both graphs for a project that has neither', () => {
    const snapshot = snapshotFor(traced, root)

    const plan = planGraph(snapshot, root)

    expect(plan.fetch).toBe(true)
    expect(plan.snapshotIndex).toEqual(['init', snapshot.directory])
    expect(plan.projectIndex).toEqual(['init', root])
  })

  it('treats an interrupted clone as unfetched, since git leaves .git behind', () => {
    const snapshot = snapshotFor(traced, root)
    mkdirSync(join(snapshot.directory, '.git'), { recursive: true })

    expect(planGraph(snapshot, root).fetch).toBe(true)
  })

  it('leaves a built snapshot graph alone: its content cannot change without a refetch', () => {
    const snapshot = snapshotFor(traced, root)
    fetched(snapshot.marker)
    mkdirSync(join(snapshot.directory, GRAPH_DIR), { recursive: true })
    mkdirSync(join(root, GRAPH_DIR), { recursive: true })

    const plan = planGraph(snapshot, root)

    expect(plan.fetch).toBe(false)
    expect(plan.snapshotIndex).toBeUndefined()
    // Never skipped: the project's own code is the thing that changes.
    expect(plan.projectIndex).toEqual(['sync', root])
  })

  it('indexes a snapshot that was fetched but never indexed', () => {
    const snapshot = snapshotFor(traced, root)
    fetched(snapshot.marker)

    const plan = planGraph(snapshot, root)

    expect(plan.fetch).toBe(false)
    expect(plan.snapshotIndex).toEqual(['init', snapshot.directory])
  })

  it('refetches and rebuilds everything under force', () => {
    const snapshot = snapshotFor(traced, root)
    fetched(snapshot.marker)
    mkdirSync(join(snapshot.directory, GRAPH_DIR), { recursive: true })
    mkdirSync(join(root, GRAPH_DIR), { recursive: true })

    const plan = planGraph(snapshot, root, true)

    expect(plan.fetch).toBe(true)
    expect(plan.snapshotIndex).toEqual(['init', snapshot.directory])
    expect(plan.projectIndex).toEqual(['index', root])
  })
})

describe('formatPlan', () => {
  it('names the command behind every step, so a dry run answers where the source comes from', () => {
    const report = formatPlan(planGraph(snapshotFor(traced, root), root))

    expect(report).toContain('dsh source graph for dsh-v0.1.0-rc.7')
    expect(report).toContain('remote         https://github.com/deepseek-ai/deepseek-harness.git')
    expect(report).toContain('git clone --depth 1 --single-branch --branch dsh-v0.1.0-rc.7')
    expect(report).toContain(`codegraph init ${join(root, SOURCE_ROOT, 'dsh-v0.1.0-rc.7')}`)
    expect(report).toContain(`codegraph init ${root}`)
  })

  it('says what is already there instead of a command', () => {
    const snapshot = snapshotFor(traced, root)
    mkdirSync(join(root, SOURCE_ROOT), { recursive: true })
    writeFileSync(snapshot.marker, 'fetched\n')
    mkdirSync(join(snapshot.directory, GRAPH_DIR), { recursive: true })
    mkdirSync(join(root, GRAPH_DIR), { recursive: true })

    const report = formatPlan(planGraph(snapshot, root))

    expect(report).toContain('fetch          already fetched')
    expect(report).toContain('snapshot graph already built')
    expect(report).toContain(`project graph  codegraph sync ${root}`)
  })
})

describe('localSnapshotOf', () => {
  it('reports the snapshot directory for a release that finished fetching', () => {
    const directory = join(root, SOURCE_ROOT, 'dsh-v0.1.0-rc.7')
    mkdirSync(directory, { recursive: true })
    writeFileSync(`${directory}.fetched`, 'fetched\n')

    expect(localSnapshotOf(bare, root)).toBe(directory)
  })

  it('reports nothing for a half-fetched directory, which is not a snapshot', () => {
    mkdirSync(join(root, SOURCE_ROOT, 'dsh-v0.1.0-rc.7', '.git'), { recursive: true })

    expect(localSnapshotOf(bare, root)).toBeUndefined()
  })

  it('reports nothing when no source has been fetched', () => {
    expect(localSnapshotOf(bare, root)).toBeUndefined()
  })
})
