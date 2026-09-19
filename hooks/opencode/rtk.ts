import { Plugin } from "@opencode/plugin"
import { spawn } from "node:child_process"

// RTK OpenCode plugin (OpenCode v2 API) — rewrites shell commands to use rtk
// for token savings.
// Requires: rtk >= 0.23.0 in PATH.
//
// This is a thin delegating plugin: all rewrite logic lives in `rtk rewrite`,
// which is the single source of truth (src/discover/registry.rs).
// To add or change rewrite rules, edit the Rust registry — not this file.
//
// The rewrite happens in OpenCode's `shell.create.before` hook, which fires
// once per actual process spawn (the `shell` tool and `!cmd` terminal input),
// after every `tool.execute.before` hook has run. Non-shell tools (read, grep,
// fdx-*, ...) never reach this hook, and tool-level guards always inspect the
// command as the model wrote it.
//
// Exit code contract for `rtk rewrite`:
//   0 + stdout  Rewrite found → mutate command
//   1           No RTK equivalent → pass through unchanged
//   3 + stdout  Rewrite (advisory) → mutate command

const REWRITE_TIMEOUT_MS = 2_000
// RTK_OPENCODE_DEBUG=1 logs every rewrite decision (before → after).
const DEBUG = process.env.RTK_OPENCODE_DEBUG === "1"

interface ExecResult {
  code: number | null
  stdout: string
}

function exec(args: string[], cwd?: string): Promise<ExecResult | null> {
  return new Promise((resolve) => {
    let stdout = ""
    const child = spawn("rtk", args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: REWRITE_TIMEOUT_MS,
    })
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    child.on("error", () => resolve(null))
    child.on("close", (code, signal) => {
      if (signal) {
        resolve(null)
        return
      }
      resolve({ code, stdout })
    })
  })
}

async function rewriteCommand(command: string, cwd?: string): Promise<string | null> {
  const result = await exec(["rewrite", command], cwd)
  if (!result) return null
  if (result.code !== 0 && result.code !== 3) return null
  const rewritten = result.stdout.trim()
  if (!rewritten || rewritten === command) return null
  return rewritten
}

export default Plugin.define({
  id: "rtk",
  async setup(ctx) {
    const probe = await exec(["--version"])
    if (!probe || probe.code !== 0) {
      console.warn("[rtk] rtk binary not found in PATH — plugin disabled")
      return
    }

    await ctx.shell.hook("create.before", async (invocation) => {
      const command = invocation.command
      if (!command) return

      const rewritten = await rewriteCommand(command, invocation.cwd || ctx.location.directory)
      if (DEBUG) {
        console.warn(
          `[rtk] ${JSON.stringify(command)} -> ${rewritten ? JSON.stringify(rewritten) : "(unchanged)"}`,
        )
      }
      if (rewritten) invocation.command = rewritten
    })
  },
})
