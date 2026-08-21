/**
 * Naming substitution and manifest rewriting — the mechanisms that turn the
 * checked-in template into a named project.
 */

import { describe, expect, it } from 'vitest'
import {
  rewriteManifest,
  snakeCase,
  substitute,
  targetName,
  TEMPLATE_ROLE,
  TEMPLATE_SCOPE,
  TEMPLATE_TOOL,
  type Naming,
} from '../src/copy.ts'

const renamed: Naming = { role: 'word-count', scopePrefix: '@acme/' }
const unscoped: Naming = { role: 'word-count', scopePrefix: '' }
const unchanged: Naming = { role: TEMPLATE_ROLE, scopePrefix: TEMPLATE_SCOPE }

describe('snakeCase', () => {
  it('converts kebab to snake and leaves a single word alone', () => {
    expect(snakeCase('word-count')).toBe('word_count')
    expect(snakeCase('hello')).toBe('hello')
    expect(snakeCase('a-b-c')).toBe('a_b_c')
  })
})

describe('substitute', () => {
  it('rewrites the scope prefix', () => {
    expect(substitute('@example/dsh-plugin-hello', renamed)).toBe('@acme/dsh-plugin-word-count')
    expect(substitute('@example/dsh-plugin-hello', unscoped)).toBe('dsh-plugin-word-count')
  })

  it('rewrites the tool name to snake_case before the bare role', () => {
    expect(substitute('tool:hello_greet', renamed)).toBe('tool:word_count_greet')
  })

  it('leaves capitalized prose alone so greeting text survives', () => {
    expect(substitute('Hello, {name}!', renamed)).toBe('Hello, {name}!')
  })

  it('does not touch a longer identifier that merely contains the role', () => {
    expect(substitute('helloworld othello', renamed)).toBe('helloworld othello')
  })

  it('applies scope substitution even when the role is unchanged', () => {
    expect(substitute('@example/dsh-plugin-hello', { role: TEMPLATE_ROLE, scopePrefix: '@acme/' }))
      .toBe('@acme/dsh-plugin-hello')
  })

  it('is a no-op when nothing was renamed', () => {
    const text = `${TEMPLATE_SCOPE}dsh-plugin-${TEMPLATE_ROLE} registers ${TEMPLATE_TOOL}`
    expect(substitute(text, unchanged)).toBe(text)
  })
})

describe('targetName', () => {
  it('strips a double underscore', () => {
    expect(targetName('__package.json')).toBe('package.json')
    expect(targetName('__CLAUDE.md')).toBe('CLAUDE.md')
  })

  it('turns a single underscore into a leading dot', () => {
    expect(targetName('_gitignore')).toBe('.gitignore')
    expect(targetName('_oxlintrc.json')).toBe('.oxlintrc.json')
  })

  it('passes an ordinary name through', () => {
    expect(targetName('README.md')).toBe('README.md')
  })
})

describe('rewriteManifest', () => {
  const template = JSON.stringify({
    name: '@example/dsh-plugin-hello',
    version: '0.1.0-rc.7',
    dependencies: { '@deepseek-ai/schemastery': '^3.18.1' },
    peerDependencies: { '@deepseek-ai/dsh-tools': '^0.1.0-rc.7', '@deepseek-ai/cordis': '^4.0.1' },
    scripts: { build: 'tsdown' },
  })

  it('renames the package and resets its version', () => {
    const parsed = JSON.parse(rewriteManifest(template, renamed, '^9.9.9')) as Record<string, unknown>
    expect(parsed.name).toBe('@acme/dsh-plugin-word-count')
    expect(parsed.version).toBe('0.0.0')
  })

  it('rewrites every dsh range and leaves other dependencies alone', () => {
    const parsed = JSON.parse(rewriteManifest(template, renamed, '^9.9.9')) as {
      dependencies: Record<string, string>
      peerDependencies: Record<string, string>
    }
    expect(parsed.peerDependencies['@deepseek-ai/dsh-tools']).toBe('^9.9.9')
    expect(parsed.peerDependencies['@deepseek-ai/cordis']).toBe('^4.0.1')
    expect(parsed.dependencies['@deepseek-ai/schemastery']).toBe('^3.18.1')
  })

  it('tolerates a manifest with no dependency sections', () => {
    const output = rewriteManifest(JSON.stringify({ name: 'x', private: true }), renamed, '^9.9.9')
    expect(JSON.parse(output)).toEqual({ name: 'x', private: true, version: '0.0.0' })
  })

  it('ends with exactly one newline', () => {
    expect(rewriteManifest(template, renamed, '^9.9.9').endsWith('}\n')).toBe(true)
  })
})
