# @rdmu/create-dsh-plugin

Scaffold a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
plugin project.

```sh
pnpm create @rdmu/dsh-plugin my-plugin
cd my-plugin
pnpm install
pnpm run check
```

The generated project is a working plugin — one model-facing tool, one
system-prompt section, a profile bundle that mounts it, the full dsh toolchain,
and documentation an agent can follow without reading dsh's source.

## The version is the contract

**This package's version IS the dsh version it targets.** `@rdmu/create-dsh-plugin@0.1.0-rc.7`
generates a project pinned to `@deepseek-ai/dsh-*@0.1.0-rc.7`, exactly — no caret.
There is no `--dsh-version` flag, because that would be a second source of truth
for one fact.

```sh
pnpm create @rdmu/dsh-plugin@0.1.0-rc.8 my-plugin   # target a different dsh release
```

dsh packages are cut as one set and are not independently compatible, so an exact
pin is the honest range: a caret would let a project install a dsh this scaffold
was never tested against.

## Options

```
create-dsh-plugin <directory> [options]

  --scope <scope>   npm scope for generated packages, e.g. @acme
  --plugin <name>   role name for the example plugin (default: hello)
  --force           write into a directory that already has contents
  -V, --version     the scaffold version, which is also the targeted dsh version
```

`--plugin word-count` renames the package, its directory, the Cordis plugin name,
and the tool (`word_count_greet`) in one pass.

## `dsh-trace`

Also installed as a bin, and copied into every generated project as
`scripts/dsh-trace.ts`:

```sh
dsh-trace @deepseek-ai/dsh-tools
```

It prints where an installed dsh package's contract can actually be read — its
emitted `.d.ts` files (which keep every JSDoc block, including `@mode` on events),
its README, and the upstream source URL for that exact release tag. This is the
answer to "how do I know what this service promises" without cloning
deepseek-harness.

## What the generated project contains

| Path | What it is |
|---|---|
| `packages/plugin/<name>/` | the plugin: `name` / `inject` / `Config` / `apply`, a typed tool, an invariant companion, and tests that mount real dsh services |
| `packages/bundle/<name>-bundle/` | the profile bundle — a `cordis.patch.yml` patch layer plus the `dsh.bundle` manifest declaration |
| `docs/plugin-authoring.md` | how to write a dsh plugin, self-contained |
| `docs/cordis-essentials.md` | Context, fibers, services, effects, waterfall `next()` |
| `docs/loading-into-dsh.md` | four routes to get the plugin running in a profile |
| `docs/tracing-dsh.md` | reading dsh contracts from installed dependencies |
| `AGENTS.md` | the conventions an agent must follow in that repository |
| toolchain | oxlint (type-aware), tsc project references, tsdown, vitest with per-file coverage thresholds, lefthook |

Compiler options, lint rules, code style, build pipeline, and test conventions are
copied from deepseek-harness, so a plugin developed in a generated project builds
under the same rules as dsh's own packages.

## Releasing

Two workflows. `ci.yml` runs on every push and PR: typecheck, lint, 100% coverage,
and build on both ends of the supported Node range, plus one `scaffold:smoke` run.

`release.yml` is the one button — **Actions → Release → Run workflow**:

| Input | Meaning |
|---|---|
| `dry_run` | run every gate and pack the tarball, publish nothing |
| `tag` | npm dist-tag; `next` for a prerelease (the default), `latest` for a stable one |

The version is **not** an input. It comes from the manifests, because this
package's version is the dsh version it targets — choosing it at release time
would create a second source of truth. To release: bump the three manifests in a
commit, then run the workflow.

Order of operations, cheapest failure first:

1. `verify-releasable` — the three manifests agree, the version is not already
   published, and the authenticated account may publish this name
2. `check` — typecheck, lint, test, build
3. `test:coverage` — the per-file 100% floor
4. `scaffold:smoke` — pack, install, generate from the PUBLISHED layout, and run
   the generated project's own checks
5. `pnpm publish --provenance` — the tarball carries an attestation linking it to
   this workflow and commit
6. `git tag v<version>` and push

One secret is required: **`NPM_TOKEN`**, an npm automation token for the account
that owns the `@rdmu` scope (Settings → Secrets and variables → Actions). A
granular token scoped to this package is enough. Run with `dry_run` first — it
exercises every gate without needing publish rights.

## Developing this scaffold

```sh
pnpm install
pnpm run check            # typecheck + lint + test (100% per-file coverage) + build
pnpm run scaffold:smoke   # pack, install, generate, and run the generated project's own check
pnpm run verify-releasable # can this version be published, and by you?
```

`scaffold:smoke` is the release gate: it exercises the PUBLISHED layout, which the
unit tests cannot reach. See [AGENTS.md](AGENTS.md) for how the template is split
across `packages/example/plugin-hello`, `templates/`, and `docs/`, and why.

## License

MIT
