# Loading your plugin into dsh

A dsh application is composed entirely from **patch layers** applied over an
empty entry list. Getting your plugin to run means getting one row inserted into
that composition — and making sure the package behind the row is resolvable.

## The profile

```
$DSH_HOME/                          # $DSH_HOME, else ~/.dsh
  cordis.patch.yml                  # machine-level user layer (every profile)
  profiles/
    node_modules/                   # installation fallback, maintained on every boot
    <name>/
      package.json                  # dependencies + dsh.profile.bundles (ordered layers)
      cordis.patch.yml              # this profile's user layer
      pnpm-workspace.yaml           # nodeLinker: hoisted, autoInstallPeers: false
      node_modules/                 # what pnpm installed for this profile
      cordis.yml                    # rewritten to `[]` on every boot — do not edit
```

Layer order at boot, later winning per row:

1. bundle layers, in `dsh.profile.bundles` order
2. `profiles/<name>/cordis.patch.yml`
3. `$DSH_HOME/cordis.patch.yml` — machine-level, so it outranks the per-profile one
4. `--patch` overlays, in argv order

`cordis.yml` inside the profile is **not** where the tree lives; it is rewritten
to an empty list on every boot. Edit `cordis.patch.yml`.

## Route A — fastest local check

If your plugin is already resolvable by bare name (see *Resolution* below), add
a row to `$DSH_HOME/cordis.patch.yml`:

```yaml
- insert:
    - id: plugin-hello
      name: '@acme/dsh-plugin-hello'
      config:
        defaultLanguage: zh
```

This layer is **hot-reloaded**: dsh watches the file and recomposes without a
restart. It is the tightest loop available for iterating on config.

## Route B — a throwaway overlay

```sh
dsh --profile tui --patch ./my-overlay.yml
```

`--patch` is repeatable and applies in argv order, above both user layers.
Launcher flags must come **before** the app's own arguments: parsing stops at the
first token the launcher does not recognize. Note that `--patch` files are read
once at startup — unlike the two `cordis.patch.yml` layers, editing them requires
a restart.

## Route C — a bundle, the distributable form

A **bundle** is an npm package whose manifest declares a patch file:

```json
{ "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
```

Install it into a profile:

```sh
pnpm run pack:bundle                                   # build + pack the tarball
dsh plugin --profile tui add ./acme-dsh-bundle-hello-0.0.0.tgz
```

`dsh plugin` is a thin pnpm forwarder: it initializes the profile if needed, runs
`pnpm <args>` with cwd set to the profile directory, then reconciles
`dsh.profile.bundles` against what is actually installed — any dependency
resolving to a package that declares `dsh.bundle` joins the layer stack.

Three things that bite:

- **It requires pnpm on `PATH`** and exits 127 without it. Only this command does;
  booting a profile does not.
- **Relative paths must start with `./`.** pnpm's cwd is the profile directory, so
  a bare `foo.tgz` is looked up there. A `./`-prefixed path is rewritten to an
  absolute one against your invoking directory.
- **pnpm ≥10 blocks a git dependency's build script** until you allowlist it under
  `allowBuilds` in the profile's `pnpm-workspace.yaml`.

## Route D — no pnpm at all

Only two things actually have to be true: the package resolves by bare name from
the profile, and its name is in `dsh.profile.bundles`. So:

```sh
DIR="${DSH_HOME:-$HOME/.dsh}/profiles/tui"
mkdir -p "$DIR/node_modules/@acme/dsh-bundle-hello"
tar -xzf acme-dsh-bundle-hello-0.0.0.tgz --strip-components=1 \
    -C "$DIR/node_modules/@acme/dsh-bundle-hello"
# then add "@acme/dsh-bundle-hello" to dsh.profile.bundles in $DIR/package.json
```

A hand-added entry survives later `dsh plugin` runs: reconciliation only removes
names it manages as dependencies.

## Resolution: why your peers are not your problem

Two directories serve bare-name resolution, checked in Node's ordinary
parent-walk order:

1. `profiles/<name>/node_modules` — what pnpm installed for this profile.
2. `profiles/node_modules` — the **installation fallback**, rebuilt on every boot
   with one symlink per package in the dsh app's resolvable dependency closure
   (following both `dependencies` and `peerDependencies`).

That second directory is why your plugin must declare dsh packages as
`peerDependencies` and must **not** install its own copies. The profile's
`autoInstallPeers: false` plus the `hoisted` linker means your unfilled peers fall
through to the fallback and you share the host's single Cordis instance and its
single copy of each Service Definition. Bundle your own and you get two module
singletons: your plugin registers into a registry nobody reads.

## Overriding a row — the deep-merge trap

An id-targeted patch **replaces** the matched `config` wholesale. It does not
merge. So this:

```yaml
- id: tool-web
  config:
    searchTimeoutMs: 90000
```

does not just change the timeout — it drops every other field the bundle set,
including `fetch: false`. Restate what you keep:

```yaml
- id: tool-web
  config:
    fetch: false
    searchTimeoutMs: 90000
```

Other patch fields work the same way, addressed by `id`:

```yaml
- id: plugin-hello
  disabled: true            # turn a row off without uninstalling
```

Two quiet failure modes: a patch naming an `id` that is not in the composed tree
is only a **stderr warning**, so a typo silently does nothing; and a file that is
empty or comments-only **throws**, because it parses to nothing rather than to a
list — write `[]` to disable a layer.

You can add `name:` alongside `id:` as an assertion — a mismatch against the
target row's actual package name skips the patch with a warning instead of
applying it to the wrong row.

## Verify before you debug

```sh
dsh --profile tui --dump-config
```

This prints the composed tree through the **same** compose call that boot uses,
annotated with which file and layer each row came from. If your row is not there,
the problem is composition, not your code. `--dump-default-config` prints the
bundle layers only, without user layers or overlays.

Then confirm the plugin actually mounted and its tool is registered — ask the
running agent, or check that the tool appears in its available tools.
