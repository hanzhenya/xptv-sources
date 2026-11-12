#!/usr/bin/env node
/**
 * 生成 / 更新两份手工订阅：
 *   subs/all.json   全部可播源（含成人向，名称带 " | 18+" 标记）
 *   subs/kids.json  家庭向（剔除 adultSites 里的成人源）
 *
 * 与自动流程的关系：auto-collect.js 只维护 subs/vod.json，不会覆盖这两份。
 * 数据来源：最近一次播放深检 docs/result-*-play.json + 现有 all.json 的历史条目。
 *
 * 用法：
 *   node tools/gen-all.js                          # 用 docs 下最新的 play 结果
 *   node tools/gen-all.js docs/result-2026-11-12-play.json
 *   node tools/gen-all.js --dry-run                # 只看结果不写文件
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'automation', 'config.json'), 'utf8'))
const RAW = String(CFG.rawBase || '').replace(/\/$/, '')
const ADULT = new Set((CFG.adultSites || []).map((s) => String(s).toLowerCase()))
const NAME_FIX = { '4kav': '4k-av', ppp: 'pppHub' }

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const playArg = args.find((a) => !a.startsWith('--'))

function latestPlay() {
  if (playArg) return path.resolve(playArg)
  const dir = path.join(ROOT, 'docs')
  const files = fs.readdirSync(dir).filter((f) => /^result-.*-play\.json$/.test(f)).sort()
  if (!files.length) throw new Error('docs/ 下没有 result-*-play.json，请先跑一次检测')
  return path.join(dir, files[files.length - 1])
}

const playFile = latestPlay()
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'state.json'), 'utf8')).sources || {}
const play = JSON.parse(fs.readFileSync(playFile, 'utf8'))
const okNow = play.filter((r) => r.status === 'ok')
  .map((r) => path.basename(String(r.file)).replace(/\.js$/, ''))

const allFile = path.join(ROOT, 'subs', 'all.json')
let kept = []
if (fs.existsSync(allFile)) {
  kept = (JSON.parse(fs.readFileSync(allFile, 'utf8')).sites || [])
    .map((s) => path.basename(String(s.ext || '')).replace(/\.js$/, ''))
}

const keys = [...new Set([...okNow, ...kept])]
  .filter((k) => k && fs.existsSync(path.join(ROOT, 'js', k + '.js')))

const sites = keys.map((k) => {
  const s = state[k] || {}
  let name = NAME_FIX[k] || s.name || k
  if (ADULT.has(k.toLowerCase()) && !name.includes('18+')) name += ' | 18+'
  return { key: k, name, type: 3, api: s.api || `csp_${k}`, ext: `${RAW}/js/${k}.js`, listCount: s.listCount || 0 }
})
sites.sort((a, b) => (Number(ADULT.has(a.key)) - Number(ADULT.has(b.key))) || (b.listCount - a.listCount))

const all = sites.map(({ key, listCount, ...r }) => r)
const kids = sites.filter((s) => !ADULT.has(s.key)).map(({ key, listCount, ...r }) => r)

if (DRY) {
  console.log(`[dry-run] all=${all.length} 条 / kids=${kids.length} 条`)
  console.log('18+:', all.filter((s) => s.name.includes('18+')).map((s) => s.name).join('、') || '无')
  process.exit(0)
}

fs.writeFileSync(allFile, JSON.stringify({ sites: all }, null, 2) + '\n')
fs.writeFileSync(path.join(ROOT, 'subs', 'kids.json'), JSON.stringify({ sites: kids }, null, 2) + '\n')
console.log(`✅ all.json ${all.length} 条（18+ ${all.filter((s) => s.name.includes('18+')).length} 个）`)
console.log(`✅ kids.json ${kids.length} 条`)
console.log(`   数据来源: ${path.relative(ROOT, playFile)}`)
