One package, plus the bundle that mounts it:

| Path | Role |
|---|---|
| `.` (this package) | the plugin — registers the `hello_greet` tool and a system-prompt section |
| `bundle/` | the profile bundle — a patch layer that mounts the plugin into a dsh composition |
