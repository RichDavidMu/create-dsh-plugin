Two packages:

| Package | Role |
|---|---|
| `packages/plugin/hello` | the plugin — registers the `hello_greet` tool and a system-prompt section |
| `packages/bundle/hello-bundle` | the profile bundle — a patch layer that mounts the plugin into a dsh composition |
