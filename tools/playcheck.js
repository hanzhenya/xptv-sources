#!/usr/bin/env node
/**
 * XPTV 播放链路深检
 *
 * 与 check.js 的区别：check.js 只验证「列表能不能出来」，
 * 本脚本把链路走到底：getConfig → getCards → getTracks → getPlayinfo → 真实拉流，
 * 并校验 m3u8 主清单 / 子清单 / 分片、mp4 ftyp、TS 0x47 同步字节。
 *
 * 用法:
 *   cd tools && npm install
 *   TIMEOUT=15000 node playcheck.js                # 全部源
 *   TIMEOUT=15000 node playcheck.js ../js 4kav     # 只跑 4kav（可逗号分隔多个）
 *
 * 结果写入 tools/playcheck-result.json
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const cheerio = require('cheerio')
const CryptoJS = require('crypto-js')

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
const TIMEOUT = Number(process.env.TIMEOUT || 15000)
const DIR = process.argv[2] || path.join(__dirname, '..', 'js')
const ONLY = process.argv[3] ? process.argv[3].split(',').map((s) => s.replace(/\.js$/, '')) : null
const OUT = process.env.PLAYCHECK_OUT || path.join(__dirname, 'playcheck-result.json')

// ---------- XPTV 运行时 ----------
function makeCache() {
  const m = new Map()
  return {
    get: (k) => (m.has(k) ? m.get(k) : ''),
    set: (k, v) => { m.set(k, v); return v },
    has: (k) => m.has(k), remove: (k) => m.delete(k), clear: () => m.clear(),
  }
}

function makeHtml() {
  // cheerio 的 Element 节点没有 outerHTML；真实 XPTV 的 $html 传回的是可序列化的节点。
  // 这里统一转成 HTML 字符串再解析，否则 $html.attr/text 会全部返回空，造成误判。
  const htmlOf = (el) => {
    if (!el) return ''
    if (typeof el === 'string') return el
    if (el.outerHTML) return el.outerHTML
    try { return cheerio.load('').html(el) || '' } catch (e) { return '' }
  }
  const pick = (root, sel) => cheerio.load(root || '')(sel).toArray()
  return {
    elements: (root, sel) => pick(root, sel),
    element: (root, sel) => pick(root, sel)[0] || null,
    attr: (el, sel, name) => {
      if (!el) return ''
      const v = cheerio.load(htmlOf(el))(sel).first().attr(name)
      return v == null ? '' : String(v)
    },
    text: (el, sel) => {
      if (!el) return ''
      const $ = cheerio.load(htmlOf(el))
      return sel ? $(sel).first().text().trim() : $.root().text().trim()
    },
    html: (el, sel) => {
      if (!el) return ''
      const $ = cheerio.load(htmlOf(el))
      return sel ? $(sel).first().html() : $.html()
    },
    remove: (el) => el,
  }
}

function makeUtils(log) {
  return {
    toastInfo: (m) => log.toasts.push(String(m)), toastError: () => {}, toastWarn: () => {}, toast: () => {},
    openSafari: (u) => log.opened.push(u), getAndroidVersion: () => 30, getDeviceId: () => 'x',
    formatTime: String, isEmpty: (o) => !o, sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }
}

function makeJSEncrypt() {
  const NC = require('crypto')
  function RSAKey(setPublic, setPrivate) { this.setPublic = setPublic || ''; this.setPrivate = setPrivate || '' }
  RSAKey.prototype.encrypt = function (t) {
    try { return NC.publicEncrypt({ key: NC.createPublicKey({ key: this.setPublic.replace(/\\n/g, '\n'), format: 'pem' }), padding: NC.constants.RSA_PKCS1_PADDING }, Buffer.from(t)).toString('base64') } catch (e) { return '' }
  }
  return { RSAKey, setPublic: (k) => new RSAKey(k, ''), setPrivate: (k) => new RSAKey('', k), encrypt: (t, k) => new RSAKey(k, '').encrypt(t), decrypt: () => '' }
}

function makeFetch(log, timeoutMs) {
  const doReq = async (method, url, body, opts) => {
    const headers = Object.assign({ 'User-Agent': UA, Accept: '*/*' }, (opts && opts.headers) || {})
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs || TIMEOUT)
    const t0 = Date.now()
    try {
      const init = { method: method.toUpperCase(), headers, signal: ac.signal, redirect: 'follow' }
      if (body !== undefined && body !== null && init.method !== 'GET' && init.method !== 'HEAD') {
        init.body = typeof body === 'string' ? body : JSON.stringify(body)
      }
      const res = await fetch(url, init)
      const text = await res.text()
      log.reqs.push({ url, method: init.method, status: res.status, ms: Date.now() - t0, len: text.length })
      let data = text
      const ct = res.headers.get('content-type') || ''
      if (/json/i.test(ct)) { try { data = JSON.parse(text) } catch (e) {} }
      // XPTV 的 $fetch 还会返回 respHeaders（多个源依赖它取 set-cookie）
      const respHeaders = {}
      res.headers.forEach((v, k) => { respHeaders[k] = v })
      // 多个 Set-Cookie 要分别给出，否则源无法正确拼 Cookie
      if (typeof res.headers.getSetCookie === 'function') {
        const sc = res.headers.getSetCookie()
        if (sc && sc.length) respHeaders['set-cookie'] = sc
      }
      return { data, status: res.status, headers: res.headers, respHeaders }
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'TIMEOUT' : (e.cause?.code || e.code || e.message)
      log.reqs.push({ url, method: String(method).toUpperCase(), status: 0, ms: Date.now() - t0, err: msg })
      throw new Error(msg)
    } finally { clearTimeout(timer) }
  }
  return {
    get: (u, o) => doReq('GET', u, null, o),
    post: (u, b, o) => doReq('POST', u, b === undefined ? '{}' : b, o),
    request: (c) => doReq(c.method || 'GET', c.url, c.data, c),
    fetch: (u, o) => doReq('GET', u, null, o),
    head: (u, o) => doReq('HEAD', u, null, o),
  }
}

