# @rdmu/create-dsh-plugin

Scaffold a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
plugin project — a working plugin with one model-facing tool, a profile bundle
that mounts it, dsh's own toolchain, and documentation an agent can follow without
reading dsh's source.

## Usage

One-off, nothing installed globally:

```sh
npm create @rdmu/dsh-plugin my-plugin
# or
pnpm create @rdmu/dsh-plugin my-plugin
# or
npx @rdmu/create-dsh-plugin my-plugin
```

Or install it once and use the command directly:

```sh
npm install -g @rdmu/create-dsh-plugin

create-dsh-plugin my-plugin
create-dsh-plugin my-plugin --scope @acme --plugin word-count
```

A global install also puts `dsh-trace` on your PATH — see below.

## Options

```
create-dsh-plugin <directory> [options]

  --scope <scope>   npm scope for the generated packages, e.g. @acme
  --plugin <name>   role name for the example plugin (default: hello)
  --force           write into a directory that already has contents
  -V, --version     the scaffold version, which is also the targeted dsh version
  -h, --help
```

`--plugin word-count` renames the package, its directory, the Cordis plugin name,
and the tool (`word_count_greet`) in one pass — you get a project that reads as
yours, not as a template you have to find-and-replace.

## The version is the contract

**This package's version IS the dsh version it targets.** `@rdmu/create-dsh-plugin@0.1.0-rc.7`
generates a project pinned to `@deepseek-ai/dsh-*@0.1.0-rc.7` — exactly, no caret.
There is no `--dsh-version` flag, because that would be a second source of truth
for one fact.

To target a different dsh release, pick that scaffold release:

```sh
npm create @rdmu/dsh-plugin@0.1.0-rc.8 my-plugin
```

dsh packages are cut as one set and are not independently compatible, so an exact
pin is the honest range: a caret would let your project install a dsh this
scaffold was never tested against.

## What you get

```
my-plugin/
  packages/
    plugin/hello/          the plugin — a typed tool, a prompt section, an invariant companion
    bundle/hello-bundle/   the patch layer that mounts it into a dsh profile
  docs/                    authoring guides — self-contained, no dsh checkout needed
  scripts/dsh-trace.ts     read any dsh dependency's contract from disk
  AGENTS.md                the conventions an agent must follow in this project
```

Plus the toolchain, copied from deepseek-harness so a plugin developed here builds
under the same rules as dsh's own packages: oxlint (type-aware), tsc project
references, tsdown, and vitest with a per-file 100% coverage floor.

## First steps in the generated project

```sh
cd my-plugin
pnpm install
pnpm run check        # typecheck + lint + test + build
```

`pnpm run check` passing means the plugin compiles under dsh's compiler settings,
its tool schema is valid, it mounts over the real dsh tool registry, and it
withdraws cleanly on disposal.

**The generated project needs pnpm**, even though the scaffold itself runs under
npm. It is a pnpm workspace with `autoInstallPeers: false`, which is what keeps
your unfilled dsh peer dependencies falling through to the profile's installation
fallback instead of installing a second copy of Cordis — two copies means two
service stores, and a plugin that registers into a registry nobody reads.

## Then run it inside dsh

The fastest loop — add a row to your machine-level user layer, which dsh
hot-reloads:

```yaml
# $DSH_HOME/cordis.patch.yml  (defaults to ~/.dsh/cordis.patch.yml)
- insert:
    - id: plugin-hello
      name: '@acme/dsh-plugin-hello'
      config:
        defaultLanguage: zh
```

The distributable route packs the bundle and installs it into a profile:

```sh
pnpm run pack:bundle
dsh plugin --profile tui add ./acme-dsh-bundle-hello-0.0.0.tgz
dsh --profile tui --dump-config    # confirm the row is in the composed tree
```

All four routes, the layer order that decides which override wins, and the
no-pnpm path are in the generated `docs/loading-into-dsh.md`.

## Reading dsh contracts without cloning dsh

`dsh-trace` prints where an installed dsh package's contract can actually be read:

```sh
dsh-trace @deepseek-ai/dsh-tools
```

```
@deepseek-ai/dsh-tools@0.1.0-rc.7
  installed at   .../node_modules/@deepseek-ai/dsh-tools
  contract       10 declaration file(s) — the JSDoc here IS the contract:
                 .../lib/types/index.d.ts
                 ...
  README         .../README.md
  source         https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.7/packages/core/tools
```

The published `.d.ts` files keep every JSDoc block — including `@mode` on events,
which tells you whether a listener must call `next()`. That is the real contract,
on disk and greppable. Generated projects get the same tool as
`pnpm run trace <package>`.

## Documentation

Every generated project carries these, so an agent working in it needs no other
source:

| File | Covers |
|---|---|
| `docs/plugin-authoring.md` | how to write a dsh plugin — export shapes, config, effects, tools, testing |
| `docs/cordis-essentials.md` | Context, fibers, services, effects, and the waterfall `next()` obligation |
| `docs/loading-into-dsh.md` | getting the plugin to run inside a real profile |
| `docs/tracing-dsh.md` | reading the authoritative contract of any dsh service |

## License

MIT

## Contributing

Working on the scaffold itself: [AGENTS.md](AGENTS.md).
