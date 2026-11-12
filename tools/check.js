// XPTV/TVBox 源运行时沙箱: 模拟 XPTV 注入的全局 API,逐个源真实发请求验证可用性
const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const CryptoJS = require('crypto-js')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function createCheerio() {
  return cheerio
}

// XPTV 提供给扩展的 CryptoJS 工厂
function createCryptoJS() {
  return CryptoJS
}

// XPTV 的 $cache: 简易内存 KV
function makeCache() {
  const m = new Map()
  return {
    get: (k) => (m.has(k) ? m.get(k) : ''),
    set: (k, v) => { m.set(k, v); return v },
    has: (k) => m.has(k),
    remove: (k) => m.delete(k),
    clear: () => m.clear(),
  }
}

// XPTV 的 $html: 基于 cheerio 的选择器封装
function makeHtml() {
  const pick = (root, sel) => {
    const $ = cheerio.load(root || '')
    return $(sel).toArray()
  }
  return {
    elements: (root, sel) => pick(root, sel),
    element: (root, sel) => pick(root, sel)[0] || null,
    attr: (el, sel, name) => {
      if (!el) return ''
      const $ = cheerio.load(el.outerHTML || '')
      const v = $(sel).first().attr(name)
      return v == null ? '' : String(v)
    },
    text: (el, sel) => {
      if (!el) return ''
      const $ = cheerio.load(el.outerHTML || '')
      if (sel) return $(sel).first().text().trim()
      return $(el).text().trim()
    },
    html: (el, sel) => {
      if (!el) return ''
      const $ = cheerio.load(el.outerHTML || '')
      return sel ? $(sel).first().html() : $.html()
    },
    remove: (el) => el,
  }
}

// XPTV 的 loadJSEncrypt: 提供 JSEncrypt 的 RSA 能力
function makeJSEncrypt() {
  const NodeCrypto = require('crypto')
  function RSAKey(setPublic, setPrivate) {
    this.setPublic = setPublic || ''
    this.setPrivate = setPrivate || ''
  }
  RSAKey.prototype.encrypt = function (text) {
    try {
      const c = NodeCrypto.createPublicKey({
        key: this.setPublic.replace(/\\n/g, '\n'),
        format: 'pem',
      })
      return NodeCrypto.publicEncrypt({ key: c, padding: NodeCrypto.constants.RSA_PKCS1_PADDING }, Buffer.from(text)).toString('base64')
    } catch (e) {
      return ''
    }
  }
  RSAKey.prototype.decrypt = function (text) {
    try {
      const c = NodeCrypto.createPrivateKey({
        key: this.setPrivate.replace(/\\n/g, '\n'),
        format: 'pem',
      })
      return NodeCrypto.privateDecrypt({ key: c, padding: NodeCrypto.constants.RSA_PKCS1_PADDING }, Buffer.from(text, 'base64')).toString()
    } catch (e) {
      return ''
    }
  }
  return {
    RSAKey,
    setPublic: (k) => new RSAKey(k, ''),
    setPrivate: (k) => new RSAKey('', k),
    encrypt: (text, key) => new RSAKey(key, '').encrypt(text),
    decrypt: (text, key) => new RSAKey('', key).decrypt(text),
  }
}

function makeUtils(log) {
  return {
    toastInfo: (m) => log.toasts.push(['info', String(m)]),
    toastError: (m) => log.toasts.push(['error', String(m)]),
    toastWarn: (m) => log.toasts.push(['warn', String(m)]),
    toast: (m) => log.toasts.push(['info', String(m)]),
    openSafari: (u, ua) => log.opened.push(u),
    getAndroidVersion: () => 30,
    getDeviceId: () => 'sandbox-device',
    formatTime: (t) => String(t),
    isEmpty: (o) => !o,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }
}

function argsify(o) {
  if (typeof o === 'string') {
    try { o = JSON.parse(o) } catch (e) { o = {} }
  }
  return o || {}
}

function jsonify(o) {
  return JSON.stringify(o)
}

