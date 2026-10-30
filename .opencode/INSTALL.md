# Installing KotlinComposeKit for OpenCode

## Prerequisites

- [OpenCode](https://opencode.ai) V1 1.18.29 or newer, or V2 2.0.22 or newer

## Installation

### Windows PowerShell

Run this command in PowerShell 5.1 or newer, from any directory:

```powershell
irm https://raw.githubusercontent.com/SoufianoDev/KotlinComposeKit/main/scripts/install-opencode.ps1 | iex
```

The PowerShell installer checks that OpenCode is installed, detects its major
version, and calls OpenCode's native global plugin installer.

### macOS and Linux

Run this command from any directory:

```sh
tmp="$(mktemp)" &&
trap 'rm -f "$tmp"' EXIT &&
curl -fsSL https://raw.githubusercontent.com/SoufianoDev/KotlinComposeKit/main/scripts/install-opencode.sh -o "$tmp" &&
sh "$tmp"
```

The shell installer performs the same version check and invokes the matching
native global plugin command.

Both installers support:

- OpenCode V1 1.18.29 or newer.
- OpenCode V2 2.0.22 or newer.

The plugin is installed globally, so it is available across projects. The
installers do not modify project files or manually rewrite your OpenCode JSON
configuration. OpenCode's own CLI manages the global plugin entry.

To install or update manually, use the matching native command:

- V1: `opencode plugin 'kotlin-compose-kit@git+https://github.com/SoufianoDev/KotlinComposeKit.git' --global`
- V2: `opencode plugin add github:SoufianoDev/KotlinComposeKit` (adds the plugin to global configuration by default)

Restart OpenCode after installation if it is already running.

## Verify

On V2, use `opencode plugin list` to check that `kotlin-compose-kit` is loaded and `opencode api skill.list` to inspect discovered skills. On V1, use `opencode debug skill`.

You can also use OpenCode's native `skill` tool, or ask a routing question such as:

```text
Which KotlinComposeKit module should I use to review this Compose state model?
```

For broad Kotlin, Android, JVM, or Jetpack Compose tasks, the agent should start with `using-kotlin-compose-kit` and then load the focused skill for the task.

OpenCode uses its own plugin install. If you also use Claude Code, Codex, or another harness, install KotlinComposeKit separately for each one.

## Updating

On V2, run `opencode plugin update` with the configured package target to update this plugin:

```sh
opencode plugin update 'kotlin-compose-kit@git+https://github.com/SoufianoDev/KotlinComposeKit.git'
```

On V1, OpenCode installs git-backed plugin specs through its plugin manager. Some OpenCode and Bun versions pin resolved git dependencies in a lockfile or cache, so a restart may not pick up the newest commit. If updates do not appear, reinstall the plugin.

To pin a release, append `#<release-tag>` to the package spec. Choose a release that supports your OpenCode version; releases containing only the V1 plugin do not load on V2.

## Troubleshooting

### Plugin not loading

1. Check `opencode --version` against the minimum versions above.
2. Verify the `plugin` (V1) or `plugins` (V2) entry in your configuration.
3. On V2, run `opencode api plugin.list` for load status and error details. On V1, inspect logs from `opencode debug skill --print-logs`.

### Skills not found

1. Use the native `skill` tool to list discovered skills
2. Check that the plugin is loading
3. Restart OpenCode after changing plugin configuration

On V2, a local checkout can also supply skills directly:

```json
{
  "skills": ["/absolute/path/to/KotlinComposeKit/skills"]
}
```

This uses native skill discovery without the plugin's routing guidance.

## Getting Help

- Report issues: https://github.com/SoufianoDev/KotlinComposeKit/issues
- Repository: https://github.com/SoufianoDev/KotlinComposeKit
