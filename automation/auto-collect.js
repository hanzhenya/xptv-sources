#!/usr/bin/env node
/**
 * XPTV 源每日自动收集器
 * ---------------------------------------------------------------
 * 从上游 GitHub 仓库拉全部扩展源 → 列表层检测 → 播放链路深检 →
 * 按「连续命中」阈值收敛主订阅 → 同步 js/subs/docs/README。
 *
 * 用法：
 *   node automation/auto-collect.js --upstream-dir /tmp/upstream/js \
 *        --subs-dir /tmp/upstream/subs
 *   node automation/auto-collect.js --from-list docs/result-xxx-list.json \
 *        --from-play docs/result-xxx-play.json --upstream-dir /tmp/upstream/js \
 *        --dry-run
 *
 * 可选参数：
 *   --root <dir>        项目根目录（默认脚本上一级）
 *   --dry-run           只打印将要发生的变更，不写任何文件
 *   --from-list <json>  复用已有列表检测结果，跳过真实请求
 *   --from-play <json>  复用已有播放深检结果，跳过真实请求
 *   --upstream-dir <dir> 上游 js/ 目录（必填，用于复制源文件）
 *   --subs-dir <dir>    上游 subs/ 目录（用于反查 name/api 命名）
 *   --tools-dir <dir>   检测工具目录（默认 <root>/tools，测试副本可另行指定）
 *
 * 环境变量：
 *   TIMEOUT / LIST_TIMEOUT   请求超时(ms)
 *   GITHUB_STEP_SUMMARY      GitHub Actions 作业摘要文件路径
 */
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'))
const T = CFG.thresholds || {}
const MIN_HITS = Number(T.minHitsToAdd || 2)
const MAX_MISS = Number(T.maxMissesToRemove || 3)
const KEEP_RATIO = Number(T.minKeepRatio || 0.5)
const MIN_OK = Number(T.minAbsoluteOk || 3)

function parseArgs(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) continue
    const key = k.slice(2)
    if (key === 'dry-run') { a['dry-run'] = true; continue }
    const v = argv[i + 1]
    if (v && !v.startsWith('--')) { a[key] = v; i++ } else { a[key] = true }
  }
  return a
}
const ARGS = parseArgs(process.argv.slice(2))
const DRY = !!ARGS['dry-run']
const ROOT = path.resolve(ARGS.root || path.join(__dirname, '..'))
const P = (...x) => path.join(ROOT, ...x)
const DIR_JS = P('js')
const DIR_SUBS = P('subs')
const DIR_DOCS = P('docs')
const FILE_README = P('README.md')
const FILE_STATE = P('docs', 'state.json')
const FILE_LASTRUN = P('docs', 'last-run.json')
const FILE_VOD = P('subs', 'vod.json')
const FILE_PLAYABLE = P('subs', 'playable.json')
const AUTO_BEGIN = '<!-- AUTO:BEGIN -->'
const AUTO_END = '<!-- AUTO:END -->'

