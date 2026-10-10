import { buildRegistry, type DataToolkit } from './data-registry.js'
import { loadRules } from '../rules/loader.js'

/**
 * 模块级缓存：进程内构建一次（复用 loadRules 的 merged 快照，与 diagnose 现状一致）。
 * registerToolkit 允许以同名 DataToolkit 覆盖数据驱动实例（测试注入 seam）。
 */
let cached: DataToolkit[] | null = null
const overrides = new Map<string, DataToolkit>()

export function getRegistry(): DataToolkit[] {
  if (!cached) cached = buildRegistry(loadRules())
  const merged = cached.map((t) => overrides.get(t.name) ?? t)
  for (const [name, t] of overrides) {
    if (!cached.some((b) => b.name === name)) merged.push(t)
  }
  return merged
}

/** 测试/扩展 seam：以自定义实现覆盖同名数据驱动 toolkit。 */
export function registerToolkit(toolkit: DataToolkit): void {
  overrides.set(toolkit.name, toolkit)
}

export function getToolkit(name: string): DataToolkit | undefined {
  return getRegistry().find((t) => t.name === name)
}

export function getAllToolkits(): DataToolkit[] {
  return getRegistry()
}

export function getToolkitIds(): string[] {
  return getRegistry().map((t) => t.name)
}
