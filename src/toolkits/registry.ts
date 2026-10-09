import type { SaveTokenToolkit } from './types.js'

const toolkitRegistry = new Map<string, SaveTokenToolkit>()

export function registerToolkit(toolkit: SaveTokenToolkit): void {
  toolkitRegistry.set(toolkit.name, toolkit)
}

export function getToolkit(name: string): SaveTokenToolkit | undefined {
  return toolkitRegistry.get(name)
}

export function getAllToolkits(): SaveTokenToolkit[] {
  return Array.from(toolkitRegistry.values())
}

export function getToolkitIds(): string[] {
  return Array.from(toolkitRegistry.keys())
}
