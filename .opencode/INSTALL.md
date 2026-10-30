# Installing KotlinComposeKit for OpenCode

## Prerequisites

- [OpenCode](https://opencode.ai) V1 1.18.29 or newer, or V2 2.0.22 or newer

## Installation

Add the plugin to your `opencode.json` or `opencode.jsonc`, either globally or in a project.

### OpenCode V2

Use the `plugins` array:

```json
{
  "plugins": ["kotlin-compose-kit@git+https://github.com/SoufianoDev/KotlinComposeKit.git"]
}
```

### OpenCode V1

Use the `plugin` array:

```json
{
  "plugin": ["kotlin-compose-kit@git+https://github.com/SoufianoDev/KotlinComposeKit.git"]
}
```

Restart OpenCode. The plugin installs through OpenCode's plugin manager, registers the repository's skills, and adds short routing guidance for Kotlin, Android, JVM, and Jetpack Compose tasks.

V1 retains its existing user-message guidance. V2 adds the guidance to each outgoing agent request's system context without changing stored conversation history. Skills marked `disable-model-invocation: true` remain available for explicit loading and are not advertised for automatic invocation in V2.

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