const readJson = (p, def) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return def }
}
const writeJson = (p, obj) => {
  if (DRY) return
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n')
}
const keyOf = (file) => String(file).replace(/\.js$/, '')
const beijingNow = () => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date()).replace(/\//g, '-')
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function log(...a) { console.log(...a) }
function extUrl(file) { return `${CFG.rawBase}/js/${file}` }

/** 从上游 subs/*.json 反查 name / api 命名 */
function loadUpstreamMeta(subsDir) {
  const out = {}
  if (!subsDir || !fs.existsSync(subsDir)) return out
  for (const f of fs.readdirSync(subsDir).filter((x) => x.endsWith('.json'))) {
    const d = readJson(path.join(subsDir, f), null)
    if (!d || !Array.isArray(d.sites)) continue
    for (const s of d.sites) {
      const key = keyOf(path.basename(String(s.ext || '')))
      if (!key || out[key]) continue
      out[key] = {
        name: String(s.name || key).split('|')[0].trim() || key,
        api: String(s.api || `csp_${key}`),
      }
    }
  }
  return out
}

/** 组装「本次实际检测」的 js 目录：上游全量 + 项目独有 + 修复版优先 */
function buildWorkDir() {
  const upstream = ARGS['upstream-dir']
  if (!upstream || !fs.existsSync(upstream)) {
    throw new Error(`缺少 --upstream-dir 或目录不存在: ${upstream}`)
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'xptv-auto-'))
  const jsDir = path.join(work, 'js')
  fs.mkdirSync(jsDir, { recursive: true })
  let n = 0
  for (const f of fs.readdirSync(upstream).filter((x) => x.endsWith('.js'))) {
    fs.copyFileSync(path.join(upstream, f), path.join(jsDir, f)); n++
  }
  // 项目独有（上游已删除的源）也纳入检测，避免已收录源被漏测
  for (const f of fs.readdirSync(DIR_JS).filter((x) => x.endsWith('.js'))) {
    if (!fs.existsSync(path.join(jsDir, f))) {
      fs.copyFileSync(path.join(DIR_JS, f), path.join(jsDir, f)); n++
    }
  }
  // 本地修复版永不被上游覆盖
  for (const key of (CFG.pinned || [])) {
    const src = path.join(DIR_JS, key + '.js')
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(jsDir, key + '.js'))
  }
  return { work, jsDir, total: fs.readdirSync(jsDir).filter((x) => x.endsWith('.js')).length }
}

