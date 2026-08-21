# Writing a DeepSeek Harness plugin

This document covers the common path in full — the two plugin shapes, `inject`,
config, effects, the tool contract, testing — and states it here rather than
leaving it as a pointer into the dsh source tree. You can write a working plugin
from this page alone.

It is not a description of dsh's surface area, and cannot become one: most
services, most events, and most fields of the option objects below are absent by
design. **When you need something this document does not state, read it from dsh
itself instead of inferring it.** Two local routes are already set up: the pinned
release's full source, indexed as a code graph under `.dsh-source/`, and the
installed declarations, whose JSDoc is the contract. `pnpm run dsh:graph` builds
the first, `pnpm run trace <pkg>` locates the second, and
[tracing-dsh.md](tracing-dsh.md) explains when each is the right one. Section 10
lists what this page leaves out and where each piece is read.

Everything in dsh is a plugin. There is no plugin API layered on top of the
runtime; a plugin IS how the runtime is assembled. Adding a tool, a prompt
section, a permission gate, an LLM provider, or a whole UI surface are all the
same act: mount a Cordis plugin that registers into a service.

## 1. The two plugin shapes

Pick by one question: **does this plugin publish a capability others inject?**

### Function plugin — contributes into existing services

The common case. Named exports, and **no default export**:

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'plugin-hello'          // Loader diagnostics
export const inject = ['tools']             // required capabilities
export interface Config { greeting?: string }
export const Config: z<Config> = z.object({ greeting: z.string().default('Hi') })
export function apply(ctx: Context, config: Config): void { /* register here */ }
```

### Service plugin — publishes `ctx.<key>`

Default-export a `Service` subclass, and declare the key through module
augmentation:

```ts
import { Context, Service } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context { greeter: GreeterService }
}

export class GreeterService extends Service {
  static inject = ['tools']
  constructor(ctx: Context, config: Config = {}) { super(ctx, 'greeter') }
}

export default GreeterService
```

### The one mistake that costs the most time

**Never mix the two forms.** A module that named-exports `inject` *and*
default-exports something makes the dsh Loader discard the namespace: `inject`
is never read, the plugin mounts without its dependencies, and the failure looks
like "my service is undefined" rather than "you have two export shapes". dsh has
a postmortem for exactly this. One file, one shape.

## 2. `inject` decides when you run

Cordis mounts your plugin only after **every** injected service exists, and
unmounts it if one disappears. Two consequences:

- Inside `apply`, injected services are guaranteed present. Do not write
  `if (ctx.tools)`.
- Declaring a service you do not use makes your plugin silently fail to activate
  in compositions that would otherwise support it. Declare exactly what you use.

For an **optional** dependency, do not put it in `inject` — read it with
`ctx.get('name')`, which returns `undefined` when absent. Never reach for
`ctx.<name>` on a service you did not declare: the property proxy is
topology-sensitive, while `ctx.get` reads the global service store.

## 3. Configuration is data, not constants

Any value that varies by deployment — a timeout, a cap, an endpoint, a default
language — is a validated `Config` field settable from `cordis.yml`. A
`const DEFAULT_X` in your source is not configurability.

Fixed in code, correctly: protocol constants, external spec values, security
invariants, and robustness ceilings that exist to keep the process healthy
rather than to be tuned.

schemastery applies every declared default before `apply` receives the value, so
inside `apply` you may treat defaulted fields as present:

```ts
type ResolvedConfig = Required<Config>
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  // resolved.greeting is a string
}
```

**Misconfiguration fails loud at load.** Validate what the schema cannot express
(a value in a supported set, a positive integer) at the top of `apply` and
throw. A plugin that mounts successfully should be one that works.

## 4. Every registration is an effect

This is the convention that makes hot reload and dynamic composition safe:

```ts
ctx.tools.register(definition)     // withdrawn when this plugin's fiber disposes
ctx.systemPrompt.section({ ... })  // same
ctx.on('tools/pre-execute', gate)  // same
```

You do not clean up in `apply`. The fiber owns every effect and withdraws them
on unmount, reload, or config change. Each `register()` also returns its own
disposer if you need to withdraw one early.

If you ever hold state that is not a registration — a timer, a socket, a cache —
wrap it in `ctx.effect()` so it is torn down with everything else:

```ts
ctx.effect(function* () {
  const handle = setInterval(tick, 1000)
  yield () => clearInterval(handle)
})
```

**Prove it.** Your test suite must dispose the plugin fiber and assert the
contribution is gone. A registration that outlives its fiber leaks a duplicate
on every reload, and nothing else catches it.

## 5. Defining a tool

`defineTool` from `@deepseek-ai/dsh-tools` infers argument and return types from
the schemas, so a mismatch between `execute` and `output.schema` is a compile
error rather than a runtime surprise.

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'

ctx.tools.register(defineTool({
  name: 'hello_greet',              // snake_case, unique across the composition
  description: 'Greet someone by name.',   // the model reads this
  parameters: {
    name: { type: 'string', required: true, description: 'Who to greet.' },
    language: { type: 'string', description: 'Optional language tag.' },
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
    render: (_args, value) => [{ type: 'text', text: value.greeting }],
    presentationMeta: (_args, value) => ({ language: value.language }),
  },
  timeoutMs: 5_000,
  isConcurrencySafe: () => true,
  async execute(args, exec) {
    return { greeting: `Hi, ${args.name}!`, language: args.language ?? 'en' }
  },
  presentCall: args => ({ card: 'generic', title: args.name, kind: 'read', rawInput: args.name }),
  presentResult: (args, result) => undefined,
}))
```

