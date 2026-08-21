/**
 * Argument validation. `parseArgs` itself exits the process on a usage error
 * (Commander's contract), so the value rules are tested through the validators
 * it delegates to, and `parseArgs` is covered on its accepting paths.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { parseArgs, validatePluginName, validateScope } from '../src/args.ts'

describe('validatePluginName', () => {
  it('accepts a single word and kebab-case', () => {
    expect(validatePluginName('hello')).toBe('hello')
    expect(validatePluginName('word-count')).toBe('word-count')
    expect(validatePluginName('a1-b2')).toBe('a1-b2')
  })

  it('rejects anything a package name, tool name, and directory cannot all take', () => {
    for (const bad of ['Hello', 'word_count', '-lead', 'trail-', 'two--dashes', '1start', 'a b', '']) {
      expect(() => validatePluginName(bad), bad).toThrow(/lowercase kebab-case/)
    }
  })
})

describe('validateScope', () => {
  it('accepts a scope with or without the leading @, returning it bare', () => {
    expect(validateScope('@acme')).toBe('acme')
    expect(validateScope('acme')).toBe('acme')
    expect(validateScope('@my-org')).toBe('my-org')
  })

  it('rejects an invalid scope segment', () => {
    for (const bad of ['@Acme', '@a/b', '@', '']) {
      expect(() => validateScope(bad), bad).toThrow(/lowercase kebab-case/)
    }
  })
})

describe('parseArgs', () => {
  it('defaults the plugin name and leaves the scope absent', () => {
    expect(parseArgs(['my-project'], '0.0.0')).toEqual({
      directory: 'my-project',
      pluginName: 'hello',
      force: false,
    })
  })

  it('carries the scope, role, and force flag', () => {
    expect(parseArgs(['my-project', '--scope', '@acme', '--plugin', 'word-count', '--force'], '0.0.0')).toEqual({
      directory: 'my-project',
      pluginName: 'word-count',
      scope: 'acme',
      force: true,
    })
  })

  it('takes no dsh-version flag: the release decides that', () => {
    // Commander would exit on an unknown option, so assert the absence by
    // confirming the resolved request has no version field to carry one.
    expect(Object.keys(parseArgs(['p'], '0.0.0'))).not.toContain('dshVersion')
  })
})

describe('parseArgs usage errors', () => {
  // Commander's contract is to print and exit; replace `process.exit` with a
  // throw so the exit path is observable instead of killing the test worker.
  let exit: MockInstance<typeof process.exit>
  let stderr: MockInstance<typeof process.stderr.write>

  beforeEach(() => {
    exit = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`exit:${String(code)}`)
    })
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    exit.mockRestore()
    stderr.mockRestore()
  })

  it('exits when the directory is missing', () => {
    expect(() => parseArgs([], '0.0.0')).toThrow(/^exit:/)
  })

  it('exits when the directory is blank', () => {
    expect(() => parseArgs(['   '], '0.0.0')).toThrow(/^exit:/)
    expect(stderr.mock.calls.flat().join('')).toMatch(/must not be blank/)
  })

  it('exits on an invalid plugin name, naming the rule', () => {
    expect(() => parseArgs(['p', '--plugin', 'Bad_Name'], '0.0.0')).toThrow(/^exit:/)
    expect(stderr.mock.calls.flat().join('')).toMatch(/lowercase kebab-case/)
  })

  it('exits on an invalid scope, naming the rule', () => {
    expect(() => parseArgs(['p', '--scope', '@Bad'], '0.0.0')).toThrow(/^exit:/)
    expect(stderr.mock.calls.flat().join('')).toMatch(/lowercase kebab-case/)
  })

  it('exits on an unknown option rather than ignoring it', () => {
    expect(() => parseArgs(['p', '--dsh-version', '1.2.3'], '0.0.0')).toThrow(/^exit:/)
  })
})
