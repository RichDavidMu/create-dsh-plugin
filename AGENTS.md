# AGENTS.md

`@rdmu/create-dsh-plugin` — the scaffold that generates DeepSeek Harness plugin
projects. Read [README.md](README.md) for what it does; this file is how to work
on it.

## The one contract that governs everything

**This package's version IS the dsh version generated projects depend on.**

There is no `--dsh-version` flag and there must never be one. A release of this
scaffold targets exactly one dsh release, pins it exactly (no caret), and is
tested against it. Three places state that version and `versions.spec.ts` asserts
they agree:

- the root `package.json`
- `packages/cli/create/package.json`
- `packages/example/plugin-hello/package.json`

Releasing a new dsh version means bumping all three, updating
`FRAMEWORK_VERSIONS` in `packages/cli/create/src/versions.ts` if Cordis or
schemastery moved, reinstalling, and running `pnpm run scaffold:smoke`.

## Releasing

`pnpm run verify-releasable` is the local preflight; the same script runs first in
CI so a duplicate version or an unownable name fails in seconds rather than after
the smoke test. `.github/workflows/release.yml` is the one button
(`workflow_dispatch`, with a `dry_run` input) and runs, in order:
verify-releasable → check → coverage → scaffold:smoke → `pnpm publish
--provenance` → tag.

The npm name is `@rdmu/create-dsh-plugin`; the unscoped `create-dsh-plugin` was
already taken on npm by an unrelated account. The **bin** stays
`create-dsh-plugin`, which is what makes `pnpm create @rdmu/dsh-plugin` work —
`npm create` drops the `create-` segment when resolving the package name.

Both workflows filter the package **by path** (`--filter ./packages/cli/create`),
never by name, so a future rename touches only manifests and prose.

Publishing needs the `NPM_TOKEN` repository secret. Everything else in the release
path is reproducible from a clean checkout.

## Layout, and why the template is split

```
packages/
  cli/create/              the scaffold CLI (published as `@rdmu/create-dsh-plugin`)
  example/plugin-hello/     the example plugin — a REAL workspace package
templates/
  root/                    generated-project root files
  bundle/                  the generated bundle package
docs/                      authoring guides, copied into generated projects
scripts/                   repository tooling
```

The template lives in three places for three distinct reasons. Do not "simplify"
this by merging them:

- **`packages/example/plugin-hello/` is a real workspace package** so this
  repository's own typecheck, lint, and tests cover the code the scaffold hands
  out. A template that only gets copied is a template nobody compiles.
- **`templates/root/` and `templates/bundle/` hold files whose real names would be
  picked up by this repository's tooling.** A `package.json` there would join the
  pnpm workspace; a `tsconfig.json` would be compiled; an `.oxlintrc.json` would
  be read as a nested lint config. Hence the prefixes: `__name` → `name`, and
  `_name` → `.name` (see `targetName` in `src/copy.ts`).
- **`docs/` is shared** between this repository's own links and every generated
  project.

`prepack` (`scripts/prepare-cli-package.ts`) collapses all three into the single
`template/` tree a published tarball carries, which is why
`resolveTemplateRoots()` has a published branch and a source branch.

## Commands

```sh
pnpm install
pnpm run check           # typecheck + lint + test + build
pnpm run test:coverage   # per-file 100%; every `v8 ignore` states why
pnpm run scaffold:smoke  # THE release gate — see below
pnpm run trace <pkg>     # where an installed dsh package's contract can be read
```

### `scaffold:smoke` is not optional before a release

`pnpm run test` generates from the SOURCE layout. Only `scaffold:smoke` builds,
packs a real tarball, installs it, generates from the PUBLISHED layout, and then
runs the generated project's own `pnpm run check`. It is the only thing that
catches a missing `files` entry, a broken `prepack`, or a stale `lib/`. It has
already caught one such bug; it exists because that class of failure is invisible
to every other check.

## Conventions

The toolchain and code style are deepseek-harness's, deliberately: a plugin
developed in a generated project should build under the same rules as dsh's own
packages, and this repository is the reference for what those rules are.

- No semicolons, single quotes, 2-space indent, trailing commas on multiline,
  140-column limit. Enforced by `pnpm run lint`.
- Every module and exported symbol carries JSDoc stating its non-obvious
  contract; function-like exports document `@param` and non-void `@returns`.
- Comments state contracts and consequences. Do not restate the code, narrate
  changes, or preserve review history.
- Per-file 100% coverage. Each `/* v8 ignore */` names why the branch is
  unreachable — an unexplained one is a bug, not a waiver.
- Tests describe behavior. When behavior should change, change the test with it.

### Template-specific rules

- **Every lowercase `hello` in the template must name this plugin.** Substitution
  is a word-bounded, case-sensitive replace, so prose may say `Hello` but an
  identifier-shaped `hello` that means something else would be corrupted on
  rename. `scaffold.spec.ts` asserts no template token survives a rename.
- **The template's tool is `hello_greet`**, replaced with `<snake_role>_greet`.
  Longest token first — see `substitute` in `src/copy.ts`.
- **Anything added to `templates/root/` needs a prefix decision.** If its real
  name would be seen by pnpm, tsc, oxlint, vitest, or npm, prefix it.
- **Bundle packages ship no JavaScript.** They are excluded from the generated
  `tsdown.config.ts` workspace glob; tsdown fails on a package whose entry glob
  matches nothing.

## Dependencies

The root `devDependencies` carry four dsh packages nothing here imports directly —
`dsh-attachment`, `dsh-brand`, `dsh-timeout`, `dsh-typert-protocol`. They are
transitive peers of the dsh packages the example plugin does use, and with
`autoInstallPeers: false` they must be declared or `tsc` cannot resolve the types.
This mirrors how a real dsh profile supplies them through its installation
fallback, so the example plugin's own manifest stays honest about what it imports.

Run `pnpm peers check` after changing dsh versions; a new unmet dsh peer belongs
in the root `devDependencies` and in `templates/root/__package.json`, not in the
example plugin's manifest.
