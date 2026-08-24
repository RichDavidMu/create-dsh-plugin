/**
 * Commander adapter for the `create-dsh-plugin` command line.
 *
 * Deliberately absent: any flag selecting a dsh version. This scaffold releases
 * in lockstep with DeepSeek Harness, so the release a person runs decides the
 * dsh version (see `./versions.ts`, where the `.rev.N` suffix is explained too).
 * Adding a flag would create two sources of truth for one fact.
 * @module @rdmu/create-dsh-plugin/args
 */

import { Command, CommanderError } from 'commander'

/** A resolved generation request. */
export interface ScaffoldRequest {
  /** Target directory, verbatim from argv; resolved against cwd by the caller. */
  readonly directory: string
  /** npm scope for generated package names, without the leading `@`; absent = unscoped. */
  readonly scope?: string
  /** The plugin's role name, used for its package name, ctx key, and tool name. */
  readonly pluginName: string
  /** The project's shape: one package at the root, or a pnpm workspace under `packages/`. */
  readonly layout: LayoutMode
  /** Write into a directory that already has contents. */
  readonly force: boolean
}

/**
 * How a generated project is laid out.
 *
 * `single` is the default because one plugin is the common case, and a workspace
 * whose only member is that plugin costs a nested directory, a solution tsconfig,
 * and a `paths` entry for nothing. `workspace` is for a project that will hold
 * more than one package.
 */
export type LayoutMode = 'single' | 'workspace'

/** Every accepted `--layout` value, in the order help lists them. */
export const LAYOUTS: readonly LayoutMode[] = ['single', 'workspace']

/** Lowercase kebab-case: the dsh package-naming rule, and a safe npm name segment. */
const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * Validate a role name for a generated plugin.
 *
 * The name reaches a package name (`dsh-plugin-<name>`), a Cordis plugin name,
 * a tool name, and a directory, so it is restricted to the intersection all
 * four accept rather than sanitized differently per use.
 * @param value - the raw `--plugin` value.
 * @returns the value unchanged when it is valid.
 * @throws Error when the value is not lowercase kebab-case.
 */
export function validatePluginName(value: string): string {
  if (!KEBAB_CASE.test(value)) {
    throw new Error(`plugin name ${JSON.stringify(value)} must be lowercase kebab-case, e.g. "word-count"`)
  }
  return value
}

/**
 * Validate an npm scope, accepting it with or without the leading `@`.
 * @param value - the raw `--scope` value.
 * @returns the scope without its leading `@`.
 * @throws Error when the remainder is not a valid npm scope segment.
 */
export function validateScope(value: string): string {
  const bare = value.startsWith('@') ? value.slice(1) : value
  if (!KEBAB_CASE.test(bare)) {
    throw new Error(`scope ${JSON.stringify(value)} must be lowercase kebab-case, e.g. "@acme"`)
  }
  return bare
}

/**
 * Validate a layout name.
 * @param value - the raw `--layout` value.
 * @returns the value as a layout mode.
 * @throws Error when it names neither layout.
 */
export function validateLayout(value: string): LayoutMode {
  const layout = LAYOUTS.find(mode => mode === value)
  if (layout === undefined) {
    throw new Error(
      `layout ${JSON.stringify(value)} must be "single" (one package at the project root)`
      + ' or "workspace" (a pnpm workspace with the plugin under packages/)',
    )
  }
  return layout
}

const HELP_EXAMPLES = `
Examples:
  pnpm create @rdmu/dsh-plugin my-plugin                     scaffold into ./my-plugin
  pnpm create @rdmu/dsh-plugin my-plugin --plugin word-count name the example plugin word-count
  pnpm create @rdmu/dsh-plugin my-plugin --scope @acme        publish generated packages under @acme
  pnpm create @rdmu/dsh-plugin my-plugin --layout workspace   a pnpm workspace, for more than one package
  pnpm create @rdmu/dsh-plugin@0.1.2-rc.1.rev.1 my-plugin    target a different dsh release

The default layout is one package at the project root. The scaffold version IS the
dsh version generated projects depend on, plus a .rev.N suffix for our own releases
against it; there is no flag to choose a dsh version separately.
`

/**
 * Resolve argv into one generation request, or print and exit for help,
 * version, or a usage error.
 * @param argv - arguments after the Node binary and script.
 * @param version - this scaffold's version, printed by `--version`.
 * @returns the resolved request.
 */
export function parseArgs(argv: readonly string[], version: string): ScaffoldRequest {
  let resolved: ScaffoldRequest | undefined
  const program: Command = new Command()
  program
    .name('create-dsh-plugin')
    .description('Scaffold a DeepSeek Harness plugin project targeting dsh ' + version)
    .version(version, '-V, --version', 'the scaffold version, which is also the targeted dsh version')
    .addHelpText('after', HELP_EXAMPLES)
    .exitOverride()
    .argument('<directory>', 'directory to create the project in')
    .option('--scope <scope>', 'npm scope for generated package names (e.g. @acme)')
    .option('--plugin <name>', 'role name for the example plugin', 'hello')
    .option('--layout <mode>', `project shape: ${LAYOUTS.join(' or ')}`, 'single')
    .option('--force', 'write into a directory that already has contents', false)
    .action((directory: string, options: { scope?: string; plugin: string; layout: string; force: boolean }) => {
      if (directory.trim().length === 0) program.error('error: directory must not be blank')
      let pluginName: string
      let layout: LayoutMode
      try {
        pluginName = validatePluginName(options.plugin)
        layout = validateLayout(options.layout)
      } catch (error) {
        return program.error(`error: ${(error as Error).message}`)
      }
      let scope: string | undefined
      if (options.scope !== undefined) {
        try {
          scope = validateScope(options.scope)
        } catch (error) {
          return program.error(`error: ${(error as Error).message}`)
        }
      }
      resolved = {
        directory,
        pluginName,
        layout,
        force: options.force,
        ...scope !== undefined ? { scope } : {},
      }
    })

  try {
    program.parse(argv, { from: 'user' })
  } catch (error) {
    /* v8 ignore next 2 -- Commander's exitOverride throws only CommanderError; the fallback code exists so
       an unexpected throw still exits non-zero rather than crashing with a stack trace. */
    return process.exit(error instanceof CommanderError ? error.exitCode : 1)
  }
  /* v8 ignore next 2 -- the action callback either resolves a request or Commander throws; unreachable, and
     kept so a future refactor that breaks that pairing fails loudly. */
  if (resolved === undefined) throw new Error('create-dsh-plugin: no request resolved')
  return resolved
}
