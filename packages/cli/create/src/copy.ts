/**
 * File materialization for the scaffold: recursive copy with name and token
 * substitution, manifest rewriting, layout flattening, and layout-specific
 * documentation passages.
 *
 * Four mechanisms, chosen per kind of difference rather than applied uniformly:
 *
 * - **Manifests** (`package.json`) are parsed, edited, and re-serialized. A
 *   dependency range is data, not text, so a textual replace could silently
 *   match a version-looking string elsewhere in the file.
 * - **Everything else** gets word-boundary token replacement. The template's
 *   role name appears only as an identifier — never inside prose like "hello
 *   world" — which is what makes `\bhello\b` safe. `tests/no-residue.spec.ts`
 *   pins that property by generating with a renamed plugin and asserting no
 *   template token survives.
 * - **The `single` layout is derived by path rewriting.** Templates are written
 *   in the workspace shape, which is the shape this repository itself has, so
 *   they stay honest and reviewable; {@link layoutRewrites} flattens them.
 * - **Passages that genuinely differ by layout** are pulled in from per-layout
 *   fragments, so one document serves both layouts rather than two documents
 *   drifting apart. See {@link resolveIncludes}.
 * @module @rdmu/create-dsh-plugin/copy
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LayoutMode } from './args.ts'

/** The role name the template checked into this repository uses. */
export const TEMPLATE_ROLE = 'hello'

/** The tool name the template registers, in the dsh `snake_case` convention. */
export const TEMPLATE_TOOL = 'hello_greet'

/** The npm scope the template checked into this repository uses, including the trailing slash. */
export const TEMPLATE_SCOPE = '@example/'

/** Names to substitute while materializing template files. */
export interface Naming {
  /** Target role name in kebab-case, e.g. `word-count`. */
  readonly role: string
  /** Target scope prefix including `@` and trailing `/`, or the empty string when unscoped. */
  readonly scopePrefix: string
  /** The project's shape, which decides whether template paths are flattened. */
  readonly layout: LayoutMode
}

/**
 * Ordered path rewrites that flatten the workspace layout into a single package.
 *
 * Longest path first, and the trailing-slash form before the bare form, so
 * `packages/plugin/hello/src/index.ts` becomes `src/index.ts` rather than
 * `./src/index.ts`.
 *
 * The two relative-depth rules are stated as whole paths rather than as a blanket
 * `../../../` rewrite on purpose: `.claude/skills/dsh-source/SKILL.md` links three
 * levels up to the project root from a directory that does not move between
 * layouts, and a blanket rule would break exactly that link.
 * @param naming - the target names, which decide the workspace paths being flattened.
 * @returns `[from, to]` pairs to apply in order.
 */
export function layoutRewrites(naming: Naming): readonly (readonly [string, string])[] {
  const plugin = `packages/plugin/${naming.role}`
  const bundle = `packages/bundle/${naming.role}-bundle`
  return [
    // A workspace member list, not a path: in the single layout the root itself is
    // the plugin, and `bundle` is the only additional member pnpm has to be told
    // about. This has to run before the path rules below, which would otherwise
    // turn the glob into `.`.
    ['packages:\n  - packages/*/*', 'packages:\n  - bundle'],
    [`${plugin}/`, ''],
    [plugin, '.'],
    [`${bundle}/`, 'bundle/'],
    [bundle, 'bundle'],
    ['packages/*/*/', ''],
    ['packages/*/*', '.'],
    ['../../../../tsconfig.tests.json', '../tsconfig.tests.json'],
    ['../../../docs/loading-into-dsh.md', '../docs/loading-into-dsh.md'],
  ]
}

/**
 * Convert a kebab-case role name to the `snake_case` form dsh tool names use.
 * @param role - the kebab-case role name.
 * @returns the snake_case form, e.g. `word-count` becomes `word_count`.
 */
export function snakeCase(role: string): string {
  return role.replaceAll('-', '_')
}

/**
 * Apply naming substitution to one file's text.
 *
 * Three ordered replacements, longest token first so the tool name is rewritten
 * before the bare role inside it:
 *
 * 1. the scope prefix, a literal;
 * 2. the tool name (`hello_greet`), which takes the `snake_case` form;
 * 3. the bare role (`hello`), which takes the `kebab-case` form and reaches
 *    package names, directory names, the Cordis plugin name, and `@module` tags.
 *
 * Replacement is case-sensitive and word-bounded. The template therefore may
 * write `Hello` in user-facing prose — greeting text, a heading — without it
 * being mistaken for an identifier, and every lowercase `hello` in the template
 * genuinely names this plugin, which is what makes step 3 correct rather than
 * merely convenient.
 *
 * The `single` layout then flattens every workspace path; see
 * {@link layoutRewrites}.
 * @param text - the template file's contents.
 * @param naming - the target names.
 * @returns the substituted text.
 */
/**
 * Apply the role rename: the tool name first, then the bare role inside it.
 * @param text - text with the scope already substituted.
 * @param role - the target role name in kebab-case.
 * @returns the text with both tokens renamed.
 */
function renameRole(text: string, role: string): string {
  return text
    .replace(new RegExp(`\\b${TEMPLATE_TOOL}\\b`, 'g'), `${snakeCase(role)}_greet`)
    .replace(new RegExp(`\\b${TEMPLATE_ROLE}\\b`, 'g'), role)
}

export function substitute(text: string, naming: Naming): string {
  const withScope = text.replaceAll(TEMPLATE_SCOPE, naming.scopePrefix)
  const named = naming.role === TEMPLATE_ROLE ? withScope : renameRole(withScope, naming.role)
  if (naming.layout === 'workspace') return named
  let flattened = named
  for (const [from, to] of layoutRewrites(naming)) flattened = flattened.replaceAll(from, to)
  return flattened
}

