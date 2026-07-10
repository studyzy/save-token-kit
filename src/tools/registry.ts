import type { SaveTokenTool } from './types.js'

const toolRegistry = new Map<string, SaveTokenTool>()

export function registerTool(tool: SaveTokenTool): void {
  toolRegistry.set(tool.name, tool)
}

export function getTool(name: string): SaveTokenTool | undefined {
  return toolRegistry.get(name)
}

export function getAllTools(): SaveTokenTool[] {
  return Array.from(toolRegistry.values())
}

export function getToolIds(): string[] {
  return Array.from(toolRegistry.keys())
}
