# OpenCode Hooks

> Part of [`hooks/`](../README.md) — see also [`src/hooks/`](../../src/hooks/README.md) for installation code

## Specifics

- TypeScript plugin targeting the **OpenCode v2** plugin API (`@opencode/plugin`, `Plugin.define`)
- Registers a `ctx.tool.hook("execute.before")` hook, calls `rtk rewrite` as a subprocess (`node:child_process`, 2s timeout)
- Honours the `rtk rewrite` exit-code contract: `0`/`3` + stdout → rewrite, anything else → pass through unchanged
- Replaces `event.input.command` for the `bash` tool when the rewrite differs from the original
- Disables itself at `setup` if `rtk` is not on `PATH`

## Install

### As a Git plugin (recommended for v2)

Add to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "github:iqhive/rtk#opencode-v2.0.0::path:hooks/opencode"
  ]
}
```

or:

```bash
opencode plugin add 'github:iqhive/rtk#opencode-v2.0.0::path:hooks/opencode'
```

Use `#v2` instead of the tag to track the `v2` branch.

### Via `rtk init`

`rtk init -g --opencode` copies `rtk.ts` to `~/.config/opencode/plugins/rtk.ts`, which OpenCode v2 discovers as a local plugin.

> The v1 plugin API (`@opencode-ai/plugin`, `tool.execute.before` hook object) is not supported by this file; OpenCode v1 users should stay on the `develop` branch.