// $fetch 兼容层: XPTV 用 axios 风格, 返回 {data, status, headers}
function makeFetch(log, timeoutMs) {
  const doReq = async (method, url, body, opts) => {
    const headers = Object.assign(
      { 'User-Agent': UA, Accept: '*/*' },
      (opts && opts.headers) || {}
    )
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs || 15000)
    const t0 = Date.now()
    try {
      const init = { method: method.toUpperCase(), headers, signal: ac.signal, redirect: 'follow' }
      if (body !== undefined && body !== null && init.method !== 'GET' && init.method !== 'HEAD') {
        init.body = typeof body === 'string' ? body : JSON.stringify(body)
      }
      const res = await fetch(url, init)
      const text = await res.text()
      const ms = Date.now() - t0
      log.reqs.push({ url, method: init.method, status: res.status, ms })
      let data = text
      const ct = (res.headers.get('content-type') || '')
      if (/json/i.test(ct)) { try { data = JSON.parse(text) } catch (e) {} }
      return { data, status: res.status, headers: res.headers }
    } catch (e) {
      const ms = Date.now() - t0
      const msg = e.name === 'AbortError' ? 'TIMEOUT' : (e.cause?.code || e.code || e.message)
      log.reqs.push({ url, method: String(method).toUpperCase(), status: 0, ms, err: msg })
      throw new Error(msg)
    } finally {
      clearTimeout(timer)
    }
  }
  return {
    get: (url, opts) => doReq('GET', url, null, opts),
    post: (url, body, opts) => doReq('POST', url, body === undefined ? '{}' : body, opts),
    request: (cfg) => doReq(cfg.method || 'GET', cfg.url, cfg.data, cfg),
    fetch: (url, opts) => doReq('GET', url, null, opts),
    head: (url, opts) => doReq('HEAD', url, null, opts),
  }
}

