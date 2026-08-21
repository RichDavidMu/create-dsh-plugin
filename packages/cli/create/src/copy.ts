/**
 * File materialization for the scaffold: recursive copy with name and token
 * substitution, plus manifest rewriting.
 *
 * Two substitution mechanisms, chosen per file kind rather than applied
 * uniformly:
 *
 * - **Manifests** (`package.json`) are parsed, edited, and re-serialized. A
 *   dependency range is data, not text, so a textual replace could silently
 *   match a version-looking string elsewhere in the file.
 * - **Everything else** gets word-boundary token replacement. The template's
 *   role name appears only as an identifier — never inside prose like "hello
 *   world" — which is what makes `\bhello\b` safe. `tests/no-residue.spec.ts`
 *   pins that property by generating with a renamed plugin and asserting no
 *   template token survives.
 * @module create-dsh-plugin/copy
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
 * @param text - the template file's contents.
 * @param naming - the target names.
 * @returns the substituted text.
 */
export function substitute(text: string, naming: Naming): string {
  const withScope = text.replaceAll(TEMPLATE_SCOPE, naming.scopePrefix)
  if (naming.role === TEMPLATE_ROLE) return withScope
  return withScope
    .replace(new RegExp(`\\b${TEMPLATE_TOOL}\\b`, 'g'), `${snakeCase(naming.role)}_greet`)
    .replace(new RegExp(`\\b${TEMPLATE_ROLE}\\b`, 'g'), naming.role)
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
 * @returns the absolute paths written, in traversal order.
 */
export function materialize(from: string, to: string, naming: Naming, dshRange: string): string[] {
  mkdirSync(to, { recursive: true })
  const written: string[] = []
  for (const entry of readdirSync(from).sort()) {
    const source = join(from, entry)
    const target = join(to, substitute(targetName(entry), naming))
    if (statSync(source).isDirectory()) {
      if (entry === 'node_modules' || entry === 'lib') continue
      written.push(...materialize(source, target, naming, dshRange))
      continue
    }
    const text = readFileSync(source, 'utf8')
    const output = targetName(entry) === 'package.json'
      ? rewriteManifest(text, naming, dshRange)
      : substitute(text, naming)
    writeFileSync(target, output)
    written.push(target)
  }
  return written
}
