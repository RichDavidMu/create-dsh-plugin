/**
 * Source tracing: the URL construction and the report a project uses to reach a
 * dsh package's contract.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatTrace, sourceUrlFor, tracePackage } from '../src/trace.ts'

describe('sourceUrlFor', () => {
  it('builds a tree URL at the release tag from git+https metadata', () => {
    expect(sourceUrlFor(
      'git+https://github.com/deepseek-ai/deepseek-harness.git',
      'packages/core/tools',
      '0.1.0-rc.7',
    )).toBe('https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.7/packages/core/tools')
  })

  it('accepts an ssh remote', () => {
    expect(sourceUrlFor('git@github.com:deepseek-ai/deepseek-harness.git', 'packages/llm/llm', '1.0.0'))
      .toBe('https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v1.0.0/packages/llm/llm')
  })

  it('declines a non-GitHub remote rather than guessing a URL layout', () => {
    expect(sourceUrlFor('https://gitlab.com/a/b.git', 'packages/x', '1.0.0')).toBeUndefined()
  })
})

describe('tracePackage', () => {
  it('locates an installed dsh package and every route to its contract', () => {
    const trace = tracePackage('@deepseek-ai/dsh-tools')
    expect(trace.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(trace.directory).toContain('dsh-tools')
    expect(trace.declarations.some(path => path.endsWith('index.d.ts'))).toBe(true)
    expect(trace.readmes.some(path => path.endsWith('README.md'))).toBe(true)
    expect(trace.sourceUrl).toContain('github.com/deepseek-ai/deepseek-harness/tree/dsh-v')
  })

  it('fails with an actionable message for a package that is not installed', () => {
    expect(() => tracePackage('@deepseek-ai/dsh-not-a-real-package'))
      .toThrow(/cannot resolve .* install it first/)
  })

  it('reports what is absent rather than inventing it', () => {
    // A package with no version, no repository metadata, no lib/types, and no
    // README: every optional route must degrade rather than throw.
    const root = mkdtempSync(join(tmpdir(), 'trace-bare-'))
    const dir = join(root, 'node_modules', 'bare-pkg')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bare-pkg' }))
    try {
      const trace = tracePackage('bare-pkg', root)
      expect(trace.version).toBe('0.0.0')
      expect(trace.declarations).toEqual([])
      expect(trace.readmes).toEqual([])
      expect(trace.sourceUrl).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('omits the source URL when repository metadata is incomplete', () => {
    const root = mkdtempSync(join(tmpdir(), 'trace-partial-'))
    const dir = join(root, 'node_modules', 'partial-pkg')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'partial-pkg',
      version: '1.0.0',
      repository: { url: 'git+https://github.com/a/b.git' },
    }))
    try {
      expect(tracePackage('partial-pkg', root).sourceUrl).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('formatTrace', () => {
  it('reports the install path, each declaration, the README, and the source URL', () => {
    const report = formatTrace(tracePackage('@deepseek-ai/dsh-tools'))
    expect(report).toMatch(/^@deepseek-ai\/dsh-tools@/)
    expect(report).toContain('installed at')
    expect(report).toContain('the JSDoc here IS the contract')
    expect(report).toContain('README')
    expect(report).toContain('source         https://github.com/')
  })

  it('says so when a package ships no declarations', () => {
    const report = formatTrace({
      name: 'x', version: '1.0.0', directory: '/tmp/x', declarations: [], readmes: [],
    })
    expect(report).toContain('no lib/types/*.d.ts found')
  })
})
