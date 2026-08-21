/**
 * The greeting logic behind the `hello` tool: a pure function with no Cordis,
 * no I/O, and no service access.
 *
 * Splitting it out is the dsh convention worth copying — the registration in
 * `./index.ts` stays a few lines of wiring you can read at a glance, and the
 * behaviour is unit-testable without booting a Context.
 * @module @example/dsh-plugin-hello/greet
 */

/** Greeting templates by BCP-47-ish language tag. `{name}` is the only placeholder. */
const GREETINGS: Readonly<Record<string, string>> = {
  en: 'Hello, {name}!',
  zh: '你好，{name}！',
  ja: 'こんにちは、{name}さん！',
}

/** Language tags this plugin can greet in, in a stable order for diagnostics. */
export const SUPPORTED_LANGUAGES: readonly string[] = Object.keys(GREETINGS)

/** One rendered greeting. Mirrors the tool's canonical output value. */
export interface Greeting {
  /** The rendered greeting text. */
  readonly greeting: string
  /** The language tag actually used, after applying the configured default. */
  readonly language: string
}

/**
 * Render a greeting.
 *
 * Throws a plain `Error` for an unsupported language rather than silently
 * falling back to English: a tool that quietly ignores an argument teaches the
 * model that the argument does not matter. The registry turns this throw into a
 * structured tool error the model can read and correct.
 * @param name - who to greet; must not be blank.
 * @param language - the requested language tag, already defaulted by the caller.
 * @returns the rendered greeting and the language used.
 * @throws Error when `name` is blank or `language` is not supported.
 */
export function greet(name: string, language: string): Greeting {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('name must not be blank')
  const template = GREETINGS[language]
  if (template === undefined) {
    throw new Error(`language ${JSON.stringify(language)} is not supported; use one of ${SUPPORTED_LANGUAGES.join(', ')}`)
  }
  return { greeting: template.replace('{name}', trimmed), language }
}
