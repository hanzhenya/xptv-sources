# xptv-sources — 自建 XPTV 精选源

独立维护的 8 个 XPTV 可用源，**完全自控**：不依赖上游 Yswag 仓库，不会被同步覆盖，可以随站点改版随时自己修。

## 导入方法

在 XPTV 设置 → 订阅配置里填入下面这个地址（或导入本地 `subs/vod.json`）：

```
https://raw.githubusercontent.com/hanzhenya/xptv-sources/main/subs/vod.json
```

> **首次使用需先创建空仓库**（本机 GitHub API 凭据已失效，SSH 不支持自动建库，这一步必须手动做一次）：
> 1. 打开 https://github.com/new?name=xptv-sources
> 2. 可见性选 **Public**；README / .gitignore / License **三个都不要勾**（必须是空仓库，否则无法直接 push）
> 3. 点 **Create repository**
> 4. 回到项目目录执行 `./tools/publish.sh`，推送完成后上面的订阅地址即可访问
>
> 仓库创建前该地址返回 404 属正常现象。

## 收录的 8 个源

全部经过真实请求验证：按配置 URL 下载 js → 在 XPTV 运行时沙箱里实跑 `getConfig()` + `getCards()` → 成功拿到列表。

| 源名 | api | 列表条数 | 说明 |
|---|---|---:|---|
| anime1 | `csp_anime1` | 1964 | 列表量最大 |
| huya | `csp_huya` | 120 | 全混淆版 js（114KB），真机偶有兼容问题 |
| avdb | `csp_avdb` | 100 | |
| 多多影音 | `csp_yydsys` | 72 | |
| 4k-av | `csp_4kav` | 42 | |
| hdmoli | `csp_hdmoli` | 40 | |
| 农民影视 | `csp_wwgz` | 30 | **已修复播放**（见下） |
| PPnix | `csp_ppnix` | 24 | |

`api` 命名沿用仓库既有体系（`subs/vod.json`、`subs/18.json`、`subs/pan.json` 反查得到），命名不匹配会导致 XPTV 加载不出源，不要随意改。

## 农民影视播放修复（本项目的核心价值）

**症状**：海报、列表都正常，也有流量（约 4.88 kb/s），但点播放一直卡在 00:00。

**根因**：列表接口 `vip.wwgz.cn:5200` 正常，但原 `getPlayinfo()` 强制把播放地址送去 `https://api.nmvod.me:520/player/` 做二次解析。该域名 DNS 能解析（128.14.74.x），但 80 / 443 / 520 端口在境内**全部 TCP 超时**，播放链路因此断掉。截图里的低速流量其实是列表/海报请求，不是视频流。

实测播放页内嵌的 `mac_url` 本身已经是**可直接播放的 m3u8 直链**（`https://v.lzcdn27.com/.../index.m3u8`），主清单 200、子清单 200、分片 693KB 且首字节 `0x47` 是合法 TS 同步字节 —— 视频数据完全正常，那个解析层纯属多余。

**修复**（`js/wwgz.js`，2026-11-12）：
- ✅ `getPlayinfo()` 改为 **m3u8 直链优先**，直接返回 `mac_url`
- ✅ 解析接口降级为**兜底**，仅在非直链且需要解析时才调用
- ✅ `getTracks()` 的 `mac_from` / `mac_url` 正则补空值保护，站点改版时不再抛异常

回归验证：`api.nmvod.me` 请求从链路中完全消失，直接返回可播 m3u8。

## 目录结构

```
xptv-sources/
├── README.md            本说明
├── subs/
│   └── vod.json         XPTV 导入用订阅配置（8 个源）
├── js/                  8 个扩展脚本
│   ├── anime1.js  huya.js  avdb.js  yydsys.js
│   └── 4kav.js  hdmoli.js  wwgz.js  ppnix.js
└── tools/
    ├── check.js         可用性检测（Node 沙箱模拟 XPTV 运行时）
    ├── package.json     检测脚本依赖
    └── publish.sh       一键提交推送
```

## 常用操作

**改完某个源后推送**
```bash
cd ~/Desktop/xptv-sources
./tools/publish.sh              # 默认仓库 xptv-sources
./tools/publish.sh 其他仓库名    # 指定仓库
```

**复测所有源是否还活着**
```bash
cd ~/Desktop/xptv-sources/tools
npm install
TIMEOUT=15000 node check.js ../js
```
`check.js` 会模拟 XPTV 运行时 API（`createCheerio` / `$fetch` / `$cache` / `$utils` / `$html` / `createCryptoJS` / `loadJSEncrypt`），逐个真实发请求取列表条数，并对域名做独立 HTTP 复核，区分「源代码坏了」和「网络不通」。

## 注意事项

- 🌐 **境内网络视角**：检测结果表明境外站点直连普遍不通。若某源失效，先确认是网络问题还是源逻辑问题，别急着改代码。
- ⏱️ **GitHub raw 限流**：短时间内连续请求会返回 `502 Tunnel connection failed`，这是限流不是链接失效，间隔 2–3 秒重试即可。XPTV 里某源首次加载失败时刷新一下通常就好。
- 🔒 **huya** 是全混淆脚本，本机沙箱跑通 120 条，但真机偶有兼容问题；若加载异常，直接删掉 `subs/vod.json` 里对应那一条，不影响其他 7 个。
- 📌 上游 Yswag 仓库的修复不会自动同步过来；如需跟进上游改动，手动对比 `js/` 下同名文件即可。
