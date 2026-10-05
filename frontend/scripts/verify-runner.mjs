import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

// 把规则验证脚本打成单个 ESM 后在 Node 中执行：纯前端项目没有后端，规则全部在本地 store 里。
const outfile = join('node_modules', '.verify-claim.mjs')
await build({
  entryPoints: ['scripts/verify-claim.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'warning',
})

try {
  await import(pathToFileURL(join(process.cwd(), outfile)).href)
} finally {
  await rm(outfile, { force: true })
}
