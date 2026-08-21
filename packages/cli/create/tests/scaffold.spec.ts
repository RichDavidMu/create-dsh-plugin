/**
 * End-to-end generation into a temporary directory: the structure, the naming
 * substitution, and the version rewriting a real invocation produces.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  force: false,
  ...overrides,
})

describe('resolveTemplateRoots', () => {
  it('finds every template tree in the source layout', () => {
    const roots = resolveTemplateRoots()
    for (const key of ['root', 'plugin', 'bundle', 'docs', 'tools'] as const) {
      expect(existsSync(roots[key]), `${key}: ${roots[key]}`).toBe(true)
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
  it('produces the expected layout under the template name', () => {
    const result = scaffold(request(), workspace)
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
      'scripts/install-lefthook.mjs',
      'scripts/trace.ts',
      'scripts/dsh-trace.ts',
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

  it('reports the version, package names, and file count', () => {
    const result = scaffold(request({ scope: 'acme', pluginName: 'word-count' }), workspace)
    expect(result.dshVersion).toBe(scaffoldVersion())
    expect(result.pluginPackage).toBe('@acme/dsh-plugin-word-count')
    expect(result.bundlePackage).toBe('@acme/dsh-bundle-word-count')
    expect(result.written.length).toBe(result.written.length)
    expect(result.written.every(path => existsSync(path))).toBe(true)
  })

  it('renames directories, packages, and the tool when the role changes', () => {
    const result = scaffold(request({ scope: 'acme', pluginName: 'word-count' }), workspace)
    expect(existsSync(join(result.directory, 'packages/plugin/word-count/src/index.ts'))).toBe(true)
    expect(existsSync(join(result.directory, 'packages/bundle/word-count-bundle/cordis.patch.yml'))).toBe(true)
    const source = readFileSync(join(result.directory, 'packages/plugin/word-count/src/index.ts'), 'utf8')
    expect(source).toContain('word_count_greet')
    expect(source).toContain('plugin-word-count')
  })

  it('leaves no template identifier behind after a rename', () => {
    const result = scaffold(request({ scope: 'acme', pluginName: 'word-count' }), workspace)
    for (const path of result.written) {
      if (path.endsWith('.png')) continue
      const text = readFileSync(path, 'utf8')
      // `Hello` in prose is deliberately preserved (greeting text); the lowercase
      // identifier must be gone everywhere.
      expect(/\bhello\b/.test(text), path).toBe(false)
      expect(text.includes('@example/'), path).toBe(false)
    }
  })

  it('pins every dsh dependency in a generated manifest to this scaffold version', () => {
    const result = scaffold(request(), workspace)
    const manifest = JSON.parse(
      readFileSync(join(result.directory, 'packages/plugin/hello/package.json'), 'utf8'),
    ) as Record<string, Record<string, string>>
    const expected = dshRange(scaffoldVersion())
    for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
      for (const [name, range] of Object.entries(manifest[section] ?? {})) {
        if (name.startsWith('@deepseek-ai/dsh-')) expect(range, name).toBe(expected)
      }
    }
  })

  it('resets a generated package version, since nothing has been released yet', () => {
    const result = scaffold(request(), workspace)
    const manifest = JSON.parse(
      readFileSync(join(result.directory, 'packages/plugin/hello/package.json'), 'utf8'),
    ) as { version: string }
    expect(manifest.version).toBe('0.0.0')
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
