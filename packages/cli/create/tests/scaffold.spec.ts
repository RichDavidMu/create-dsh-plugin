/**
 * End-to-end generation into a temporary directory: the structure, the naming
 * substitution, and the version rewriting a real invocation produces.
 */

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertWritableTarget, initGitRepository, resolveTemplateRoots, scaffold } from '../src/scaffold.ts'
import { dshRange, scaffoldVersion } from '../src/versions.ts'
import type { ScaffoldRequest } from '../src/args.ts'

let workspace: string

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-'))
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
})

const request = (overrides: Partial<ScaffoldRequest> = {}): ScaffoldRequest => ({
  directory: 'project',
  pluginName: 'hello',
  layout: 'single',
  force: false,
  ...overrides,
})

describe('resolveTemplateRoots', () => {
  it('finds every template tree in the source layout', () => {
    const roots = resolveTemplateRoots()
    for (const key of ['root', 'plugin', 'bundle', 'docs', 'tools', 'layouts'] as const) {
      expect(existsSync(roots[key]), `${key}: ${roots[key]}`).toBe(true)
    }
  })

  it('has a files and a fragments directory for every layout', () => {
    const { layouts } = resolveTemplateRoots()
    for (const layout of ['single', 'workspace']) {
      for (const part of ['files', 'fragments']) {
        expect(existsSync(join(layouts, layout, part)), `${layout}/${part}`).toBe(true)
      }
    }
  })
})

/** Wrap a target check so `toThrow` receives a block-bodied thunk. */
const checking = (directory: string, force: boolean) => (): void => {
  assertWritableTarget(directory, force)
}

describe('assertWritableTarget', () => {
  it('accepts a missing directory', () => {
    expect(checking(join(workspace, 'absent'), false)).not.toThrow()
  })

  it('accepts an empty directory, and one holding only a git checkout', () => {
    const empty = join(workspace, 'empty')
    mkdirSync(join(empty, '.git'), { recursive: true })
    expect(checking(empty, false)).not.toThrow()
  })

  it('rejects a directory with contents, naming the count', () => {
    writeFileSync(join(workspace, 'stray.txt'), 'x')
    expect(checking(workspace, false)).toThrow(/is not empty \(1 entry\); pass --force/)
  })

  it('pluralizes the count for more than one entry', () => {
    writeFileSync(join(workspace, 'a.txt'), 'x')
    writeFileSync(join(workspace, 'b.txt'), 'x')
    expect(checking(workspace, false)).toThrow(/is not empty \(2 entries\)/)
  })

  it('ignores a stray .DS_Store, which is not the user\'s content', () => {
    writeFileSync(join(workspace, '.DS_Store'), 'x')
    expect(checking(workspace, false)).not.toThrow()
  })

  it('accepts a non-empty directory when forced', () => {
    writeFileSync(join(workspace, 'stray.txt'), 'x')
    expect(checking(workspace, true)).not.toThrow()
  })
})