### The canonical-value contract

`execute` returns the **canonical value** described by `output.schema` — not
text, not content blocks. The registry validates it against that schema, then
`render` projects it into what the model reads. This split is why a UI, a replay,
and the model can each see an appropriate view of one result.

- **`render`** must be a pure function of `(args, value)`. No I/O, no clock, no
  service access. It runs again on replay.
- **`presentationMeta`** is optional opaque JSON persisted with the session log,
  for facts a UI cannot recover from the rendered text. Also pure.
- **`presentCall` / `presentResult`** are pure presenters for the pending and
  completed states. Return `undefined` for the default generic card. A tool's
  render intent (`generic` / `terminal` / `diff`) is a design decision to make up
  front, not an afterthought.

### Errors, cancellation, and time

- **Throw a plain `Error` for bad input.** The registry converts it into a
  structured tool error the model can read and retry against. Do not return an
  error-shaped success value.
- **`exec.signal` is your cancellation.** Pass it to every await that can block —
  `fetch`, a subprocess, a service call. A tool that ignores it cannot be
  interrupted.
- **Timeout is deployment policy, never a model argument.** Declare `timeoutMs`
  (ideally from `Config`) and let the timeout policy enforce it; your body just
  forwards `exec.signal`. Do not add a `timeout` parameter to `parameters`.

### Writing for the model, not for yourself

`description`, parameter descriptions, rendered text, and error messages are
model-facing contracts. They contain task vocabulary only — no UI terms, no
transport details, no internal class names. "Fetch the content of a URL" is
right; "Calls WebFetchProvider.fetch via the seam" is not.

Bound what you return. If a result can be large, cap it where the **complete**
emitted value is known — including any header and truncation notice — and tell
the model it was truncated and what to do instead.

## 6. Contributing to the system prompt

```ts
ctx.systemPrompt.section({
  name: 'tool:hello_greet',   // unique; namespacing by `tool:` is the convention
  order: 900,                 // lower sorts earlier; dsh core sections sit below ~500
  text: 'Use the hello_greet tool to greet someone by name.',
})
```

Two rules that matter more than they look:

- **Model-visible ⟺ logged.** Anything reaching a model request must be
  reconstructable from the session log. A static prompt section is part of the
  composition and therefore already reproducible; per-request dynamic content is
  not, and needs a session event. If you find yourself injecting request-time
  data the log does not carry, stop — that is a design error, not a detail.
- **Keep prompt text stable.** A section that changes between turns invalidates
  the KV cache prefix for the whole conversation. Put volatile content in a
  tool result, not the prompt.

## 7. Package layout and naming

One plugin, one package, laid out the way dsh lays out its own:

```
packages/plugin/hello/
  package.json          # exports ".", "./invariant"; cordis is a peerDependency
  tsconfig.json         # extends the base; rootDir src, outDir lib/types
  README.md
  src/
    index.ts            # name / inject / Config / apply — the wiring
    greet.ts            # the actual logic, pure and unit-testable
    invariant.ts        # the invariant companion (see below)
    types.ts            # types ONLY, no runtime code
  tests/                # at package level, never src/__tests__
    greet.spec.ts
    plugin.spec.ts
```

Naming, all enforced by convention rather than tooling:

| Thing | Form | Example |
|---|---|---|
| npm package | `dsh-<role>`, scoped | `@acme/dsh-plugin-hello` |
| Cordis plugin `name` | package name minus `dsh-` | `plugin-hello` |
| tool name | `snake_case` | `hello_greet` |
| prompt section | `tool:<tool_name>` or `<role>` | `tool:hello_greet` |
| service `ctx` key | `camelCase` noun | `ctx.greeter` |

