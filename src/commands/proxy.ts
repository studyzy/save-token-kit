import { join } from 'node:path'
import { bold, cyan, green, red } from 'ansis'
import { startProxy, stopProxy } from '../proxy/server.js'
import { SAVE_TOKEN_DIR, type ProxyCommandOptions } from '../types/index.js'

/**
 * Implement `stk proxy`: start a long-running transparent HTTP proxy that
 * records every CodeBuddy request/response pair to
 * `<cwd>/save-token/trace/<sessionId>/<timestamp>-{request,response}.json`.
 *
 * The proxy runs until the user presses Ctrl+C. The user is instructed to
 * point CodeBuddy at the proxy via CODEBUDDY_BASE_URL in a separate terminal.
 */
export async function runProxy(options: ProxyCommandOptions): Promise<void> {
  const traceDir = options.traceDir ?? join(process.cwd(), SAVE_TOKEN_DIR, 'trace')

  let proxy
  try {
    proxy = await startProxy({
      port: options.port,
      apiBaseUrl: options.upstream,
      traceDir,
    })
  } catch (err) {
    console.error(bold(red(`启动代理失败: ${(err as Error).message}`)))
    process.exitCode = 1
    return
  }

  console.log('')
  console.log(bold(green(`Proxy 监听: http://127.0.0.1:${proxy.port}`)))
  console.log(green(`Trace 目录: ${traceDir}`))
  console.log('')
  console.log(cyan('请在新终端执行以下命令启动 CodeBuddy：'))
  console.log('')
  console.log(`  export CODEBUDDY_BASE_URL=http://127.0.0.1:${proxy.port}/v2`)
  console.log(`  codebuddy`)
  console.log('')
  console.log(cyan('按 Ctrl+C 停止 Proxy'))

  await new Promise<void>((resolve) => {
    const onSigint = (): void => {
      process.off('SIGINT', onSigint)
      resolve()
    }
    process.on('SIGINT', onSigint)
  })

  console.log('')
  console.log(bold(green('正在关闭 Proxy...')))
  await stopProxy(proxy)
  console.log(green('已停止'))
}
