/**
 * Generation orchestration: resolve the template roots, check the target, and
 * materialize a complete plugin monorepo.
 *
 * The generated layout mirrors deepseek-harness (`packages/<group>/<pkg>/`,
 * `tsconfig.base.json` plus per-package project references, one aggregate
 * solution) so a plugin developed there can be read, reviewed, and eventually
 * upstreamed without restructuring.
 * @module @rdmu/create-dsh-plugin/scaffold
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { materialize, materializeFiles, type Naming } from './copy.ts'
import { dshRange, scaffoldVersion } from './versions.ts'
import type { ScaffoldRequest } from './args.ts'

/** The template trees a generated project is assembled from. */
export interface TemplateRoots {
  /** Repository-root files: manifests, tsconfig, lint, test, and build configuration. */
  readonly root: string
  /** The example plugin package. */
  readonly plugin: string
  /** The bundle package that patches the plugin into a dsh profile. */
  readonly bundle: string
  /** Authoring documentation copied into the generated project. */
  readonly docs: string
  /** Directory holding `trace.ts` and `trace-bin.ts`, copied in as the project's own tool. */
  readonly tools: string
}

/**
 * Locate the template trees in both the source and published layouts.
 *
 * A source checkout keeps the plugin template as a real workspace package so this
 * repository's own typecheck, lint, and tests cover the code it hands out; a
 * published tarball carries the trees collapsed under `template/` by this
 * package's `prepack`.
 *
 * The SOURCE layout is probed first, and probed on `templates/` — a directory that
 * exists only in a checkout, never inside the published package. Probing the
 * published layout first would make a stale `prepack` artifact left in a checkout
 * silently shadow the sources the tests believe they exercise.
 *
 * Failing loud beats generating a project from a half-present template.
 * @returns absolute paths of the template trees.
 * @throws Error when neither layout is present.
 */
export function resolveTemplateRoots(): TemplateRoots {
  const packageRoot = fileURLToPath(new URL('..', import.meta.url))
  const repoRoot = resolve(packageRoot, '..', '..', '..')
  const sourceRoot = join(repoRoot, 'templates', 'root')
  /* v8 ignore next 2 -- the false side is the published layout, which only a packed tarball reaches. */
  if (existsSync(sourceRoot)) {
    return {
      root: sourceRoot,
      plugin: join(repoRoot, 'packages', 'example', 'plugin-hello'),
      bundle: join(repoRoot, 'templates', 'bundle'),
      docs: join(repoRoot, 'docs'),
      tools: join(packageRoot, 'src'),
    }
  }
  /* v8 ignore next 2 -- in a checkout the source layout always wins above; `pnpm run scaffold:smoke` is what
     exercises the published path. */
  return publishedTemplateRoots(packageRoot)
}

/* v8 ignore start -- this layout exists only inside a packed tarball, which this repository's tests never
   run from; `pnpm run scaffold:smoke` covers it against a real `npm pack`. */
/**
 * Resolve the template trees inside a published package.
 * @param packageRoot - absolute directory of the installed package.
 * @returns absolute paths of the template trees.
 * @throws Error when the package carries no template tree.
 */
function publishedTemplateRoots(packageRoot: string): TemplateRoots {
  const published = join(packageRoot, 'template')
  if (existsSync(join(published, 'root'))) {
    return {
      root: join(published, 'root'),
      plugin: join(published, 'plugin-hello'),
      bundle: join(published, 'bundle'),
      docs: join(packageRoot, 'docs'),
      tools: join(published, 'tools'),
    }
  }
  throw new Error(
    `create-dsh-plugin: no template tree found at ${published}; the installation is incomplete`,
  )
}
/* v8 ignore stop */

/** What one completed generation produced. */
export interface ScaffoldResult {
  /** Absolute path of the generated project. */
  readonly directory: string
  /** The dsh version the generated project depends on. */
  readonly dshVersion: string
  /** The generated plugin's package name. */
  readonly pluginPackage: string
  /** The generated bundle's package name. */
  readonly bundlePackage: string
  /** Absolute paths written, in traversal order. */
  readonly written: readonly string[]
}

/**
 * Reject a target directory that already holds files, unless forced.
 *
 * Missing and empty directories are both fine: `pnpm create` is commonly run
 * against a freshly made directory.
 * @param directory - the absolute target directory.
 * @param force - whether a non-empty directory is acceptable.
 * @throws Error when the directory has contents and `force` is false.
 */
export function assertWritableTarget(directory: string, force: boolean): void {
  if (force || !existsSync(directory)) return
  const entries = readdirSync(directory).filter(entry => entry !== '.git' && entry !== '.DS_Store')
  if (entries.length > 0) {
    throw new Error(
      `create-dsh-plugin: ${directory} is not empty (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}); pass --force to write into it anyway`,
    )
  }
}

/**
 * Initialize a git repository in a generated project, best effort.
 *
 * A plugin project wants version control from its first commit, and the
 * generated lefthook hooks have nothing to attach to without it. Failure is not
 * fatal: git may be absent, or the directory may already sit inside another
 * repository, and neither should turn a successful generation into an error.
 * @param directory - the generated project directory.
 * @returns whether a repository was initialized.
 */
export function initGitRepository(directory: string): boolean {
  if (existsSync(join(directory, '.git'))) return false
  const result = spawnSync('git', ['init', '--quiet'], { cwd: directory, stdio: 'ignore' })
  /* v8 ignore next 2 -- reaching the false side needs git absent from PATH or refusing to init; generation
     still succeeded, and the caller reports the outcome either way. */
  return result.error === undefined && result.status === 0
}

/**
 * Generate one plugin project.
 * @param request - the parsed command line request.
 * @param cwd - the directory `request.directory` resolves against; defaults to the process cwd.
 * @returns what was produced, for the caller to report.
 * @throws Error when the target is not writable or the template tree is missing.
 */
export function scaffold(request: ScaffoldRequest, cwd: string = process.cwd()): ScaffoldResult {
  const directory = resolve(cwd, request.directory)
  assertWritableTarget(directory, request.force)
  const roots = resolveTemplateRoots()
  const version = scaffoldVersion()
  const range = dshRange(version)
  const naming: Naming = {
    role: request.pluginName,
    scopePrefix: request.scope === undefined ? '' : `@${request.scope}/`,
  }

  const written = [
    ...materialize(roots.root, directory, naming, range),
    ...materialize(roots.plugin, join(directory, 'packages', 'plugin', naming.role), naming, range),
    ...materialize(roots.bundle, join(directory, 'packages', 'bundle', `${naming.role}-bundle`), naming, range),
    ...materialize(roots.docs, join(directory, 'docs'), naming, range),
    // The dependency-tracing tool travels as the project's own source, so a
    // generated project can inspect its dsh dependencies with nothing installed
    // beyond what it already declares. `trace-bin.ts` imports `./trace.ts`, so
    // both land in one directory and the relative import still resolves.
    ...materializeFiles(roots.tools, join(directory, 'scripts'), ['trace.ts', 'dsh-trace.ts'], naming),
  ]

  return {
    directory,
    dshVersion: version,
    pluginPackage: `${naming.scopePrefix}dsh-plugin-${request.pluginName}`,
    bundlePackage: `${naming.scopePrefix}dsh-bundle-${request.pluginName}`,
    written,
  }
}
