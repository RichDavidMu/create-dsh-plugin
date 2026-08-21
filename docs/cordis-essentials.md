# Cordis essentials

dsh runs on a vendored copy of [Cordis](https://github.com/cordiverse/cordis).
You need five ideas; the rest you can look up when you hit it.

## Context

`Context` is the object every plugin receives and the only handle it needs.
Capabilities appear on it as properties — `ctx.tools`, `ctx.systemPrompt`,
`ctx.fs` — declared through TypeScript module augmentation:

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}
```

That merge is what makes `ctx.greeter` type-check for every consumer, anywhere,
with no import of your class needed. It is also why a capability is *declared* in
exactly one place — the package that owns it.

Two ways to reach a service, and they are not interchangeable:

- **`ctx.tools`** — for a service you named in `inject`. Guaranteed present, and
  resolved relative to your position in the plugin tree.
- **`ctx.get('tools')`** — for an optional dependency. Returns `undefined` when
  absent, and reads the global service store rather than the topology-sensitive
  property proxy. Use this, not `ctx.tools`, for anything you did not declare.

## Fibers

Mounting a plugin creates a **fiber** — that plugin instance's lifecycle unit:

```ts
const fiber = await ctx.plugin(myPlugin, config)
await fiber.dispose()
```

A fiber owns everything the plugin registered. Disposing it withdraws all of it.
Fibers are also why activation is dynamic: Cordis mounts a fiber when its
injected services become available and disposes it when one goes away, so a
composition can gain and lose capabilities at runtime without any plugin writing
availability checks.

## Effects

An effect is the unit of cleanup. A generator yields its own teardown:

```ts
ctx.effect(function* () {
  const handle = setInterval(tick, 1000)
  yield () => clearInterval(handle)
})
```

Every registry in dsh is built on this, which is why `ctx.tools.register(...)` and
`ctx.on(...)` need no manual cleanup — and why anything *you* hold that is not a
registration must be wrapped the same way. The dsh rule is absolute: **every
contribution goes through `ctx.effect()` or `ctx.on()`, and a registry's
`register()` returns the disposer.**

## Events, and the `next()` obligation

Events are typed by declaration merging, and each carries a documented dispatch
mode. Read the mode from the `@mode` tag in the declaration — it decides how your
listener must behave:

| Mode | Contract |
|---|---|
| `emit` | fire and forget; return value ignored |
| `bail` | first non-`undefined` return wins and stops the chain |
| `waterfall` | you receive `next` and **must call it** to delegate |

```ts
ctx.on('tools/pre-execute', async (exec, next) => {
  if (isFine(exec)) return next()       // delegate — the rest of the chain runs
  return { kind: 'deny', reason: '…' }  // decide — the chain stops here
})
```

**Returning from a waterfall listener without calling `next()` short-circuits the
whole chain.** That is the single most common Cordis bug in dsh: a gate that
means "I have no opinion" but silently overrides every other gate. If you have no
opinion, `return next()`.

To find what you can hook:

```sh
grep -n "@mode" node_modules/@deepseek-ai/dsh-*/lib/types/*.d.ts
```

## Services

A service publishes a capability. Extend `Service`, name the key in the
constructor, and default-export the class:

```ts
export class GreeterService extends Service {
  static inject = ['tools']
  static Config: z<Config> = z.object({ /* … */ })

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'greeter')   // becomes ctx.greeter
  }
}

export default GreeterService
```

Note `static inject` and `static Config` on the class — the service form's
equivalents of the function form's named exports. And note the default export:
a service plugin has one, a function plugin must not.

### Designing a service worth publishing

dsh treats a capability as three roles that only make sense together — the
**Service Definition** (types, registry, selection, errors), one or more
**Service Providers** (concrete backends), and the **Consumers** (what uses it).
`packages/web/` is the reference shape: `dsh-web` defines `ctx.web` and picks a
provider, `dsh-web-search-exa` and friends provide, `dsh-tool-web` consumes and
owns the model-facing schema.

Publish a service only when there will be more than one provider or more than one
consumer. A public service method with exactly one internal caller is a smell —
pass a private closure instead.

## Configuration files

`cordis.yml` is a list of entry rows; patches address rows by `id`. dsh allows
`!!js` expressions (never `!js`) under a row's `config` and its `disabled` field,
evaluated in that row's own context at mount:

```yaml
- id: plugin-hello
  name: '@acme/dsh-plugin-hello'
  config:
    defaultLanguage: !!js process.env.HELLO_LANG || 'en'
```

Everything else in a row stays literal. See
[loading-into-dsh.md](loading-into-dsh.md) for how layers compose.

## Further reading

The vendored Cordis source and dsh's own `docs/cordis-primer.md` are in the
snapshot under `.dsh-source/` once `pnpm run dsh:graph` has fetched it —
[tracing-dsh.md](tracing-dsh.md) explains that route and the others.
