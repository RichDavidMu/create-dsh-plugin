# Reading dsh, where the guides stop

The authoring guides cover the common path; dsh is larger than any guide can be.
Whenever you would otherwise guess — an unfamiliar `ctx.<service>`, an event's
mode, a field you half-remember, why a guard exists — read it instead. Two kinds
of question, two routes, both local:

| Question | Route |
|---|---|
| what does this **promise**? | the installed declarations — the JSDoc in `lib/types/*.d.ts` IS the contract |
| how does it **work**, and what calls what? | the code graph over the pinned release's source |

Nothing here needs a manual clone of deepseek-harness or a browser.

## 1. The code graph — implementation, indexed

This project pins one dsh release. `postinstall` fetches that release's full
source to `.dsh-source/dsh-v<version>/` and indexes it with
[codegraph](https://github.com/colbymchenry/codegraph) as its own project, so
implementation questions are answered from a graph rather than by reading files
one at a time.

```sh
pnpm run dsh:graph             # fetch + index; a repeat run only syncs the project graph
pnpm run dsh:graph --dry-run   # what it would do, and where the source comes from
pnpm run dsh:graph --force     # refetch and rebuild both graphs from scratch
```

First run costs roughly a minute and ~340 MB on disk (~80 MB of source, the rest
index). Later runs cost seconds: the snapshot is immutable so its graph is left
alone, while your own graph is synced from what changed. Both directories are
gitignored — the tag reproduces the artifact exactly, and committing a
machine-local SQLite index would only rot. `DSH_GRAPH=0 pnpm install` skips the
step entirely; `--dry-run` keeps working even then, which is how CI can assert
what this resolves without a network.

It needs the `codegraph` CLI (`npm i -g @colbymchenry/codegraph`, or the installer
in that repository), `git`, and a network for the first fetch. Missing any of
them is a warning, never a failed install: `pnpm install` still succeeds and
prints what to do.

### Asking it

From an agent, use the codegraph MCP tools with `projectPath` set to the snapshot
directory — `.mcp.json` in this project already wires the server, and the
`dsh-source` skill under `.claude/skills/` carries the workflow. The CLI is
equivalent:

```sh
codegraph explore 'how tool timeouts are enforced' --path .dsh-source/dsh-v<version>
codegraph node defineTool --path .dsh-source/dsh-v<version>
codegraph callers validateArgs --path .dsh-source/dsh-v<version>
```

Ask about behavior, not about files. One `explore` returns the relevant symbols'
verbatim source, the call paths between them, a blast radius naming every caller,
and the tests that cover each — and dsh's own tests are usually the best statement
of how something is meant to be used.

Your plugin is a **separate** graph, queried without `projectPath`. `pnpm run
dsh:graph` re-syncs it from what changed, in about a second, so it describes the
code as it is now rather than as the template shipped it. That split is
deliberate: your own `impact` and `affected` should not drag all of dsh into every
blast radius.

## 2. `pnpm run trace` — every route for one package

```sh
pnpm run trace @deepseek-ai/dsh-tools @deepseek-ai/dsh-system-prompt
```

```
@deepseek-ai/dsh-tools@0.1.0-rc.7
  installed at   /path/node_modules/.pnpm/@deepseek-ai+dsh-tools@0.1.0-rc.7_<hash>/node_modules/@deepseek-ai/dsh-tools
  contract       10 declaration file(s) — the JSDoc here IS the contract:
                 /path/.../lib/types/index.d.ts
                 ...
  README         /path/.../README.md
  source         https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.7/packages/core/tools
  snapshot       /project/.dsh-source/dsh-v0.1.0-rc.7
```

Run it before grepping, because the paths are not where you would guess them.
Every dsh package is declared by the plugin package rather than by the workspace
root, so it resolves under that package's own `node_modules/@deepseek-ai/`, and
that entry is a symlink into pnpm's store. The path typed from memory —
`node_modules/@deepseek-ai/dsh-tools/…` at the project root — matches nothing.

Which names are traceable: every `@deepseek-ai/*` in the plugin's `package.json`,
which `ls packages/*/*/node_modules/@deepseek-ai` lists. They are already
installed, including the services this plugin does not use.

## 3. Emitted declarations — the contract, on disk

The published tarballs keep **every JSDoc block** in their `.d.ts` files,
including `@mode` on events and `@param`/`@returns` on service methods. For a
contract question this beats the graph: it is the promise itself, and it is
greppable.

```
packages/*/*/node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts
packages/*/*/node_modules/@deepseek-ai/dsh-tools/lib/types/schema.d.ts       ← defineTool options
packages/*/*/node_modules/@deepseek-ai/dsh-tools/lib/types/presentation.d.ts ← card view types
```

What you get there that no summary carries: the exact `DefineToolOptions` fields
with their documented purpose, the `Context`/`Events` declaration merges that
tell you which `ctx.<key>` and which waterfall event names exist, and the
`@mode` tag on each event that tells you whether a listener must call `next()`.

Grep it directly. The glob is written over `packages/*/*` rather than one package
path because it has to hold wherever this file is read — a plugin lives under
`packages/plugin/`, the scaffold's own copy under `packages/example/` — and it
follows the symlinks either way:

```sh
# Which events can I hook, and in what mode?
grep -rn "@mode" packages/*/*/node_modules/@deepseek-ai/*/lib/types/*.d.ts

# Which ctx keys does each package publish?
grep -rn -A 4 "interface Context" packages/*/*/node_modules/@deepseek-ai/*/lib/types/*.d.ts

# What does one service actually expose?
grep -n "^\s*\(readonly \)\?[a-z][A-Za-z]*(" packages/*/*/node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts
```

## 4. Package READMEs — role, config, and model cost

Each tarball ships `README.md` and `README.zh.md`. The dsh convention puts a
package's role, its config keys, its known limitations, and its **Model
Experience** there — what the model sees, the token effect, and the KV-cache
effect. That last part exists nowhere else and is what you need when deciding
whether your plugin's contribution is cheap or expensive.

```
packages/*/*/node_modules/@deepseek-ai/dsh-tools/README.md
```

## 5. Upstream, addressed rather than fetched

The published tarball does **not** contain `src/`, even though its `exports`
declares a `./src/*` subpath — that entry serves workspace consumers inside
deepseek-harness itself. The snapshot in `.dsh-source/` is that source; the URL
below is the same tree, for linking in a review or reading in a browser:

```
https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v<version>/<repository.directory>
```

Both halves come from the installed manifest: `repository.url` gives the remote,
`repository.directory` gives the package's path in the monorepo, and the tag is
`dsh-v` followed by the version — which is exactly how `pnpm run dsh:graph`
decides what to clone, so the snapshot can never be a different release than the
one this project depends on. For `@deepseek-ai/dsh-tools@0.1.0-rc.7`:

```
https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.7/packages/core/tools
```

Alongside `src/` and `tests/`, the repository carries material the tarballs omit
and that is often the real answer — and the snapshot has all of it locally:
`docs/architecture.md`, `docs/cordis-primer.md`, `docs/defensive-patterns.md`,
`docs/testing.md`, the `docs/cookbook/` guides, generated catalogs like
`docs/tool-catalog.md`, and the Agent Notes under `.agents/notes/` that record why
a design is the way it is. Those are prose, so read them directly rather than
through the graph.

## Working against a local dsh checkout

When you are developing a plugin in step with unreleased dsh changes, point the
dependency at a local clone instead of the registry:

```sh
pnpm add '@deepseek-ai/dsh-tools@file:../deepseek-harness/packages/core/tools'
```

Three cautions. dsh publishes built `lib/`, so a fresh clone needs
`pnpm install && pnpm run build:lib:host` in that checkout before a `file:`
dependency resolves. A local clone is a moving target: the version you eventually
ship against must be a released one, so revert to a registry range before
publishing. And the snapshot under `.dsh-source/` still holds the last released
tag, so index your checkout separately — `codegraph init ../deepseek-harness` —
rather than trusting the snapshot to describe your working copy.

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
together, run `pnpm run dsh:graph` so the snapshot follows the new tag, then
`pnpm run check` before trusting it. The old snapshot stays under `.dsh-source/`
beside the new one; delete it when you want the disk back.
