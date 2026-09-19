# OpenCode Hooks

> Part of [`hooks/`](../README.md) — see also [`src/hooks/`](../../src/hooks/README.md) for installation code

## Specifics

- TypeScript plugin targeting the **OpenCode v2** plugin API (`@opencode/plugin`, `Plugin.define`)
- Registers a `ctx.shell.hook("create.before")` hook, calls `rtk rewrite` as a subprocess (`node:child_process`, 2s timeout)
- Honours the `rtk rewrite` exit-code contract: `0`/`3` + stdout → rewrite, anything else → pass through unchanged
- Replaces `invocation.command` right before OpenCode spawns the shell process when the rewrite differs from the original
- Disables itself at `setup` if `rtk` is not on `PATH`

## Install

### As a Git plugin (recommended for v2)

The repo root `package.json` (on the `v2` branch) exports this file, so the repo itself is installable as an npm Git package.

Add to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "github:iqhive/rtk#opencode-v2.0.2"
  ]
}
```

or:

```bash
opencode plugin add 'github:iqhive/rtk#opencode-v2.0.2'
```

Use `#v2` instead of the tag to track the `v2` branch.

### Via `rtk init`

`rtk init -g --opencode` copies `rtk.ts` to `~/.config/opencode/plugins/rtk.ts`, which OpenCode v2 discovers as a local plugin.

> The v1 plugin API (`@opencode-ai/plugin`, `tool.execute.before` hook object) is not supported by this file; OpenCode v1 users should stay on the `develop` branch.

## Scope

The hook fires only when OpenCode actually spawns a shell: the `shell` tool and `!cmd` terminal input. Non-shell tools (`read`, `grep`, `fdx-*`, FlowDeck's `planning-state`/`repo-memory`/..., `subagent`) never reach it, and tool-level guards from other plugins always see the command as the model wrote it, regardless of plugin order. Commands `rtk rewrite` doesn't know (e.g. `fdx-read x`) pass through unchanged.

Note that OpenCode's own `permission.shell` rules are evaluated after this hook, so they match against the rewritten command (`rtk git status`, not `git status`); pattern rules need an `rtk *` counterpart.

## Debugging

Set `RTK_OPENCODE_DEBUG=1` before launching OpenCode to log every rewrite decision to stderr (`[rtk] "<cmd>" -> "<rewritten>"`).