/** A `<!-- include: name -->` line, which a layout fragment replaces wholesale. */
const INCLUDE_MARKER = /^[ \t]*<!-- include: ([\w.-]+) -->[ \t]*$/gm

/**
 * Replace every `<!-- include: <name> -->` line with the layout's fragment.
 *
 * Three passages differ by layout — the directory tree, the recipe for adding a
 * package, and where tests live — while the other hundred-odd lines of AGENTS.md
 * and README.md must not. Two full copies per document is how those hundred lines
 * drift, so the documents stay single copies and only the passages are per-layout.
 * @param text - the template text, before naming substitution — the caller substitutes the assembled document.
 * @param fragments - directory holding one file per include name.
 * @returns the text with every marker replaced by its fragment, without its trailing newline.
 * @throws Error when a marker names a fragment the layout does not provide.
 */
export function resolveIncludes(text: string, fragments: string): string {
  return text.replace(INCLUDE_MARKER, (_line, name: string) => {
    const file = join(fragments, name)
    if (!existsSync(file)) {
      throw new Error(`create-dsh-plugin: template asks for include ${name}, which ${fragments} does not provide`)
    }
    return readFileSync(file, 'utf8').replace(/\n$/, '')
  })
}

/**
 * Rewrite one template manifest for the generated project.
 *
 * Every `@deepseek-ai/dsh-*` range is replaced with the scaffold's own range so
 * one version decision reaches every dependency section, and the package's own
 * version is reset: a freshly generated project has not been released.
 * @param text - the template `package.json` text.
 * @param naming - the target names, applied to the manifest's own name.
 * @param dshRange - the range every `@deepseek-ai/dsh-*` dependency takes.
 * @returns the rewritten manifest text with a trailing newline.
 */
export function rewriteManifest(text: string, naming: Naming, dshRange: string): string {
  const manifest = JSON.parse(substitute(text, naming)) as Record<string, unknown>
  manifest.version = '0.0.0'
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = manifest[section]
    if (typeof deps !== 'object' || deps === null) continue
    // The manifest is untyped JSON; every value in a dependency section is a
    // range string by npm's own schema, so one narrowing here covers the loop.
    const ranges = deps as Record<string, string>
    for (const name of Object.keys(ranges)) {
      if (name.startsWith('@deepseek-ai/dsh-')) ranges[name] = dshRange
    }
  }
  return JSON.stringify(manifest, undefined, 2) + '\n'
}

/**
 * Resolve a template file's name in the generated project.
 *
 * Template files carry a prefix when their real name would be picked up by THIS
 * repository's own tooling — a `package.json` would join the pnpm workspace, a
 * `tsconfig.json` would be compiled, an `.oxlintrc.json` would be read as a
 * nested lint config — or when npm refuses to ship it (a `.gitignore` inside a
 * tarball). Two prefixes, one rule each:
 *
 * - `__name` becomes `name` — hides the file from tooling that matches on the
 *   exact name.
 * - `_name` becomes `.name` — restores a leading dot.
 *
 * @param name - the template file's on-disk name.
 * @returns the name to write in the generated project.
 */
export function targetName(name: string): string {
  if (name.startsWith('__')) return name.slice(2)
  if (name.startsWith('_')) return `.${name.slice(1)}`
  return name
}

/**
 * Materialize a named subset of one directory's files into a target directory.
 *
 * Used for the trace tooling, which is shipped to a generated project as its own
 * `scripts/` files rather than as a dependency: this scaffold's releases and a
 * generated project's lifetime are not the same, and a project should not need an
 * unpublished package to inspect its own dependencies.
 * @param from - the directory holding the named files.
 * @param to - the target directory, created if absent.
 * @param names - file names to copy, relative to `from`.
 * @param naming - the target names.
 * @returns the absolute paths written.
 */
export function materializeFiles(from: string, to: string, names: readonly string[], naming: Naming): string[] {
  mkdirSync(to, { recursive: true })
  return names.map((entry) => {
    const target = join(to, substitute(targetName(entry), naming))
    writeFileSync(target, substitute(readFileSync(join(from, entry), 'utf8'), naming))
    return target
  })
}

/**
 * Materialize one template directory into a target directory, recursively.
 *
 * Directory names pass through the same substitution as file contents, so a
 * template package directory named after the role follows the rename.
 * @param from - the template directory to read.
 * @param to - the target directory, created if absent.
 * @param naming - the target names.
 * @param dshRange - the range every `@deepseek-ai/dsh-*` dependency takes.
 * @param fragments - directory of layout fragments; omit for trees that carry no include markers.
 * @returns the absolute paths written, in traversal order.
 */
export function materialize(
  from: string,
  to: string,
  naming: Naming,
  dshRange: string,
  fragments?: string,
): string[] {
  mkdirSync(to, { recursive: true })
  const written: string[] = []
  for (const entry of readdirSync(from).sort()) {
    const source = join(from, entry)
    const target = join(to, substitute(targetName(entry), naming))
    if (statSync(source).isDirectory()) {
      if (entry === 'node_modules' || entry === 'lib') continue
      written.push(...materialize(source, target, naming, dshRange, fragments))
      continue
    }
    const text = readFileSync(source, 'utf8')
    let output: string
    if (targetName(entry) === 'package.json') {
      output = rewriteManifest(text, naming, dshRange)
    } else {
      // Includes first, so a fragment is substituted with the document that pulls it
      // in: fragments are template text like any other, written with the template's
      // role name and — for the workspace layout — its paths.
      const assembled = fragments === undefined ? text : resolveIncludes(text, fragments)
      output = substitute(assembled, naming)
    }
    writeFileSync(target, output)
    written.push(target)
  }
  return written
}
