/**
 * Trace a `@deepseek-ai/dsh-*` dependency back to its authoritative sources.
 *
 * A plugin author should not have to clone deepseek-harness to answer "what
 * exactly does this service promise". Three routes exist from an installed
 * release, in decreasing immediacy:
 *
 * 1. **Emitted declarations** (`lib/types/*.d.ts`) — the published tarball keeps
 *    every JSDoc block, including `@mode` on events and `@param`/`@returns` on
 *    service methods. This is the contract itself, on disk, greppable.
 * 2. **Package README** — the dsh convention puts each package's role, config,
 *    and Model Experience (token and KV-cache effects) here; the tarball ships
 *    it in English and Chinese.
 * 3. **Upstream source** — `repository.url` plus `repository.directory` and the
 *    release tag address the exact directory the release was cut from.
 *
 * The published tarball does NOT contain `src/`, despite `exports` declaring a
 * `./src/*` subpath: that entry serves workspace consumers inside
 * deepseek-harness. Route 3 is how you reach source.
 * @module @rdmu/create-dsh-plugin/trace
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Git tag format deepseek-harness publishes releases under, e.g. `dsh-v0.1.0-rc.7`. */
const TAG_PREFIX = 'dsh-v'

/** Where one installed dsh package's contract can be read. */
export interface PackageTrace {
  /** The package name as requested. */
  readonly name: string
  /** Installed version from the resolved manifest. */
  readonly version: string
  /** Absolute directory of the installed package. */
  readonly directory: string
  /** Absolute paths of emitted declaration files, the on-disk contract. */
  readonly declarations: readonly string[]
  /** Absolute paths of shipped README files. */
  readonly readmes: readonly string[]
  /** Upstream source URL for this exact release, when the manifest carries repository metadata. */
  readonly sourceUrl?: string
}

/**
 * Build the upstream source URL for one release of one package.
 * @param repositoryUrl - the manifest's `repository.url` (any git+https form).
 * @param directory - the manifest's `repository.directory`, the package's path in the monorepo.
 * @param version - the installed version, mapped to its release tag.
 * @returns a browsable tree URL, or `undefined` when the URL is not a GitHub remote.
 */
export function sourceUrlFor(repositoryUrl: string, directory: string, version: string): string | undefined {
  const match = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(repositoryUrl)
  if (match === null) return undefined
  const [, owner, repo] = match
  return `https://github.com/${owner}/${repo}/tree/${TAG_PREFIX}${version}/${directory}`
}

/** Collect `.d.ts` files under one directory, one level deep, sorted. */
function declarationsIn(directory: string): string[] {
  const typesDir = join(directory, 'lib', 'types')
  if (!existsSync(typesDir)) return []
  return readdirSync(typesDir)
    .filter(entry => entry.endsWith('.d.ts'))
    .sort()
    .map(entry => join(typesDir, entry))
}

/**
 * Resolve one installed dsh package and report where its contract can be read.
 * @param name - the package name, e.g. `@deepseek-ai/dsh-tools`.
 * @param from - a file or directory to resolve from; defaults to the current working directory.
 * @returns the trace record.
 * @throws Error when the package is not installed and resolvable from `from`.
 */
export function tracePackage(name: string, from: string = process.cwd()): PackageTrace {
  const require = createRequire(join(from, 'noop.js'))
  let manifestPath: string
  try {
    manifestPath = require.resolve(`${name}/package.json`)
  } catch {
    throw new Error(
      `create-dsh-plugin: cannot resolve ${name} from ${from}; install it first (pnpm add ${name})`,
    )
  }
  const directory = dirname(manifestPath)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version?: string
    repository?: { url?: string; directory?: string }
  }
  const version = manifest.version ?? '0.0.0'
  const repositoryUrl = manifest.repository?.url
  const repositoryDir = manifest.repository?.directory
  const sourceUrl = repositoryUrl !== undefined && repositoryDir !== undefined
    ? sourceUrlFor(repositoryUrl, repositoryDir, version)
    : undefined
  return {
    name,
    version,
    directory,
    declarations: declarationsIn(directory),
    readmes: ['README.md', 'README.zh.md'].map(file => join(directory, file)).filter(existsSync),
    ...sourceUrl !== undefined ? { sourceUrl } : {},
  }
}

/**
 * Render a trace as the human-facing report the `dsh-trace` bin prints.
 * @param trace - the record from {@link tracePackage}.
 * @returns the report text, without a trailing newline.
 */
export function formatTrace(trace: PackageTrace): string {
  const lines = [`${trace.name}@${trace.version}`, `  installed at   ${trace.directory}`]
  if (trace.declarations.length > 0) {
    lines.push(`  contract       ${trace.declarations.length} declaration file(s) — the JSDoc here IS the contract:`)
    for (const file of trace.declarations) lines.push(`                 ${file}`)
  } else {
    lines.push('  contract       no lib/types/*.d.ts found (not a built dsh release?)')
  }
  for (const readme of trace.readmes) lines.push(`  README         ${readme}`)
  if (trace.sourceUrl !== undefined) lines.push(`  source         ${trace.sourceUrl}`)
  return lines.join('\n')
}
