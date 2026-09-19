import { Plugin } from "@opencode/plugin"
import { spawn } from "node:child_process"

// RTK OpenCode plugin (OpenCode v2 API) — rewrites bash commands to use rtk
// for token savings.
// Requires: rtk >= 0.23.0 in PATH.
//
// This is a thin delegating plugin: all rewrite logic lives in `rtk rewrite`,
// which is the single source of truth (src/discover/registry.rs).
// To add or change rewrite rules, edit the Rust registry — not this file.
//
// Exit code contract for `rtk rewrite`:
//   0 + stdout  Rewrite found → mutate command
//   1           No RTK equivalent → pass through unchanged
//   3 + stdout  Rewrite (advisory) → mutate command

const REWRITE_TIMEOUT_MS = 2_000
// RTK_OPENCODE_DEBUG=1 logs every rewrite decision (agent, tool, before → after).
const DEBUG = process.env.RTK_OPENCODE_DEBUG === "1"

// Only shell-execution tools are rewritten. Every other tool (read, glob,
// grep, FlowDeck's planning-state / codebase-state / repo-memory / task /
// load-rules / capture-lesson..., and anything named `fdx-*`) is left alone.
const SHELL_TOOLS = new Set(["bash", "shell"])
const IGNORED_TOOL_PREFIXES = ["fdx-"]
const IGNORED_TOOLS = new Set([
  "read",
  "read_file",
  "view",
  "glob",
  "grep",
  "search",
  "planning-state",
  "codebase-state",
  "repo-memory",
  "load-rules",
  "list-rules",
  "task",
  "capture-lesson",
  "review-lessons",
])

function isIgnoredTool(tool: string): boolean {
  if (IGNORED_TOOLS.has(tool)) return true
  return IGNORED_TOOL_PREFIXES.some((prefix) => tool.startsWith(prefix))
}

// Commands invoking an `fdx-*` binary are FlowDeck-native; never rewrite them.
function isIgnoredCommand(command: string): boolean {
  const first = command.trimStart().split(/\s+/, 1)[0] ?? ""
  const binary = first.split("/").pop() ?? first
  return IGNORED_TOOL_PREFIXES.some((prefix) => binary.startsWith(prefix))
}

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

    const cwd = ctx.location.directory

    await ctx.tool.hook("execute.before", async (event) => {
      const tool = event.tool.toLowerCase()
      if (isIgnoredTool(tool) || !SHELL_TOOLS.has(tool)) {
        if (DEBUG) console.warn(`[rtk] skip tool=${event.tool} agent=${event.agent}`)
        return
      }

      const input = event.input
      if (!input || typeof input !== "object") return

      const command = (input as Record<string, unknown>).command
      if (typeof command !== "string" || !command) return
      if (isIgnoredCommand(command)) {
        if (DEBUG) console.warn(`[rtk] skip fdx command agent=${event.agent}: ${command}`)
        return
      }

      const rewritten = await rewriteCommand(command, cwd)
      if (DEBUG) {
        console.warn(
          `[rtk] tool=${event.tool} agent=${event.agent}: ${JSON.stringify(command)} -> ${
            rewritten ? JSON.stringify(rewritten) : "(unchanged)"
          }`,
        )
      }
      if (rewritten) {
        event.input = { ...(input as Record<string, unknown>), command: rewritten }
      }
    })
  },
})
