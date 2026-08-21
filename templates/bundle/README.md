# @example/dsh-bundle-hello

The profile bundle for `@example/dsh-plugin-hello`. Its substance is
`cordis.patch.yml` — a patch layer that inserts the plugin's row into a dsh
composition.

A bundle is any npm package whose manifest declares:

```json
{ "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
```

## Installing it

```sh
pnpm run pack:bundle                      # from the repository root
dsh plugin --profile <name> add ./example-dsh-bundle-hello-0.0.0.tgz
dsh --profile <name> --dump-config        # confirm the row landed
```

`dsh plugin` appends this package to the profile's `dsh.profile.bundles`, and
every later boot applies the patch. The plugin package comes along as this
bundle's dependency, which is what makes its bare name resolvable from the
profile.

## Layer position

Bundle layers sit **below** both user layers, so a user can always override or
disable the row from `$DSH_HOME/profiles/<name>/cordis.patch.yml` or
`$DSH_HOME/cordis.patch.yml` without editing this package. Keep the row `id`
stable: renaming it orphans those overrides silently, because a patch naming an
unknown id is only a stderr warning.

Full layer order and the config-replacement semantics are in
[docs/loading-into-dsh.md](../../../docs/loading-into-dsh.md).