/** 真实跑两个检测脚本，返回 {list, play} */
function runDetection(jsDir, workDir, existingFiles) {
  const tools = ARGS['tools-dir'] ? path.resolve(ARGS['tools-dir']) : P('tools')
  for (const f of ['check.js', 'playcheck.js']) {
    if (!fs.existsSync(path.join(tools, f))) {
      throw new Error(`检测工具缺失: ${path.join(tools, f)}（用 --tools-dir 指定 tools/ 目录）`)
    }
  }
  const listOut = path.join(workDir, 'result-list.json')
  const playOut = path.join(workDir, 'result-play.json')
  const env = { ...process.env, TIMEOUT: String(CFG.timeoutMs || 15000) }

  log(`\n[1/2] 列表层检测 check.js  dir=${jsDir}`)
  let r = spawnSync(process.execPath, [path.join(tools, 'check.js'), jsDir], {
    env: { ...env, TIMEOUT: String(CFG.listTimeoutMs || 12000), CHECK_OUT: listOut },
    stdio: 'inherit',
  })
  if (r.status !== 0) throw new Error(`check.js 退出码 ${r.status}`)
  const list = readJson(listOut, [])
  const listOk = list.filter((x) => x.status === 'ok').map((x) => keyOf(x.file))
  log(`      上游 ${list.length} 源 → 列表可用 ${listOk.length} 个`)

  // 已收录的源即使这次列表失败也要跑播放深检（用于累计失败次数）
  const candidates = [...new Set([...listOk, ...existingFiles])]
    .filter((k) => fs.existsSync(path.join(jsDir, k + '.js')))
    .sort()
  log(`\n[2/2] 播放链路深检 playcheck.js  候选 ${candidates.length} 个`)
  r = spawnSync(process.execPath,
    [path.join(tools, 'playcheck.js'), jsDir, candidates.join(',')],
    { env: { ...env, PLAYCHECK_OUT: playOut }, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`playcheck.js 退出码 ${r.status}`)
  const play = readJson(playOut, [])
  return { list, play, listOk, candidates }
}

/** 根据现有 vod.json 初始化 / 校准状态 */
function loadState(existingSites, meta) {
  const st = readJson(FILE_STATE, null) || { version: 1, sources: {} }
  st.sources = st.sources || {}
  const byKey = new Map(existingSites.map((s) => [keyOf(path.basename(s.ext)), s]))
  // 以 vod.json 为权威：手工改动优先
  for (const [key, site] of byKey) {
    const cur = st.sources[key] || { hits: MIN_HITS, misses: 0 }
    st.sources[key] = {
      ...cur,
      included: true,
      name: site.name,
      api: site.api,
      hits: Math.max(Number(cur.hits || 0), 0),
      misses: Number(cur.misses || 0),
    }
  }
  for (const [key, cur] of Object.entries(st.sources)) {
    if (!byKey.has(key)) {
      // 手工从 vod.json 删掉的源要被尊重，不许自动加回来
      if (cur.included) cur.manualExclude = true
      cur.included = false
    }
    if (!cur.name || !cur.api) {
      const m = meta[key] || {}
      cur.name = cur.name || m.name || key
      cur.api = cur.api || m.api || `csp_${key}`
    }
  }
  return st
}

/** 生成 README 里的自动区块 */
function autoBlock(state, finalKeys, info) {
  const rows = finalKeys.map((key) => {
    const s = state.sources[key]
    return `| ${s.name} | \`${s.api}\` | ${s.mediaType || '-'} | ${s.listCount ?? '-'} | ${s.hits} 天 | ✅ |`
  })
  const add = info.added.length ? info.added.join('、') : '无'
  const rm = info.removed.length ? info.removed.join('、') : '无'
  const warn = info.aborted ? '⚠️ **本次可播数为 0，判定检测环境异常，订阅未做任何改动**'
    : info.suspicious ? '⚠️ **本次可播数骤降，判定检测环境异常，只增不删**' : ''
  const lines = [
    AUTO_BEGIN,
    '> 🤖 本节由 `automation/auto-collect.js` 自动生成，**请勿手工编辑**（每天北京时间 03:00 更新）。',
    '',
    `**最近自动检测**：${info.time}（北京时间）${info.mode === 'offline' ? ' · 离线复算' : ''} · 上游 ${info.total} 源 → 列表可用 ${info.listOk} → 播放可播 ${info.playOk} → 主订阅 **${finalKeys.length} 源** · 本次新增：${add} · 移除：${rm}`,
  ]
  if (warn) lines.push('', warn)
  lines.push(
    '',
    '| 源名 | api | 流格式 | 列表条数 | 连续通过 | 状态 |',
    '|---|---|:---:|---:|:---:|:---:|',
    ...rows,
    '',
    '> 详细归因见 `docs/last-run.json` 与 `docs/result-<日期>-play.json`；手动复测命令见下方「常用操作」。',
    AUTO_END,
  )
  return lines.join('\n')
}

function updateReadme(block) {
  const src = fs.readFileSync(FILE_README, 'utf8')
  const i = src.indexOf(AUTO_BEGIN), j = src.indexOf(AUTO_END)
  if (i < 0 || j < 0 || j < i) {
    throw new Error('README.md 缺少 <!-- AUTO:BEGIN --> / <!-- AUTO:END --> 标记')
  }
  const next = src.slice(0, i) + block + src.slice(j + AUTO_END.length)
  if (DRY) { log('\n--- README 自动区块预览(前 12 行) ---\n' + block.split('\n').slice(0, 12).join('\n')); return false }
  if (next === src) return false
  fs.writeFileSync(FILE_README, next)
  return true
}

async function main() {
  const time = beijingNow()
  log(`\n================ XPTV 每日自动收集 ================`)
  log(`时间: ${time} (北京时间)   模式: ${DRY ? 'DRY-RUN' : 'WRITE'}   项目: ${ROOT}`)

  const existingSites = readJson(FILE_VOD, { sites: [] }).sites || []
  const existingKeys = existingSites.map((s) => keyOf(path.basename(s.ext)))
  const meta = loadUpstreamMeta(ARGS['subs-dir'])
  const state = loadState(existingSites, meta)

  // ---- 检测结果 ----
  let list = [], play = [], listOk = [], candidates = [], total = 0, jsDir = ARGS['upstream-dir']
  const offline = ARGS['from-list'] && ARGS['from-play']
  if (offline) {
    list = readJson(path.resolve(ARGS['from-list']), [])
    play = readJson(path.resolve(ARGS['from-play']), [])
    listOk = list.filter((x) => x.status === 'ok').map((x) => keyOf(x.file))
    candidates = [...new Set(play.map((x) => keyOf(x.file)))].sort()
    total = list.length
    log(`离线模式：复用 ${path.basename(ARGS['from-list'])} / ${path.basename(ARGS['from-play'])}`)
  } else {
    const w = buildWorkDir()
    jsDir = w.jsDir
    total = w.total
    const d = runDetection(w.jsDir, w.work, existingKeys)
    ;({ list, play, listOk, candidates } = d)
    writeJson(P('docs', `result-${today()}-list.json`), list)
    writeJson(P('docs', `result-${today()}-play.json`), play)
  }
  if (!jsDir || !fs.existsSync(jsDir)) throw new Error(`源目录不可用: ${jsDir}`)

  const listCountByKey = Object.fromEntries(list.map((r) => [keyOf(r.file), r.listCount || 0]))
  const playByKey = Object.fromEntries(play.map((r) => [keyOf(r.file), r]))
  const okKeys = play.filter((r) => r.status === 'ok').map((r) => keyOf(r.file))
  const okSet = new Set(okKeys)

  // ---- 安全阀：CI 与境内网络视角不同，防止一次网络抖动清空订阅 ----
  const aborted = okKeys.length === 0
  const suspicious = okKeys.length < Math.max(MIN_OK, Math.ceil(existingKeys.length * KEEP_RATIO))
  if (aborted || suspicious) {
    log(`\n⚠️ 安全阀触发：可播 ${okKeys.length} / 已有收录 ${existingKeys.length}。` +
      (aborted ? '本次不做任何订阅改动。' : '只增不删，跳过移除判定。'))
  }

  // ---- 累计命中 / 失败 ----
  for (const key of candidates) {
    const cur = state.sources[key] || {
      hits: 0, misses: 0, included: false,
      name: meta[key]?.name || key,
      api: meta[key]?.api || `csp_${key}`,
    }
    const r = playByKey[key]
    if (okSet.has(key)) {
      cur.hits = Number(cur.hits || 0) + 1
      cur.misses = 0
      cur.lastOk = time
      cur.mediaType = r?.mediaType || cur.mediaType || ''
      if (listCountByKey[key] > 0) cur.listCount = listCountByKey[key]
      cur.lastDetail = String(r?.detail || '').slice(0, 120)
    } else {
      cur.hits = 0
      cur.misses = Number(cur.misses || 0) + 1
      cur.lastFail = time
      cur.lastStage = r?.stage || 'not_tested'
      cur.lastDetail = String(r?.detail || '').slice(0, 120)
    }
    state.sources[key] = cur
  }

  // ---- 决定最终收录 ----
  const added = [], removed = [], skipped = []
  const excl = new Set(CFG.exclude || [])
  const adult = (CFG.adultKeywords || []).map((s) => s.toLowerCase())
  for (const [key, cur] of Object.entries(state.sources)) {
    if (cur.included) {
      if (!aborted && !suspicious && cur.misses >= MAX_MISS) {
        cur.included = false
        removed.push(cur.name || key)
      }
    } else if (cur.hits >= MIN_HITS) {
      if (aborted) { /* 完全不动 */ }
      else if (cur.manualExclude) skipped.push(`${key}(已手工移除)`)
      else if (excl.has(key)) skipped.push(`${key}(排除名单)`)
      else if (adult.some((w) => key.toLowerCase().includes(w))) skipped.push(`${key}(成人向过滤)`)
      else if (!fs.existsSync(path.join(jsDir, key + '.js'))) skipped.push(`${key}(无脚本)`)
      else {
        cur.included = true
        added.push(cur.name || key)
      }
    }
  }

  // 排序：现有顺序优先，新源按列表条数降序追加
  const order = [...existingKeys]
  const fresh = Object.keys(state.sources)
    .filter((k) => state.sources[k].included && !order.includes(k))
    .sort((a, b) => (state.sources[b].listCount || 0) - (state.sources[a].listCount || 0) || a.localeCompare(b))
  const finalKeys = [...order, ...fresh].filter((k) => state.sources[k]?.included)

  const sites = finalKeys.map((key) => {
    const s = state.sources[key]
    return { name: s.name, type: 3, api: s.api, ext: extUrl(key + '.js') }
  })

  // ---- 写文件 ----
  const info = {
    time, mode: offline ? 'offline' : 'live',
    aborted, suspicious, total, listOk: listOk.length,
    playOk: okKeys.length, candidates: candidates.length,
    added, removed, skipped,
  }
  log(`\n=== 收敛结果 ===`)
  log(`  上游 ${total} → 列表可用 ${listOk.length} → 播放可播 ${okKeys.length} → 主订阅 ${finalKeys.length}`)
  log(`  新增: ${added.join('、') || '无'}   移除: ${removed.join('、') || '无'}   跳过: ${skipped.join('、') || '无'}`)
  log(`  最终名单: ${sites.map((s) => s.name).join('、')}`)

  if (!DRY) {
    // 部署文件 = 检测文件；修复版取项目内版本
    for (const key of finalKeys) {
      const src = (CFG.pinned || []).includes(key)
        ? path.join(DIR_JS, key + '.js')
        : path.join(jsDir, key + '.js')
      if (!fs.existsSync(src)) { log(`  ⚠️ 缺少脚本 ${key}.js，保留项目内现有版本`); continue }
      const dst = path.join(DIR_JS, key + '.js')
      if (!fs.existsSync(dst) || fs.readFileSync(src).compare(fs.readFileSync(dst)) !== 0) {
        fs.copyFileSync(src, dst)
        log(`  ↻ 同步脚本 ${key}.js`)
      }
    }
    writeJson(FILE_VOD, { sites })
    writeJson(FILE_PLAYABLE, { sites })
    state.version = 1
    state.lastRun = time
    writeJson(FILE_STATE, state)
    writeJson(FILE_LASTRUN, {
      runAt: new Date().toISOString(), beijingTime: time,
      mode: offline ? 'offline' : 'live',
      upstreamTotal: total, listOk: listOk.length, playOk: okKeys.length,
      candidates, included: finalKeys, added, removed, skipped,
      suspicious, aborted,
      okKeys, failedStages: Object.fromEntries(
        play.filter((r) => r.status !== 'ok').map((r) => [keyOf(r.file), `${r.stage}: ${r.detail}`.slice(0, 160)])),
    })
    updateReadme(autoBlock(state, finalKeys, info))
  } else {
    log('\n--- DRY-RUN：未写入任何文件 ---')
    log(autoBlock(state, finalKeys, info).split('\n').slice(0, 10).join('\n'))
  }

  // GitHub Actions 作业摘要
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary && !DRY) {
    const md = [
      `## XPTV 每日自动收集 — ${time}`, '',
      `| 环节 | 数量 |`, `|---|---:|`,
      `| 上游源 | ${total} |`, `| 列表可用 | ${listOk.length} |`,
      `| 播放可播 | ${okKeys.length} |`, `| 主订阅 | ${finalKeys.length} |`, '',
      `- 新增：${added.join('、') || '无'}`, `- 移除：${removed.join('、') || '无'}`,
      aborted || suspicious ? `- ⚠️ 安全阀：${aborted ? '可播为 0，订阅未改动' : '可播骤降，只增不删'}` : '',
    ].filter(Boolean).join('\n') + '\n'
    fs.appendFileSync(summary, md)
  }
  log(`\n✅ 完成${DRY ? '（DRY-RUN）' : ''}`)
}

main().catch((e) => { console.error('\n❌ 自动收集失败:', e.stack || e.message); process.exit(1) })
