/**
 * `@example/dsh-plugin-hello` — a complete, minimal DeepSeek Harness plugin.
 *
 * It registers one model-facing tool (`hello_greet`) and one system-prompt
 * section, and is deliberately the smallest thing that exercises every seam a
 * real plugin uses: the function-plugin export form, a validated `Config`, a
 * capability injection, a tool definition with typed arguments and a canonical
 * output value, and fiber-scoped registration.
 *
 * The export form matters. A FUNCTION plugin named-exports `name`, `inject`,
 * `Config`, and `apply`, and has NO default export — mixing in a default export
 * makes the dsh Loader discard the namespace, so `inject` is never seen and the
 * plugin mounts without its services. A SERVICE plugin (one that publishes
 * `ctx.<key>`) is the other shape: default-export the Service class instead.
 * @module @example/dsh-plugin-hello
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { greet, SUPPORTED_LANGUAGES } from './greet.ts'

export { greet, SUPPORTED_LANGUAGES, type Greeting } from './greet.ts'

/**
 * The Cordis plugin name, used in Loader diagnostics and `cordis_inspect`
 * output. Convention is the package name minus its `dsh-` prefix.
 */
export const name = 'plugin-hello'

/**
 * Capabilities this plugin requires before `apply` runs.
 *
 * Cordis mounts the plugin only once every injected service is available, and
 * unmounts it if one goes away — which is why `apply` may use `ctx.tools`
 * directly without a presence check. Declare only what you use: an unnecessary
 * injection makes the plugin fail to activate in compositions that would
 * otherwise support it.
 */
export const inject = ['tools', 'systemPrompt']

/** The default language `hello_greet` uses when a call omits one. */
export const DEFAULT_LANGUAGE = 'en'

/** Plugin configuration, settable from `cordis.yml` under this row's `config:`. */
export interface Config {
  /** Language used when a call omits `language`. Defaults to `en`. */
  defaultLanguage?: string
}

/**
 * The runtime schema for {@link Config}.
 *
 * dsh requires deployment-varying choices to be validated config fields rather
 * than constants in code, so an operator can change them from `cordis.yml`
 * without a rebuild. schemastery fills defaults before `apply` receives the
 * value.
 */
export const Config: z<Config> = z.object({
  defaultLanguage: z.string().default(DEFAULT_LANGUAGE),
})

/** Complete config after schemastery has applied every field default. */
type ResolvedConfig = Required<Config>

/**
 * Register this plugin's contributions.
 *
 * Nothing here needs manual teardown: `ctx.tools.register` and
 * `ctx.systemPrompt.section` are effects owned by this plugin's fiber, so
 * disposing the plugin (unmount, hot reload, config change) withdraws the tool
 * and the prompt section automatically. That is the single most important dsh
 * convention — every contribution goes through an effect, and a registry's
 * `register()` returns its own disposer if you need to withdraw one early.
 * @param ctx - the plugin's context, carrying the injected capabilities.
 * @param config - validated configuration with defaults already applied.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  if (!SUPPORTED_LANGUAGES.includes(resolved.defaultLanguage)) {
    // Misconfiguration fails loud at load, not on the first tool call: a plugin
    // that mounts successfully should be one that works.
    throw new Error(
      `plugin-hello: defaultLanguage ${JSON.stringify(resolved.defaultLanguage)} is not supported;`
      + ` use one of ${SUPPORTED_LANGUAGES.join(', ')}`,
    )
  }

  ctx.systemPrompt.section({
    name: 'tool:hello_greet',
    order: 900,
    text: 'Use the hello_greet tool to greet someone by name. It is a demonstration tool; prefer answering directly unless the user explicitly asks for a greeting.',
  })

  ctx.tools.register(defineTool({
    name: 'hello_greet',
    description: 'Greet someone by name in a supported language. Returns the rendered greeting and the language used.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet.' },
      language: {
        type: 'string',
        description: `Language tag for the greeting. One of ${SUPPORTED_LANGUAGES.join(', ')}. Defaults to the deployment's configured language.`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          greeting: { type: 'string', required: true },
          language: { type: 'string', required: true },
        },
      },
      // Pure projection of the canonical value into what the model reads. Keep
      // it free of UI and transport vocabulary — the model only needs the task.
      render: (_args, value) => [{ type: 'text', text: value.greeting }],
    },
    // A cooperative budget the timeout policy enforces; deployment policy, never
    // a model argument.
    timeoutMs: 5_000,
    // Pure string building mutates no shared state, so parallel calls are safe.
    isConcurrencySafe: () => true,
    execute: (args) => {
      // `greet` throws a plain Error for bad input; the registry turns that into
      // a structured tool error the model can read and retry against.
      return Promise.resolve(greet(args.name, args.language ?? resolved.defaultLanguage))
    },
    presentCall: (args): GenericCallView => ({
      card: 'generic',
      title: args.name,
      kind: 'read',
      rawInput: args.name,
    }),
  }))
}