`@deepseek-ai/cordis` is a **peerDependency** of every dsh package, plus a
devDependency so tests can resolve it. This is not a style choice: two copies of
Cordis means two service stores, and your plugin silently never sees the host's
services.

### The invariant companion

Every dsh package ships `src/invariant.ts` exported as `./invariant`. It
registers runtime checks over relationships the package **owns** — an event
stream it emits, mutable data it maintains — so a broken assumption fails loudly
instead of corrupting state.

A stateless plugin correctly has an **empty** installer with a stated reason.
Never invent a check that merely asserts a service exists; that tests the
framework, not your package.

```ts
/** No runtime invariant: this plugin holds no mutable state and emits no events. */
const install: InvariantInstaller = () => {}

export const name = 'plugin-hello-invariant'
export const inject = ['invariants']
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register('@acme/dsh-plugin-hello', install))
```

When you do own state, the installer takes `(ctx, fail)` and calls `fail(message)`
from a listener on the authoritative stream.

## 8. Testing: what actually counts

dsh's standard, worth adopting: **a hand-built fake context proves nothing.**

```ts
const ctx = new Context()
await ctx.plugin(SystemPrompt)     // real service
await ctx.plugin(ToolRuntime)      // real service
const fiber = await ctx.plugin(myPlugin, { /* config */ })

// What the model sees:
expect(ctx.tools.schemas().find(s => s.name === 'hello_greet')).toBeDefined()

// What executing it produces, through the real pipeline:
const result = await ctx.tools.execute({
  callId: CallId('t1'), name: 'hello_greet', arguments: { name: 'Ada' }, signal,
})

// Mandatory: disposal withdraws the registration.
await fiber.dispose()
expect(ctx.tools.schemas().some(s => s.name === 'hello_greet')).toBe(false)
```

Mounting the real registry proves the schema compiles, arguments validate, the
output schema accepts what `execute` returned, and teardown is clean — four
things a mock cannot tell you. Mock only external services and genuinely
nondeterministic inputs (network, clock, randomness).

Split logic from wiring so the interesting cases are cheap: pure functions get
plain unit tests, and the composition test covers the seams.

Tests describe **behavior**, not correctness. When behavior should change, change
the test with it and say why.

## 9. Quick reference: what breaks plugins

| Symptom | Cause |
|---|---|
| `ctx.<service>` is undefined inside `apply` | module has both named `inject` and a default export |
| plugin never activates | `inject` names a service the composition does not mount |
| duplicate tool after a config edit | a registration made outside an effect |
| tool works, then a second one fails | tool `name` collides with another plugin's |
| user override does not take effect | id-targeted patch REPLACES config; restate the fields you keep |
| override silently ignored | patch names an id absent from the tree — only a stderr warning |
| service appears twice / capability never connects | two copies of Cordis or of a Service Definition package |
| tool cannot be interrupted | `exec.signal` not forwarded to the blocking await |
| model retries the same bad call | error message did not say what a valid input looks like |

## 10. Where this document stops

Everything above is one plugin's worth of dsh. What it leaves out, and where each
piece is read — `pnpm run trace <pkg>` prints the absolute paths, the code graph
under `.dsh-source/` answers the rest, and [tracing-dsh.md](tracing-dsh.md)
explains which to reach for:

| You need | Read |
|---|---|
| a service beyond `tools`, `systemPrompt`, `invariants` | that package's `lib/types/*.d.ts`; its `interface Context` names the `ctx` key |
| which events exist, and which listeners must call `next()` | `interface Events`, plus the `@mode` tag on each declaration |
| every field of `defineTool`'s options | `DefineToolOptions` in `dsh-tools/lib/types/schema.d.ts` |
| card kinds and presentation types | `dsh-tools/lib/types/presentation.d.ts` |
| a package's config keys, or its token / KV-cache cost | that package's `README.md` |
| how something is implemented, or what calls what | the code graph: `codegraph explore '<question>' --path .dsh-source/dsh-v<version>` |
| why a design is that way | the snapshot's own `docs/` and `.agents/notes/` |

Guessing instead is the expensive move. The compiler rejects a misspelled name; it
accepts a listener that forgets `next()` and a `render` that is not pure.

Two more guides in this project:

- [cordis-essentials.md](cordis-essentials.md) — Context, fibers, services,
  effects, waterfall events.
- [loading-into-dsh.md](loading-into-dsh.md) — get this plugin running inside a
  real dsh profile.
