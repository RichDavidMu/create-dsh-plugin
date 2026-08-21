/**
 * Performing a graph plan: the order steps run in, what a failure stops, and what
 * marks a clone complete.
 */

import { describe, expect, it } from 'vitest'
import { snapshotFor, type GraphPlan } from '../src/dsh-source.ts'
import { quoteForShell, runGraph, type GraphIo } from '../src/graph-runner.ts'
import type { PackageTrace } from '../src/trace.ts'

/** A traced dsh package with the metadata a snapshot address needs. */
const traced: PackageTrace = {
  name: '@deepseek-ai/dsh-tools',
  version: '0.1.0-rc.7',
  directory: '/project/node_modules/@deepseek-ai/dsh-tools',
  declarations: [],
  readmes: [],
  repositoryUrl: 'git+https://github.com/deepseek-ai/deepseek-harness.git',
  packageDirectory: 'packages/core/tools',
}

/** What one run did, in order, without touching a network or a disk. */
interface Recorder {
  readonly io: GraphIo
  readonly commands: string[]
  readonly cleared: string[]
  readonly marked: string[]
  readonly said: string[]
  readonly warned: string[]
}

/**
 * An io that records every effect.
 * @param failOn - a command whose spawn reports failure, e.g. `git`.
 */
function recorder(failOn?: string): Recorder {
  const commands: string[] = []
  const cleared: string[] = []
  const marked: string[] = []
  const said: string[] = []
  const warned: string[] = []
  return {
    commands,
    cleared,
    marked,
    said,
    warned,
    io: {
      spawn: (command, argv) => {
        commands.push(`${command} ${argv.join(' ')}`)
        return command === failOn ? 'exited with 128' : undefined
      },
      clear: plan => void cleared.push(plan.snapshot.directory),
      markFetched: plan => void marked.push(plan.snapshot.marker),
      say: line => void said.push(line),
      warn: line => void warned.push(line),
    },
  }
}

/**
 * A plan over a project that has nothing yet: fetch, then both graphs.
 *
 * Written out rather than derived from `planGraph`, so this suite states the
 * runner's input directly and no filesystem answers for it.
 */
function freshPlan(): GraphPlan {
  const snapshot = snapshotFor(traced, '/project')
  return {
    snapshot,
    projectRoot: '/project',
    fetch: true,
    snapshotIndex: ['init', snapshot.directory],
    projectIndex: ['init', '/project'],
  }
}

/** The same project once its snapshot and graph are current: only a project sync is due. */
function syncOnlyPlan(): GraphPlan {
  const snapshot = snapshotFor(traced, '/project')
  return { snapshot, projectRoot: '/project', fetch: false, projectIndex: ['sync', '/project'] }
}

describe('runGraph', () => {
  it('clears, clones, marks the fetch complete, then indexes the snapshot and the project', () => {
    const { io, commands, cleared, marked } = recorder()
    const plan = freshPlan()

    expect(runGraph(plan, io)).toBe(true)
    expect(cleared).toEqual([plan.snapshot.directory])
    expect(commands).toEqual([
      `git ${['clone', '--depth', '1', '--single-branch', '--branch', plan.snapshot.tag,
        plan.snapshot.remote, plan.snapshot.directory].join(' ')}`,
      `codegraph init ${plan.snapshot.directory}`,
      'codegraph init /project',
    ])
    expect(marked).toEqual([plan.snapshot.marker])
  })

  it('marks the fetch complete only after the clone succeeds', () => {
    const { io, marked, warned } = recorder('git')

    expect(runGraph(freshPlan(), io)).toBe(false)
    expect(marked).toEqual([])
    expect(warned[0]).toMatch(/could not fetch dsh-v0\.1\.0-rc\.7: exited with 128\..*pnpm run dsh:graph/s)
  })

  it('indexes nothing when the fetch failed, since the tree is not there', () => {
    const { io, commands } = recorder('git')

    runGraph(freshPlan(), io)

    expect(commands).toEqual([expect.stringContaining('git clone')])
  })

  it('stops at the first index failure and says how to install the CLI', () => {
    const { io, commands, warned } = recorder('codegraph')
    const plan = freshPlan()

    expect(runGraph(plan, io)).toBe(false)
    expect(commands).toEqual([expect.stringContaining('git clone'), `codegraph init ${plan.snapshot.directory}`])
    expect(warned[0]).toMatch(/did not build a graph.*npm i -g @colbymchenry\/codegraph/s)
  })

  it('skips the fetch and the snapshot graph when only the project graph is due', () => {
    const { io, commands, cleared, marked } = recorder()

    expect(runGraph(syncOnlyPlan(), io)).toBe(true)
    expect(commands).toEqual(['codegraph sync /project'])
    expect(cleared).toEqual([])
    expect(marked).toEqual([])
  })

  it('narrates every step, because each one takes tens of seconds', () => {
    const { io, said } = recorder()

    runGraph(freshPlan(), io)

    expect(said).toEqual([
      expect.stringContaining('fetching dsh-v0.1.0-rc.7 source into'),
      expect.stringContaining('codegraph init'),
      'codegraph init /project',
    ])
  })
})

describe('quoteForShell', () => {
  it('quotes a path the shell would otherwise split', () => {
    expect(quoteForShell('C:\\Users\\Some Name\\plugin')).toBe('"C:\\Users\\Some Name\\plugin"')
  })

  it('leaves an argument with no whitespace alone', () => {
    expect(quoteForShell('--single-branch')).toBe('--single-branch')
  })
})
