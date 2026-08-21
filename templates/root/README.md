# dsh-plugin-hello

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin.

Two packages:

| Package | Role |
|---|---|
| `packages/plugin/hello` | the plugin — registers the `hello_greet` tool and a system-prompt section |
| `packages/bundle/hello-bundle` | the profile bundle — a patch layer that mounts the plugin into a dsh composition |

## Quick start

```sh
pnpm install
pnpm run check        # typecheck + lint + test + build
```

`pnpm run check` passing means the plugin compiles under dsh's own compiler
settings, its tool schema is valid, it mounts over the real dsh tool registry,
and it withdraws cleanly on disposal.

## Try it in dsh

The fastest loop — add a row to your machine-level user layer, which dsh
hot-reloads:

```yaml
# $DSH_HOME/cordis.patch.yml  (defaults to ~/.dsh/cordis.patch.yml)
- insert:
    - id: plugin-hello
      name: '@example/dsh-plugin-hello'
      config:
        defaultLanguage: zh
```

For that bare name to resolve, the built package has to be reachable from the
profile. The distributable route packs the bundle and installs it:

```sh
pnpm run pack:bundle
dsh plugin --profile tui add ./example-dsh-bundle-hello-0.0.0.tgz
dsh --profile tui --dump-config          # confirm the row is in the composed tree
```

Then ask the agent to greet someone, and it will call `hello_greet`.

Both routes, the layer order that decides who wins, and the no-pnpm path are in
[docs/loading-into-dsh.md](docs/loading-into-dsh.md).

## Making it yours

The example is deliberately small but complete — it exercises the function-plugin
export form, a validated `Config`, a capability injection, a typed tool with a
canonical output value, a prompt section, and fiber-scoped registration. Replace
the greeting logic in `packages/plugin/hello/src/greet.ts` with something you
actually want, and keep the shape.

`packages/plugin/hello/src/index.ts` is the wiring; the logic lives beside it in
its own module so it stays unit-testable without booting a Context. That split is
worth preserving.

## Documentation

- [docs/plugin-authoring.md](docs/plugin-authoring.md) — how to write a dsh
  plugin. Self-contained; no dsh checkout required.
- [docs/cordis-essentials.md](docs/cordis-essentials.md) — Context, fibers,
  services, effects, and the waterfall `next()` obligation.
- [docs/loading-into-dsh.md](docs/loading-into-dsh.md) — getting the plugin to run
  inside a real profile.
- [docs/tracing-dsh.md](docs/tracing-dsh.md) — reading the authoritative contract
  of any dsh service from the installed dependency.
- [AGENTS.md](AGENTS.md) — the conventions an agent working in this repository
  must follow.

## dsh version

This project targets one dsh release, pinned across every `@deepseek-ai/dsh-*`
dependency. They are released as a set and are not independently compatible, so
upgrade them together. `pnpm run trace @deepseek-ai/dsh-tools` prints the
installed version and where to read its contract.
