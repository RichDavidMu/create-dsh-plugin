/**
 * Naming substitution and manifest rewriting — the mechanisms that turn the
 * checked-in template into a named project.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  layoutRewrites,
  resolveIncludes,
  rewriteManifest,
  snakeCase,
  substitute,
  targetName,
  TEMPLATE_ROLE,
  TEMPLATE_SCOPE,
  TEMPLATE_TOOL,
  type Naming,
} from '../src/copy.ts'

const renamed: Naming = { role: 'word-count', scopePrefix: '@acme/', layout: 'workspace' }
const unscoped: Naming = { role: 'word-count', scopePrefix: '', layout: 'workspace' }
const unchanged: Naming = { role: TEMPLATE_ROLE, scopePrefix: TEMPLATE_SCOPE, layout: 'workspace' }
const flat: Naming = { role: 'word-count', scopePrefix: '@acme/', layout: 'single' }

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
    expect(substitute('@example/dsh-plugin-hello', { role: TEMPLATE_ROLE, scopePrefix: '@acme/', layout: 'workspace' }))
      .toBe('@acme/dsh-plugin-hello')
  })

  it('is a no-op when nothing was renamed', () => {
    const text = `${TEMPLATE_SCOPE}dsh-plugin-${TEMPLATE_ROLE} registers ${TEMPLATE_TOOL}`
    expect(substitute(text, unchanged)).toBe(text)
  })
})

describe('substitute in the single layout', () => {
  it('flattens the plugin package path away, since the plugin becomes the project', () => {
    expect(substitute('./packages/plugin/hello/src/index.ts', flat)).toBe('./src/index.ts')
    expect(substitute('packages/plugin/hello', flat)).toBe('.')
  })

  it('moves the bundle to a top-level directory', () => {
    expect(substitute('packages/bundle/hello-bundle/cordis.patch.yml', flat)).toBe('bundle/cordis.patch.yml')
    expect(substitute('pnpm --filter ./packages/bundle/hello-bundle pack', flat)).toBe('pnpm --filter ./bundle pack')
  })

  it('anchors workspace globs at the project root', () => {
    expect(substitute('packages/*/*/tests/**/*.spec.ts', flat)).toBe('tests/**/*.spec.ts')
    expect(substitute('packages/*/*/src/types.ts', flat)).toBe('src/types.ts')
    expect(substitute("workspace: ['packages/*/*']", flat)).toBe("workspace: ['.']")
  })

  it('turns the workspace member list into the bundle alone, not into the root glob', () => {
    expect(substitute('packages:\n  - packages/*/*\n', flat)).toBe('packages:\n  - bundle\n')
  })

  it('shortens the relative climb of the files that move, and only those', () => {
    expect(substitute('"extends": "../../../../tsconfig.tests.json"', flat))
      .toBe('"extends": "../tsconfig.tests.json"')
    expect(substitute('[loading](../../../docs/loading-into-dsh.md)', flat))
      .toBe('[loading](../docs/loading-into-dsh.md)')
    // `.claude/skills/dsh-source/` sits at the same depth in both layouts, so its
    // link three levels up must survive untouched.
    expect(substitute('[tracing](../../../docs/tracing-dsh.md)', flat))
      .toBe('[tracing](../../../docs/tracing-dsh.md)')
  })

  it('leaves every path alone in the workspace layout', () => {
    expect(substitute('packages/*/*/src/**/*.ts', renamed)).toBe('packages/*/*/src/**/*.ts')
    expect(substitute('packages/plugin/hello', renamed)).toBe('packages/plugin/word-count')
  })
})

describe('layoutRewrites', () => {
  it('puts the member list first, so the path rules cannot claim its glob', () => {
    const [first] = layoutRewrites(flat)
    expect(first?.[0]).toContain('packages:')
  })

  it('rewrites the role\'s own paths rather than the template\'s', () => {
    const froms = layoutRewrites(flat).map(([from]) => from)
    expect(froms).toContain('packages/plugin/word-count')
    expect(froms).not.toContain('packages/plugin/hello')
  })
})

describe('resolveIncludes', () => {
  it('replaces a marker line with its fragment, without the trailing newline', () => {
    const fragments = mkdtempSync(join(tmpdir(), 'fragments-'))
    try {
      writeFileSync(join(fragments, 'layout.md'), 'one\ntwo\n')
      expect(resolveIncludes('before\n<!-- include: layout.md -->\nafter\n', fragments))
        .toBe('before\none\ntwo\nafter\n')
    } finally {
      rmSync(fragments, { recursive: true, force: true })
    }
  })

  it('leaves text with no marker untouched', () => {
    expect(resolveIncludes('nothing to include\n', '/nowhere')).toBe('nothing to include\n')
  })

  it('fails loudly, naming the fragment the layout does not provide', () => {
    expect(() => resolveIncludes('<!-- include: absent.md -->\n', '/nowhere'))
      .toThrow(/asks for include absent\.md, which \/nowhere does not provide/)
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