function loadCtx(file, log) {
  const src = fs.readFileSync(file, 'utf8')
  const g = {
    createCheerio: () => cheerio, cheerio, createCryptoJS: () => CryptoJS,
    argsify: (o) => { try { return typeof o === 'string' ? JSON.parse(o) : o } catch (e) { return {} } },
    jsonify: (o) => JSON.stringify(o),
    $cache: makeCache(), $utils: makeUtils(log), $html: makeHtml(),
    loadJSEncrypt: makeJSEncrypt, $print: (...a) => log.toasts.push(a.map(String).join(' ')), $config_str: '{}', $config: {},
    $fetch: makeFetch(log, TIMEOUT),
    console: { log: () => {}, error: () => {}, warn: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Buffer, URL, URLSearchParams, TextDecoder, TextEncoder,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    fetch: global.fetch, crypto: global.crypto,
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, escape, unescape,
  }
  g.global = g; g.globalThis = g; g.window = g; g.self = g
  const ctx = vm.createContext(g)
  vm.runInContext(src, ctx, { filename: file, timeout: 20000 })
  return ctx
}

// ---------- 拉流验证 ----------
function toObj(r) {
  if (typeof r === 'string') { try { return JSON.parse(r) } catch (e) { return null } }
  return r || null
}

// 只读前 64KB，避免把整段视频下载下来
async function readHead(url, headers, timeoutMs) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs || TIMEOUT)
  try {
    const res = await fetch(url, { headers, signal: ac.signal, redirect: 'follow' })
    const reader = res.body.getReader()
    const chunks = []
    let total = 0
    while (total < 65536) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value)); total += value.length
    }
    try { await reader.cancel() } catch (e) {}
    const buf = Buffer.concat(chunks).subarray(0, 65536)
    return { status: res.status, ct: res.headers.get('content-type') || '', buf, text: buf.toString('utf8'), finalUrl: res.url }
  } catch (e) {
    return { status: 0, ct: '', buf: Buffer.alloc(0), text: '', finalUrl: url, err: e.cause?.code || e.message }
  } finally { clearTimeout(timer) }
}

