/**
 * The version contract: this scaffold's own version is the dsh version generated
 * projects depend on, so the two must never be able to drift.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dshRange, FRAMEWORK_VERSIONS, NODE_ENGINES, PACKAGE_MANAGER, scaffoldVersion, TOOLCHAIN_VERSIONS } from '../src/versions.ts'

const repoRoot = new URL('../../../../', import.meta.url)

/** Read one JSON file from the repository. */
function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, repoRoot)), 'utf8')) as Record<string, unknown>
}

describe('scaffoldVersion', () => {
  it('reports this package\'s own version', () => {
    const manifest = readJson('packages/cli/create/package.json')
    expect(scaffoldVersion()).toBe(manifest.version)
  })

  it('matches the repository root version, so a release bumps one number', () => {
    expect(scaffoldVersion()).toBe(readJson('package.json').version)
  })

  it('matches the example plugin\'s version, which is the template a project starts from', () => {
    expect(scaffoldVersion()).toBe(readJson('packages/example/plugin-hello/package.json').version)
  })
})

describe('dshRange', () => {
  it('pins exactly, so a scaffold release cannot install an untested dsh', () => {
    expect(dshRange('0.1.0-rc.7')).toBe('0.1.0-rc.7')
  })
})

describe('template dependency alignment', () => {
  it('pins every example-plugin dsh dependency to this scaffold\'s version', () => {
    const manifest = readJson('packages/example/plugin-hello/package.json')
    const expected = dshRange(scaffoldVersion())
    for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
      const deps = (manifest[section] ?? {}) as Record<string, string>
      for (const [name, range] of Object.entries(deps)) {
        if (name.startsWith('@deepseek-ai/dsh-')) expect(range, name).toBe(expected)
      }
    }
  })

  it('keeps every template manifest at 0.0.0 with dsh pinned to this scaffold', () => {
    // `rewriteManifest` resets the version and rewrites the dsh ranges at generation
    // time, so neither value reaches a generated project as written here. They still
    // have to be honest for whoever reads the template: 0.0.0 is what a fresh
    // project starts at, and the pins say which dsh this template was written for.
    const expected = dshRange(scaffoldVersion())
    for (const relative of [
      'templates/bundle/__package.json',
      'templates/layout/single/files/__package.json',
      'templates/layout/workspace/files/__package.json',
    ]) {
      const manifest = readJson(relative)
      expect(manifest.version, relative).toBe('0.0.0')
      for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
        const deps = (manifest[section] ?? {}) as Record<string, string>
        for (const [name, range] of Object.entries(deps)) {
          if (name.startsWith('@deepseek-ai/dsh-')) expect(range, `${relative}: ${name}`).toBe(expected)
        }
      }
    }
  })

  it('declares the framework ranges the example plugin actually uses', () => {
    const manifest = readJson('packages/example/plugin-hello/package.json')
    const deps = {
      ...(manifest.dependencies ?? {}) as Record<string, string>,
      ...(manifest.peerDependencies ?? {}) as Record<string, string>,
    }
    for (const [name, range] of Object.entries(FRAMEWORK_VERSIONS)) {
      if (deps[name] !== undefined) expect(deps[name], name).toBe(range)
    }
  })
})

describe('generated-project constants', () => {
  it('states the engines range and package manager the root manifest uses', () => {
    const root = readJson('package.json')
    expect(NODE_ENGINES).toBe((root.engines as Record<string, string>).node)
    expect(PACKAGE_MANAGER).toBe(root.packageManager)
  })

  it('lists toolchain ranges matching the root devDependencies', () => {
    const devDeps = readJson('package.json').devDependencies as Record<string, string>
    for (const [name, range] of Object.entries(TOOLCHAIN_VERSIONS)) {
      expect(devDeps[name], name).toBe(range)
    }
  })
})
