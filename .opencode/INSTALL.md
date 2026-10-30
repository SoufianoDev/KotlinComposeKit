# Installing KotlinComposeKit for OpenCode

## Requirements

- OpenCode V2 2.1.2 or newer for the native installation command below.
- OpenCode V1 1.18.29 or newer remains supported through the legacy `server` entrypoint.

## Install

### OpenCode V2

Run this command in any directory:

```sh
opencode plugin add github:SoufianoDev/KotlinComposeKit
```

OpenCode downloads the GitHub package, installs its dependencies, and adds it
to the global plugin configuration. Restart OpenCode if it was already running.

### OpenCode V1

Use OpenCode V1's legacy plugin manager command:

```sh
opencode plugin 'kotlin-compose-kit@git+https://github.com/SoufianoDev/KotlinComposeKit.git' --global
```

The V1 `server` entrypoint remains available for existing V1 installations.
Do not use the V2 `plugin add` command as a substitute for this V1 command.

## Verify

On V2, list installed plugins:

```sh
opencode plugin list
```

Check the plugin runtime status and discovered skills:

```sh
opencode api plugin.list
opencode api skill.list
```

On V1, use:

```sh
opencode debug skill
```

The skills list should include `using-kotlin-compose-kit` and the repository's
focused Kotlin, Android, JVM, and Jetpack Compose modules.

## Update

On V2, check for and install package updates:

```sh
opencode plugin check
opencode plugin update kotlin-compose-kit
```

V1 uses its legacy Git-backed plugin manager. If a restart does not pick up a
new revision, reinstall the plugin with the V1 command above.

## Remove

On V2, remove the plugin from the global configuration:

```sh
opencode plugin remove kotlin-compose-kit
```

On V1, remove the KotlinComposeKit entry from the global `plugin` configuration.

## Troubleshooting

For V2:

1. Confirm that `opencode --version` reports V2 2.1.2 or newer.
2. Run `opencode plugin list` and inspect the plugin status.
3. Run `opencode api plugin.list` to inspect load failures.
4. Run `opencode api skill.list` to check whether the skill catalog was registered.
5. Restart OpenCode after changing plugin configuration.

For V1, confirm that `opencode --version` reports V1 1.18.29 or newer and
inspect plugin diagnostics with `opencode debug skill --print-logs`.

Report issues at
https://github.com/SoufianoDev/KotlinComposeKit/issues.

See the official [OpenCode V2 plugin management documentation](https://opencode.ai/v2/docs/plugins)
for the V2 package installation and management commands.
