# Tracing dsh sources

You can read the authoritative contract of any dsh service without cloning
deepseek-harness. Three routes, in decreasing immediacy.

## 1. Emitted declarations — the contract, on disk

The published tarballs keep **every JSDoc block** in their `.d.ts` files,
including `@mode` on events and `@param`/`@returns` on service methods. This is
the single highest-value route: it is the real contract, it is local, and it is
greppable.

```
node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts
node_modules/@deepseek-ai/dsh-tools/lib/types/schema.d.ts       ← defineTool options
node_modules/@deepseek-ai/dsh-tools/lib/types/presentation.d.ts ← card view types
```

What you get there that no summary carries: the exact `DefineToolOptions` fields
with their documented purpose, the `Context`/`Events` declaration merges that
tell you which `ctx.<key>` and which waterfall event names exist, and the
`@mode` tag on each event that tells you whether a listener must call `next()`.

Grep it directly:

```sh
# Which events can I hook, and in what mode?
grep -n "@mode" node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts

# What does this service actually expose?
grep -n "^\s*\(readonly \)\?[a-z][A-Za-z]*(" node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts

# Which ctx keys does this package publish?
grep -rn "interface Context" -A 5 node_modules/@deepseek-ai/dsh-*/lib/types/*.d.ts
```

## 2. Package READMEs — role, config, and model cost

Each tarball ships `README.md` and `README.zh.md`. The dsh convention puts a
package's role, its config keys, its known limitations, and its **Model
Experience** there — what the model sees, the token effect, and the KV-cache
effect. That last part exists nowhere else and is what you need when deciding
whether your plugin's contribution is cheap or expensive.

```
node_modules/@deepseek-ai/dsh-tools/README.md
```

## 3. Upstream source — for implementation, not contract

The published tarball does **not** contain `src/`, even though its `exports`
declares a `./src/*` subpath — that entry serves workspace consumers inside
deepseek-harness itself. To read implementation, go to the repository at the
exact release tag:

```
https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v<version>/<repository.directory>
```

Both halves come from the installed manifest: `repository.url` gives the remote,
`repository.directory` gives the package's path in the monorepo, and the release
tag is `dsh-v` followed by the version. For `@deepseek-ai/dsh-tools@0.1.0-rc.7`:

```
https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.7/packages/core/tools
```

Alongside `src/` and `tests/` there, the repository carries material the tarballs
omit and that is often the real answer: `docs/architecture.md`,
`docs/cordis-primer.md`, `docs/defensive-patterns.md`, `docs/testing.md`, the
`docs/cookbook/` guides, generated catalogs like `docs/tool-catalog.md`, and the
Agent Notes under `.agents/notes/` that record why a design is the way it is.

## The `dsh-trace` command

This project ships a helper that prints all three routes for any installed dsh
package:

```sh
pnpm run trace @deepseek-ai/dsh-tools @deepseek-ai/dsh-system-prompt
```

```
@deepseek-ai/dsh-tools@0.1.0-rc.7
  installed at   /path/node_modules/@deepseek-ai/dsh-tools
  contract       10 declaration file(s) — the JSDoc here IS the contract:
                 /path/node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts
                 ...
  README         /path/node_modules/@deepseek-ai/dsh-tools/README.md
  source         https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.7/packages/core/tools
```

## Working against a local dsh checkout

When you are developing a plugin in step with unreleased dsh changes, point the
dependency at a local clone instead of the registry:

```sh
pnpm add '@deepseek-ai/dsh-tools@file:../deepseek-harness/packages/core/tools'
```

Two cautions. dsh publishes built `lib/`, so a fresh clone needs
`pnpm install && pnpm run build:lib:host` in that checkout before a `file:`
dependency resolves. And a local clone is a moving target: the version you
eventually ship against must be a released one, so revert to a registry range
before publishing.

## Version alignment

`@rdmu/create-dsh-plugin` releases in lockstep with dsh: the scaffold version IS the
dsh version a generated project depends on, and every `@deepseek-ai/dsh-*`
dependency is pinned **exactly** rather than with a caret.

That is deliberate. `^0.1.0-rc.7` also admits `0.1.0-rc.8` and `0.1.0`, so a
caret would let a project silently install a dsh its scaffold was never tested
against. dsh packages are cut as one set and are not independently compatible.

To target a different dsh release, generate with that scaffold release —
`pnpm create @rdmu/dsh-plugin@0.1.0-rc.8 my-plugin` — rather than editing ranges by
hand. To upgrade an existing project, bump every `@deepseek-ai/dsh-*` version
together, then run `pnpm run check` before trusting it.