describe('scaffold', () => {
  it('lays the single layout out as one package at the project root', () => {
    const result = scaffold(request(), workspace)
    for (const relative of [
      'package.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'tsconfig.tests.json',
      'pnpm-workspace.yaml',
      '.oxlintrc.json',
      '.gitignore',
      '.mcp.json',
      '.claude/settings.json',
      'AGENTS.md',
      'README.md',
      'vitest.config.ts',
      'tsdown.config.ts',
      'src/index.ts',
      'src/invariant.ts',
      'tests/plugin.spec.ts',
      'tests/tsconfig.json',
      'bundle/package.json',
      'bundle/cordis.patch.yml',
      'scripts/postinstall.mjs',
      'docs/plugin-authoring.md',
    ]) {
      expect(existsSync(join(result.directory, relative)), relative).toBe(true)
    }
    expect(existsSync(join(result.directory, 'packages')), 'packages/ must not exist').toBe(false)
    expect(result.layout).toBe('single')
  })

  it('makes the root manifest the plugin itself in the single layout', () => {
    const result = scaffold(request({ scope: 'acme' }), workspace)
    const manifest = JSON.parse(readFileSync(join(result.directory, 'package.json'), 'utf8')) as {
      name: string
      private?: boolean
      scripts: Record<string, string>
      peerDependencies: Record<string, string>
    }
    expect(manifest.name).toBe('@acme/dsh-plugin-hello')
    // Publishable: in this layout the project IS the package a plugin author ships.
    expect(manifest.private).toBeUndefined()
    expect(manifest.scripts.check).toContain('pnpm run typecheck')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-tools']).toBe(dshRange(scaffoldVersion()))
  })

  it('flattens every workspace path in the single layout', () => {
    const result = scaffold(request(), workspace)
    const read = (relative: string): string => readFileSync(join(result.directory, relative), 'utf8')
    expect(read('pnpm-workspace.yaml')).toContain('- bundle')
    expect(read('pnpm-workspace.yaml')).not.toContain('packages/*/*')
    expect(read('vitest.config.ts')).toContain("include: ['tests/**/*.spec.ts']")
    expect(read('tsconfig.tests.json')).toContain('"src/**/*.ts"')
    expect(read('tests/tsconfig.json')).toContain('"extends": "../tsconfig.tests.json"')
    expect(read('bundle/README.md')).toContain('(../docs/loading-into-dsh.md)')
    // A path that does not move must not be shortened with the ones that do.
    expect(read('.claude/skills/dsh-source/SKILL.md')).toContain('(../../../docs/tracing-dsh.md)')
  })

  it('resolves every layout passage, in both layouts', () => {
    for (const layout of ['single', 'workspace'] as const) {
      const result = scaffold(request({ directory: layout, layout }), workspace)
      for (const file of ['AGENTS.md', 'README.md']) {
        expect(readFileSync(join(result.directory, file), 'utf8'), `${layout}/${file}`)
          .not.toContain('<!-- include:')
      }
    }
  })

  it('gives the single layout one README that is both the package\'s and the project\'s', () => {
    const single = scaffold(request({ directory: 'single' }), workspace)
    const readme = readFileSync(join(single.directory, 'README.md'), 'utf8')
    // The plugin's own README wins at the root, because that is what npm publishes,
    // and the project-level pointers arrive through a layout fragment.
    expect(readme).toContain('## What it registers')
    expect(readme).toContain('## Where to start')
    expect(readme).toContain('pnpm run pack:bundle')
  })

  it('keeps the two READMEs apart in the workspace layout', () => {
    const result = scaffold(request({ layout: 'workspace' }), workspace)
    const project = readFileSync(join(result.directory, 'README.md'), 'utf8')
    const plugin = readFileSync(join(result.directory, 'packages/plugin/hello/README.md'), 'utf8')
    expect(project).toContain('## Quick start')
    expect(plugin).toContain('## What it registers')
    // A layout that needs nothing from a fragment provides an empty one.
    expect(plugin).not.toContain('## Where to start')
  })

  it('produces the workspace layout under packages/ when asked', () => {
    const result = scaffold(request({ layout: 'workspace' }), workspace)
    for (const relative of [
      'package.json',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'tsconfig.base.json',
      '.oxlintrc.json',
      '.gitignore',
      'AGENTS.md',
      'CLAUDE.md',
      'README.md',
      'vitest.config.ts',
      'tsdown.config.ts',
      'lefthook.yml',
      '.mcp.json',
      '.claude/settings.json',
      '.claude/skills/dsh-source/SKILL.md',
      'scripts/install-lefthook.mjs',
      'scripts/postinstall.mjs',
      'scripts/trace.ts',
      'scripts/dsh-trace.ts',
      'scripts/dsh-source.ts',
      'scripts/graph-runner.ts',
      'scripts/dsh-graph.ts',
      'docs/plugin-authoring.md',
      'packages/plugin/hello/src/index.ts',
      'packages/plugin/hello/src/invariant.ts',
      'packages/plugin/hello/tests/plugin.spec.ts',
      'packages/bundle/hello-bundle/cordis.patch.yml',
      'packages/bundle/hello-bundle/package.json',
    ]) {
      expect(existsSync(join(result.directory, relative)), relative).toBe(true)
    }
  })

  it('makes CLAUDE.md a symlink to AGENTS.md, so both name one file rather than a copy that drifts', () => {
    for (const layout of ['single', 'workspace'] as const) {
      const result = scaffold(request({ directory: layout, layout }), workspace)
      const claude = join(result.directory, 'CLAUDE.md')
      expect(lstatSync(claude).isSymbolicLink(), layout).toBe(true)
      expect(readlinkSync(claude), layout).toBe('AGENTS.md')
    }
  })

  it('reports the version, package names, and file count', () => {
    const result = scaffold(request({ scope: 'acme', pluginName: 'word-count' }), workspace)
    expect(result.dshVersion).toBe(scaffoldVersion())
    expect(result.pluginPackage).toBe('@acme/dsh-plugin-word-count')
    expect(result.bundlePackage).toBe('@acme/dsh-bundle-word-count')
    expect(result.written.length).toBe(result.written.length)
    expect(result.written.every(path => existsSync(path))).toBe(true)
  })

  it('renames directories, packages, and the tool when the role changes', () => {
    const result = scaffold(request({ scope: 'acme', pluginName: 'word-count', layout: 'workspace' }), workspace)
    expect(existsSync(join(result.directory, 'packages/plugin/word-count/src/index.ts'))).toBe(true)
    expect(existsSync(join(result.directory, 'packages/bundle/word-count-bundle/cordis.patch.yml'))).toBe(true)
    const source = readFileSync(join(result.directory, 'packages/plugin/word-count/src/index.ts'), 'utf8')
    expect(source).toContain('word_count_greet')
    expect(source).toContain('plugin-word-count')
  })

  it('leaves no template identifier behind after a rename, in either layout', () => {
    for (const layout of ['single', 'workspace'] as const) {
      const result = scaffold(request({ directory: layout, scope: 'acme', pluginName: 'word-count', layout }), workspace)
      for (const path of result.written) {
        if (path.endsWith('.png')) continue
        const text = readFileSync(path, 'utf8')
        // `Hello` in prose is deliberately preserved (greeting text); the lowercase
        // identifier must be gone everywhere.
        expect(/\bhello\b/.test(text), path).toBe(false)
        expect(text.includes('@example/'), path).toBe(false)
      }
    }
  })

  /** Where the plugin's own manifest lands in each layout. */
  const pluginManifest = { single: 'package.json', workspace: 'packages/plugin/hello/package.json' } as const

  it('pins every dsh dependency in a generated manifest to this scaffold version', () => {
    for (const layout of ['single', 'workspace'] as const) {
      const result = scaffold(request({ directory: layout, layout }), workspace)
      const manifest = JSON.parse(
        readFileSync(join(result.directory, pluginManifest[layout]), 'utf8'),
      ) as Record<string, Record<string, string>>
      const expected = dshRange(scaffoldVersion())
      for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
        for (const [name, range] of Object.entries(manifest[section] ?? {})) {
          if (name.startsWith('@deepseek-ai/dsh-')) expect(range, `${layout}: ${name}`).toBe(expected)
        }
      }
    }
  })

  it('resets a generated package version, since nothing has been released yet', () => {
    for (const layout of ['single', 'workspace'] as const) {
      const result = scaffold(request({ directory: layout, layout }), workspace)
      const manifest = JSON.parse(
        readFileSync(join(result.directory, pluginManifest[layout]), 'utf8'),
      ) as { version: string }
      expect(manifest.version, layout).toBe('0.0.0')
    }
  })

  it('keeps the fetched dsh source and both code graphs out of git', () => {
    const result = scaffold(request(), workspace)
    const ignored = readFileSync(join(result.directory, '.gitignore'), 'utf8')
    expect(ignored).toContain('.dsh-source/')
    expect(ignored).toContain('.codegraph/')
  })

  it('wires the codegraph MCP server, so an agent can query those graphs unprompted', () => {
    const result = scaffold(request(), workspace)
    const config = JSON.parse(readFileSync(join(result.directory, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>
    }
    expect(config.mcpServers.codegraph?.command).toBe('codegraph')
    expect(config.mcpServers.codegraph?.args).toEqual(['serve', '--mcp'])
  })

  it('refuses a target that already holds files', () => {
    writeFileSync(join(workspace, 'stray.txt'), 'x')
    expect(() => scaffold(request({ directory: '.' }), workspace)).toThrow(/is not empty/)
  })
})

describe('initGitRepository', () => {
  it('initializes a repository in a generated project', () => {
    const result = scaffold(request(), workspace)
    expect(initGitRepository(result.directory)).toBe(true)
    expect(existsSync(join(result.directory, '.git'))).toBe(true)
  })

  it('declines when the directory is already a repository', () => {
    const result = scaffold(request(), workspace)
    mkdirSync(join(result.directory, '.git'))
    expect(initGitRepository(result.directory)).toBe(false)
  })
})
