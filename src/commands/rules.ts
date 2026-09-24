import {
  fetchRemotePack as fetchLatestVersion,
  installRaw as installLatest,
  metaPath,
  readInstalledVersion,
  readMeta,
  writeMeta,
} from '../rules/update.js'
import { RULES_HOME, loadRules } from '../rules/loader.js'

interface UpdateOptions {
  check?: boolean
  json?: boolean
}

interface UpdateOutput {
  action: 'updated' | 'up-to-date' | 'checked'
  from: string | null
  to: string | null
  latest: string | null
  error: string | null
}

function emit(out: UpdateOutput, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(out))
    return
  }
  if (out.action === 'updated') console.log(`规则库已更新: ${out.from} -> ${out.to}`)
  else if (out.action === 'up-to-date') console.log(`规则库已是最新: ${out.to}`)
  else if (out.error) console.log(`检查失败: ${out.error}`)
  else console.log(`发现新版本: ${out.latest} (当前 ${out.from ?? '未安装'})，运行 stk rules update 安装`)
}

function fail(out: UpdateOutput, json: boolean, error: string): void {
  if (json) console.log(JSON.stringify({ ...out, error }))
  else console.error(`Error: ${error}`)
  process.exitCode = 1
}

/**
 * `stk rules update [--check] [--json]` — download the single rules file into
 * ~/.stk/rules/stk-rules.json (FR-003), contract per contracts/cli-rules.md.
 */
export async function runRulesUpdate(options: UpdateOptions = {}): Promise<void> {
  const json = options.json ?? false
  const out: UpdateOutput = { action: 'checked', from: null, to: null, latest: null, error: null }

  const home = RULES_HOME
  const mPath = metaPath(home)
  const { raw, packVersion: latest, error } = await fetchLatestVersion()
  if (error || !latest) {
    fail(out, json, error ?? '未知错误')
    return
  }
  out.latest = latest
  const installed = readInstalledVersion(home) ?? readMeta(mPath).installedVersion ?? null
  out.from = installed

  if (options.check) {
    emit(out, json)
    return
  }
  if (installed === latest) {
    out.action = 'up-to-date'
    out.to = latest
    writeMeta(mPath, { ...readMeta(mPath), lastCheckAt: new Date().toISOString() })
    emit(out, json)
    return
  }
  if (!raw) {
    fail(out, json, '下载内容为空')
    return
  }
  installLatest(raw, home)
  out.action = 'updated'
  out.to = latest
  writeMeta(mPath, {
    ...readMeta(mPath),
    lastCheckAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    installedVersion: latest,
  })
  emit(out, json)
}

/**
 * `stk rules status [--json]` — current rules state: active version, per-layer
 * load results, check/update timestamps and the auto-check switch (FR-010).
 */
export async function runRulesStatus(options: { json?: boolean } = {}): Promise<void> {
  const json = options.json ?? false
  const home = RULES_HOME
  const merged = loadRules()
  const meta = readMeta(metaPath(home))
  const installed = readInstalledVersion(home)

  if (json) {
    console.log(
      JSON.stringify({
        activeVersion: merged.rulesInfo.packVersion,
        fallbackInUse: merged.rulesInfo.fallbackInUse,
        sources: merged.rulesInfo.sources,
        libraryInstalledVersion: installed,
        lastCheckAt: meta.lastCheckAt ?? null,
        lastUpdatedAt: meta.lastUpdatedAt ?? null,
        autoCheckDisabled: meta.autoCheckDisabled ?? false,
      }),
    )
    return
  }
  console.log(`生效规则库: ${merged.rulesInfo.packVersion}${merged.rulesInfo.fallbackInUse ? ' (内置兜底)' : ''}`)
  for (const s of merged.rulesInfo.sources) {
    console.log(`  ${s.layer.padEnd(8)} ${s.result}`)
  }
  console.log(`已装版本: ${installed ?? '无'} | 上次检查: ${meta.lastCheckAt ?? '从未'} | 上次更新: ${meta.lastUpdatedAt ?? '从未'}`)
  console.log(`自动检查: ${meta.autoCheckDisabled ? '关闭' : '开启 (24h)'}`)
}