// 提取脚本里出现的站点域名,用于诊断
function extractDomains(src) {
  const set = new Set()
  const re = /https?:\/\/([a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/g
  let m
  while ((m = re.exec(src))) set.add(m[1])
  // 也抓解混淆后可能出现的裸域名
  const re2 = /['"]([a-z0-9-]+\.(?:com|net|org|cc|tv|io|xyz|top|vip|app|me|co|club|fun|pro|site|link|live|work|shop|icu|info|space|store))['"]/gi
  while ((m = re2.exec(src))) set.add(m[1])
  return [...set]
}

// 判断站点是否有已知墙/证书问题标记
async function checkOne(file, timeoutMs) {
  const src = fs.readFileSync(file, 'utf8')
  const log = { reqs: [], toasts: [], opened: [] }
  const result = {
    file: path.basename(file),
    domains: extractDomains(src).slice(0, 6),
    status: 'unknown',
    detail: '',
    listCount: 0,
    tabs: 0,
    firstReqStatus: null,
    totalMs: 0,
  }
  const t0 = Date.now()
  try {
    // 沙箱全局环境 —— 模拟 XPTV 注入的全部运行时 API
    const sandboxGlobals = {
      createCheerio, argsify, jsonify, cheerio, createCryptoJS,
      $cache: makeCache(),
      $utils: makeUtils(log),
      $html: makeHtml(),
      loadJSEncrypt: makeJSEncrypt,
      $print: (...a) => log.toasts.push(['print', a.map(String).join(' ')]),
      $config_str: '{}',
      $config: {},
      $fetch: makeFetch(log, timeoutMs),
      console: { log: () => {}, error: () => {}, warn: () => {} },
      setTimeout, clearTimeout, setInterval, clearInterval,
      Buffer, URL, URLSearchParams, TextDecoder, TextEncoder,
      atob: (s) => Buffer.from(s, 'base64').toString('binary'),
      btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
      fetch: global.fetch,
      crypto: global.crypto,
      Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Promise,
      parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, escape, unescape,
    }
    sandboxGlobals.global = sandboxGlobals
    sandboxGlobals.globalThis = sandboxGlobals
    sandboxGlobals.window = sandboxGlobals
    sandboxGlobals.self = sandboxGlobals

    const vm = require('vm')
    const ctx = vm.createContext(sandboxGlobals)
    vm.runInContext(src, ctx, { filename: file, timeout: 20000 })

    // 1) getConfig — 原生风格入口
    let cfg = null
    if (typeof ctx.getConfig === 'function') {
      const cfgRaw = await ctx.getConfig()
      cfg = typeof cfgRaw === 'string' ? JSON.parse(cfgRaw) : cfgRaw
      result.tabs = Array.isArray(cfg?.tabs) ? cfg.tabs.length : 0
      result.title = cfg?.title || ''
      result.style = 'native'
    } else {
      // 混淆版: 找任意可调用的导出函数(常见 home/detail/search/分类)
      result.style = 'obfuscated'
      const fnNames = Object.keys(ctx).filter((k) => typeof ctx[k] === 'function' && !k.startsWith('_'))
      const candidate = ['home', 'getHome', 'category', 'getCategory', 'list', 'getList', 'vlist', 'getVList']
        .find((n) => fnNames.includes(n))
      result.exports = fnNames.filter((n) => !/^(argsify|jsonify|createCheerio)$/.test(n)).slice(0, 12)
      if (!candidate) {
        result.status = 'no_entry'
        result.detail = `无原生入口,导出: ${result.exports.join(',') || '(空)'}`
        result.totalMs = Date.now() - t0
        return result
      }
      // 用最小 ext 试调
      const cRaw = await ctx[candidate]({ page: 1, filter: true })
      const c = typeof cRaw === 'string' ? JSON.parse(cRaw) : cRaw
      const list = Array.isArray(c?.list) ? c.list : Array.isArray(c) ? c : []
      result.listCount = list.length
      result.firstTitle = list[0]?.vod_name || list[0]?.title || ''
      result.firstReqStatus = log.reqs.length ? log.reqs[0].status : null
      result.status = list.length ? 'ok' : 'empty'
      result.detail = list.length ? `列表 ${list.length} 条(混淆版 ${candidate})` : '请求成功但列表为空'
      result.totalMs = Date.now() - t0
      result.reqCount = log.reqs.length
      return result
    }

    // 2) getCards 取首页/第一个 tab
    if (typeof ctx.getCards !== 'function') {
      result.status = 'no_getCards'
      result.detail = '缺少 getCards'
      result.totalMs = Date.now() - t0
      return result
    }
    const ext = { page: 1, ...(result.tabs > 0 ? (cfg.tabs[0].ext || {}) : {}) }
    const cardsRaw = await ctx.getCards(ext)
    const cards = typeof cardsRaw === 'string' ? JSON.parse(cardsRaw) : cardsRaw
    const list = Array.isArray(cards?.list) ? cards.list : []
    result.listCount = list.length
    result.firstReqStatus = log.reqs.length ? log.reqs[0].status : null
    result.firstTitle = list[0]?.vod_name || ''

    if (list.length > 0) {
      result.status = 'ok'
      result.detail = `列表 ${list.length} 条`
    } else {
      // 尝试第一个非首页 tab
      let got = false
      for (let i = 1; i < (cfg?.tabs?.length || 0) && !got; i++) {
        try {
          const c2 = await ctx.getCards({ page: 1, ...(cfg.tabs[i].ext || {}) })
          const p = typeof c2 === 'string' ? JSON.parse(c2) : c2
          if (Array.isArray(p?.list) && p.list.length) {
            result.listCount = p.list.length
            result.status = 'ok'
            result.detail = `列表 ${p.list.length} 条(来自第${i + 1}个tab)`
            got = true
          }
        } catch (e) {}
      }
      if (!got) {
        result.status = 'empty'
        result.detail = '请求成功但列表为空'
      }
    }
  } catch (e) {
    const msg = String(e.message || e)
    result.status = /TIMEOUT|ETIMEDOUT/i.test(msg) ? 'timeout' : 'error'
    result.detail = msg.slice(0, 80)
    if (log.reqs.length) result.firstReqStatus = log.reqs[0].status
  }
  result.totalMs = Date.now() - t0
  result.reqCount = log.reqs.length
  return result
}

// HTTP 层直连复核:独立探测域名可达性,用于区分"源逻辑坏" vs "网络/域名问题"
async function probeDomain(domains, timeoutMs) {
  const out = []
  for (const d of domains.slice(0, 3)) {
    const t0 = Date.now()
    try {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), Math.min(timeoutMs, 10000))
      const res = await fetch('https://' + d + '/', {
        headers: { 'User-Agent': UA },
        signal: ac.signal,
        redirect: 'follow',
      })
      clearTimeout(timer)
      await res.text()
      out.push({ d, code: res.status, ms: Date.now() - t0 })
    } catch (e) {
      out.push({ d, code: 0, err: e.cause?.code || e.name, ms: Date.now() - t0 })
    }
  }
  return out
}

async function main() {
  const dir = process.argv[2] || '/tmp/xptv-ext/js'
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
  const only = process.argv[3]
  const list = only ? files.filter(f => f.includes(only)) : files
  const timeoutMs = Number(process.env.TIMEOUT || 15000)
  const out = []
  const CONC = 4
  let idx = 0
  async function worker() {
    while (idx < list.length) {
      const i = idx++
      const f = path.join(dir, list[i])
      const r = await checkOne(f, timeoutMs)
      if (r.status !== 'ok' && r.domains.length) {
        r.probe = await probeDomain(r.domains, timeoutMs)
        const reachable = r.probe.some((p) => p.code >= 200 && p.code < 500)
        r.verdict = reachable ? 'source_bug' : (r.probe.every((p) => p.code === 0) ? 'network_blocked' : 'domain_dead')
      }
      out.push(r)
      const tag = { ok: '✅', empty: '⚠️', timeout: '⏱️', error: '❌' }[r.status] || '❓'
      const v = { source_bug: '源逻辑', network_blocked: '网络不通', domain_dead: '域名失效' }[r.verdict] || ''
      console.log(`${tag} ${r.file.padEnd(26)} ${String(r.listCount).padStart(4)}条 ${String(r.totalMs).padStart(6)}ms  ${r.detail}  ${v} ${r.domains.slice(0,2).join(',')}`)
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  fs.writeFileSync('/tmp/iptvcheck/result.json', JSON.stringify(out, null, 2))
  console.log('\n=== 汇总 ===')
  const g = {}
  out.forEach(r => { g[r.status] = (g[r.status] || 0) + 1 })
  console.log(JSON.stringify(g))
}

main()