function classify(res) {
  const b = res.buf
  if (res.text.trimStart().startsWith('#EXTM3U')) return 'm3u8'
  if (b.length > 3 && b.subarray(0, 3).toString() === 'FLV') return 'flv'
  if (b.length > 8 && b.subarray(4, 8).toString() === 'ftyp') return 'mp4'
  if (b.length > 188 && b[0] === 0x47) return 'ts'
  if (/^[\s]*\{/.test(res.text) && /json/i.test(res.ct)) return 'json'
  if (/^[\s]*<(!doctype|html)/i.test(res.text)) return 'html'
  return 'unknown'
}

async function verifyStream(playUrl, headers, referer, depth) {
  const res = await readHead(playUrl, headers)
  const out = {
    status: res.status, ct: res.ct, bytes: res.buf.length,
    type: classify(res), url: playUrl, finalUrl: res.finalUrl, err: res.err,
  }
  if (res.status < 200 || res.status >= 300) return { ...out, ok: false, detail: `HTTP ${res.status || '连接失败'} ${res.err || ''}` }

  if (out.type === 'm3u8') {
    const lines = res.text.split('\n').map((s) => s.trim())
    const first = lines.find((l) => l && !l.startsWith('#'))
    if (!first) return { ...out, ok: false, detail: 'm3u8 内无分片/子清单地址' }
    let target = first.startsWith('http') ? first : new URL(first, res.finalUrl).href
    out.firstRef = target
    const sub = await readHead(target, headers)
    if (sub.status !== 200) return { ...out, ok: false, detail: `子资源 HTTP ${sub.status || '连接失败'} ${sub.err || ''}` }
    if (sub.text.trimStart().startsWith('#EXTM3U')) {
      // master playlist → 子清单，再取第一个分片
      const l2 = sub.text.split('\n').map((s) => s.trim()).find((l) => l && !l.startsWith('#'))
      if (!l2) return { ...out, ok: false, detail: '子清单内无分片' }
      target = l2.startsWith('http') ? l2 : new URL(l2, sub.finalUrl).href
    }
    const seg = await readHead(target, headers)
    out.segUrl = target
    out.segStatus = seg.status
    out.segBytes = seg.buf.length
    out.segIsTs = seg.buf[0] === 0x47
    out.ok = seg.status === 200 && (out.segIsTs || seg.buf.length > 1024)
    out.detail = out.ok ? `清单+分片可播 (分片 ${seg.buf.length}B${out.segIsTs ? ', TS 0x47' : ''})` : `分片不可读: HTTP ${seg.status}`
    return out
  }
  if (out.type === 'flv') { out.ok = true; out.detail = 'FLV 直播流可播 (FLV header)'; return out }
  if (out.type === 'mp4') { out.ok = true; out.detail = 'mp4 流可播 (ftyp)'; return out }
  if (out.type === 'ts') { out.ok = true; out.detail = 'TS 流可播 (0x47)'; return out }
  if (out.type === 'html') { out.ok = false; out.detail = '返回 HTML 而非视频（多为防盗链/需登录/地址失效）'; return out }
  if (out.type === 'json') { out.ok = false; out.detail = '返回 JSON 而非视频（多为解析接口未解析完）'; return out }
  out.ok = false
  out.detail = `未知内容类型 (${res.ct || '无'})，前 32 字节: ${res.buf.subarray(0, 32).toString('hex')}`
  return out
}

// ---------- 单源完整链路 ----------
async function checkOne(file) {
  const r = {
    file: path.basename(file), status: 'fail', stage: '', detail: '',
    playUrl: '', mediaType: '', trackCount: 0, cardTitle: '', cfgTitle: '',
    reqs: 0, totalMs: 0, verify: null, note: '',
  }
  const t0 = Date.now()
  const log = { reqs: [], toasts: [], opened: [] }
  let ctx
  try {
    ctx = loadCtx(file, log)
  } catch (e) {
    r.stage = 'load'; r.detail = '脚本载入失败: ' + String(e.message).slice(0, 90); r.totalMs = Date.now() - t0; return r
  }

  try {
    // 1) getConfig
    r.stage = 'getConfig'
    let cfg = null
    try { cfg = toObj(await ctx.getConfig()) } catch (e) { r.note = 'getConfig 异常(可忽略): ' + String(e.message).slice(0, 60) }
    r.cfgTitle = cfg?.title || ''
    const tabs = Array.isArray(cfg?.tabs) ? cfg.tabs : []

    // 2) getCards — 依次尝试各 tab，取第一张有效卡片
    r.stage = 'getCards'
    let cards = null
    const exts = tabs.length ? tabs.map((t) => ({ page: 1, ...(t.ext || {}) })) : [{ page: 1 }]
    exts.push({ page: 1 })
    const cardErrs = []
    for (const ext of exts) {
      try {
        const c = toObj(await ctx.getCards(ext))
        const list = Array.isArray(c?.list) ? c.list : Array.isArray(c) ? c : []
        if (list.length) { cards = list; break }
      } catch (e) { cardErrs.push(String(e.message).slice(0, 40)) }
    }
    if (!cards) {
      r.detail = '列表为空' + (cardErrs.length ? ' / 异常: ' + [...new Set(cardErrs)].join('; ') : '')
      r.totalMs = Date.now() - t0; r.reqs = log.reqs.length; return r
    }

    // 3) getTracks — 前 3 张卡片里找有剧集的
    r.stage = 'getTracks'
    let trackExt = null
    const trackErrs = []
    for (const card of cards.slice(0, 3)) {
      try {
        const t = toObj(await ctx.getTracks(card.ext || card))
        const groups = Array.isArray(t?.list) ? t.list : Array.isArray(t) ? t : []
        const tracks = groups.flatMap((g) => (Array.isArray(g.tracks) ? g.tracks : []))
        if (tracks.length) {
          r.hasPan = tracks.some((t) => t.pan && !t.ext)
          trackExt = tracks[0].ext || tracks[0]
          r.trackCount = tracks.length
          r.cardTitle = card.vod_name || card.title || ''
          break
        }
      } catch (e) { trackErrs.push(String(e.message).slice(0, 60)) }
    }
    if (!trackExt) {
      trackExt = cards[0].ext || cards[0]
      r.cardTitle = cards[0].vod_name || cards[0].title || ''
      r.note += (r.note ? ' | ' : '') + 'getTracks 无结果/异常，退化用 card.ext' + (trackErrs.length ? ' (' + [...new Set(trackErrs)].join('; ') + ')' : '')
    }

    // 4) getPlayinfo
    r.stage = 'getPlayinfo'
    const pi = toObj(await ctx.getPlayinfo(trackExt))
    const urls = Array.isArray(pi?.urls) ? pi.urls : (pi?.url ? [pi.url] : (pi?.playUrl ? [pi.playUrl] : []))
    r.playUrl = String(urls[0] || '')
    if ((!urls.length || !urls[0]) && r.hasPan) {
      r.status = 'pan'; r.stage = 'pan'
      r.detail = '网盘源：track 只有 pan 跳转链接，源设计上不返回播放流'
      r.totalMs = Date.now() - t0; r.reqs = log.reqs.length; return r
    }
    if (!r.playUrl || r.playUrl === 'undefined' || r.playUrl === 'null') {
      r.detail = 'getPlayinfo 未返回有效地址' + (pi ? ' / 返回: ' + JSON.stringify(pi).slice(0, 160) : '')
      r.totalMs = Date.now() - t0; r.reqs = log.reqs.length; return r
    }
    // 相对地址补全
    if (!/^https?:\/\//i.test(r.playUrl)) {
      const base = cfg?.site || (typeof trackExt?.url === 'string' ? trackExt.url : '')
      if (base) { try { r.playUrl = new URL(r.playUrl, base).href; r.note += ' | 已补全相对地址' } catch (e) {} }
    }

    // 5) 真实拉流
    r.stage = 'stream'
    const playHeaders = Object.assign({ 'User-Agent': UA, Accept: '*/*' }, {})
    if (pi?.headers) {
      const h = Array.isArray(pi.headers) ? pi.headers[0] : pi.headers
      if (h && typeof h === 'object') Object.assign(playHeaders, h)
    }
    let v = await verifyStream(r.playUrl, playHeaders, cfg?.site || '')
    // 失败时补 Referer 再试一次，用于判断是不是防盗链
    if (!v.ok && v.status !== 0) {
      const withRef = { ...playHeaders, Referer: (cfg?.site || new URL(r.playUrl).origin) + '/' }
      const v2 = await verifyStream(r.playUrl, withRef, cfg?.site || '')
      if (v2.ok) { v = v2; r.note += ' | 需带 Referer 才可播' }
    }
    r.verify = v
    r.mediaType = v.type
    r.status = v.ok ? 'ok' : 'fail'
    r.detail = v.detail
    r.stage = v.ok ? 'ok' : 'stream'
  } catch (e) {
    const msg = String(e.message || e)
    r.status = 'fail'
    r.detail = `${r.stage} 抛异常: ${msg.slice(0, 120)}`
    r.verdict = /TIMEOUT|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(msg) ? 'network' : 'source_bug'
  }
  r.reqs = log.reqs.length
  r.totalMs = Date.now() - t0
  r.lastReqs = log.reqs.slice(-4).map((q) => `${q.method} ${q.status || 'ERR'} ${q.url}`)
  r.toasts = log.toasts.slice(-6)
  if (!r.verdict) r.verdict = r.status === 'ok' ? 'ok' : (r.verify?.status === 0 ? 'network' : 'source_bug')
  return r
}

async function main() {
  let files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort()
  if (ONLY) files = files.filter((f) => ONLY.some((n) => f === n + '.js'))
  console.log(`播放链路深检: ${files.length} 个源  TIMEOUT=${TIMEOUT}ms  dir=${DIR}\n`)
  const out = []
  for (const f of files) {
    const r = await checkOne(path.join(DIR, f))
    out.push(r)
    const tag = r.status === 'ok' ? '✅' : r.status === 'pan' ? '⚠️' : '❌'
    const v = r.verify || {}
    console.log(`${tag} ${r.file.padEnd(13)} ${String(r.totalMs).padStart(6)}ms  环节=${r.stage.padEnd(11)} 类型=${(r.mediaType || '-').padEnd(8)} ${r.detail.slice(0, 70)}`)
    if (r.playUrl) console.log(`   └ 播放地址: ${r.playUrl.slice(0, 150)}`)
    if (r.note) console.log(`   └ ${r.note}`)
    if (v.segUrl) console.log(`   └ 分片: HTTP ${v.segStatus} ${v.segBytes}B  TS=${v.segIsTs}  ${v.segUrl.slice(0, 120)}`)
    if (r.lastReqs?.length && r.status !== 'ok') console.log(`   └ 末尾请求: ${r.lastReqs.join(' | ').slice(0, 220)}`)
    if (r.toasts?.length) console.log(`   └ 源内部日志: ${r.toasts.join(' | ').slice(0, 240)}`)
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
  const ok = out.filter((r) => r.status === 'ok')
  const pan = out.filter((r) => r.status === 'pan')
  console.log(`\n=== 汇总 === 可播 ${ok.length} / ${out.length}${pan.length ? `  网盘源(无直链) ${pan.length}` : ''}`)
  console.log(`  详细结果: ${OUT}`)
  const bad = out.filter((r) => r.status === 'fail')
  if (bad.length) console.log(`  失败源: ${bad.map((r) => `${r.file}(${r.stage})`).join(', ')}`)
}
if (require.main === module) main()
module.exports = { loadCtx, toObj, makeFetch, makeHtml, makeCache, makeUtils, makeJSEncrypt, verifyStream, classify, readHead, TIMEOUT, UA }
