import path from "node:path"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { TuiPlugin, TuiCommand, TuiPluginModule } from "@opencode-ai/plugin/tui"

type KeyflowConfig = {
  flows: Keyflow[]
}

type Keyflow = {
  title: string
  value?: string
  description?: string
  category?: string
  keybind?: string
  commands: string[]
}

const DEFAULT_CONFIG: KeyflowConfig = {
  flows: [
    {
      title: "Copy last assistant message and open editor",
      value: "keyflow.copy-last-and-open-editor",
      description: "Runs built-ins: copy last assistant message, then open editor",
      category: "Session",
      keybind: "ctrl+x y",
      commands: ["messages.copy", "prompt.editor"],
    },
  ],
}

function runSequence(api: Parameters<TuiPlugin>[0], commands: string[]) {
  commands.forEach((command, index) => {
    setTimeout(() => {
      api.command.trigger(command)
    }, index * 25)
  })
}

async function pathExists(file: string) {
  return Boolean(await fs.stat(file).catch(() => undefined))
}

async function resolvePluginRoot(target: string) {
  const resolved = target.startsWith("file://") ? fileURLToPath(target) : target
  const stat = await fs.stat(resolved).catch(() => undefined)
  const seed = stat?.isDirectory() ? resolved : path.dirname(resolved)
  let current = path.resolve(seed)
  while (true) {
    if (await pathExists(path.join(current, "package.json"))) return current
    const parent = path.dirname(current)
    if (parent === current) return seed
    current = parent
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isKeyflow(value: unknown): value is Keyflow {
  return isRecord(value) && typeof value.title === "string" && isStringArray(value.commands)
}

async function loadConfig(meta: Parameters<TuiPlugin>[2]) {
  const pluginRoot = await resolvePluginRoot(meta.target)
  const configPath = path.join(pluginRoot, "keyflow.json")
  const loaded: unknown = await Bun.file(configPath)
    .json()
    .catch(() => undefined)
  if (!isRecord(loaded)) return DEFAULT_CONFIG
  if (!("flows" in loaded) || !Array.isArray(loaded.flows)) return DEFAULT_CONFIG
  const flows = loaded.flows.filter(isKeyflow)
  if (!flows.length) return DEFAULT_CONFIG
  return { flows }
}

export const KeyflowPlugin: TuiPlugin = async (api, _options, meta) => {
  const config = await loadConfig(meta)
  const commands: TuiCommand[] = config.flows.map((flow, index) => ({
    title: flow.title,
    description: flow.description,
    category: flow.category ?? "Keyflow",
    value: flow.value ?? `keyflow.${index + 1}`,
    keybind: flow.keybind,
    onSelect: () => runSequence(api, flow.commands),
  }))

  api.command.register(() => commands)
}

export default {
  id: "keyflow",
  tui: KeyflowPlugin,
} satisfies TuiPluginModule
