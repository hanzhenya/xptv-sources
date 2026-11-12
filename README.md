# xptv-sources — 自建 XPTV 可播源

独立维护、**完全自控**的 XPTV 源项目：不依赖上游 `Yswag/xptv-extensions`，不会被同步覆盖，站点改版可以自己修。

> **2026-11-12 第二次全量重检**：把上游仓库 `js/` 下 **72 个源**全部重跑一遍，并首次对所有候选源做了**播放链路深检**（取列表 → 取剧集 → 取播放地址 → 真实拉流）。主订阅已从原先的「8 个能出列表」收敛为 **10 个复验稳定可播**的源。详见 [检测报告](docs/播放链路检测报告.md)。

## 导入方法

在 XPTV 设置 → 订阅配置里填入下面任一地址（或导入本地同名文件）：

| 用途 | 订阅地址 |
|---|---|
| **推荐**：10 个稳定可播 | `https://raw.githubusercontent.com/hanzhenya/xptv-sources/main/subs/vod.json` |
| 与上者内容相同（兼容旧链接） | `https://raw.githubusercontent.com/hanzhenya/xptv-sources/main/subs/playable.json` |
| 回退用：最初的 8 源全量 | `https://raw.githubusercontent.com/hanzhenya/xptv-sources/main/subs/legacy-8.json` |

> ✅ `hanzhenya/xptv-sources` 是**公开仓库**、`main` 分支。所有订阅配置与 js 均按线上 URL 匿名访问验证（HTTP 200、内容与本地逐字节一致），并下载后沙箱实跑复验。
>
> 改完任何文件执行 `./tools/publish.sh` 即可更新，XPTV 端刷新订阅生效。
>
> 本地导入文件：`~/Desktop/XPTV可播源_10个.json`。

## 本次重检结论

```
上游 72 个源
   │  check.js 列表层（getConfig + getCards 真实请求）
   ▼
20 个能出列表 ── 52 个失败：网络不通 23 / 源逻辑 24 / 域名失效 2 / 未分类 3
   │  playcheck.js 播放链路（getTracks → getPlayinfo → 真实拉流校验）
   ▼
首轮 11 个可播 ── 项目目录复验剔除 1 个不稳定（madou 拉流超时）
   ▼
10 个稳定可播（mp4 4 / m3u8 4 / FLV 直播 2）＋ 1 网盘源 ＋ 失败源
```

**关键认知**：列表能出 ≠ 能播放。列表接口与播放接口常是两台不同服务器，本项目里 `农民影视`、`anime1` 都是「海报正常但播放断链」；`hdmoli`、`多多影音` 则是网盘/改版，压根不返回播放流。所以**排查播放问题必须用 `playcheck.js`**。

## 收录的 10 个可播源

全部按「线上 URL 下载 → XPTV 运行时沙箱 → 拉流校验通过」确认，并在**项目最终目录**再复验一次。`api` 命名沿用仓库既有体系（从 `subs/vod.json`、`subs/18.json`、`subs/pan.json` 反查；未收录的按 `csp_<文件名>`），**不要随意改**，对不上会导致 XPTV 加载不出源。

| 源名 | api | 列表条数 | 流格式 | 备注 |
|---|---|---:|:---:|---|
| anime1 | `csp_anime1` | 1964 | mp4 | 列表量最大；**已修 cookie 防盗链** |
| avdb | `csp_avdb` | 100 | m3u8 | 成人向；外部解析服务偶发 502，刷新即可 |
| PPnix | `csp_ppnix` | 24 | m3u8 | 主清单 + 分片 200 |
| 农民影视 | `csp_wwgz` | 30 | m3u8 | **已修复播放**（见下） |
| 小蘋果 | `csp_apple` | 20 | m3u8 | 本次新纳入；TS 分片 `0x47` |
| 7sefun | `csp_7sefun` | 20 | mp4 | 本次新纳入；源内提示「A 线失效、B 线正常」 |
| kuaikaw | `csp_kuaikaw` | 10 | mp4 | 本次新纳入 |
| rrmj | `csp_rrmj` | 30 | mp4 | 本次新纳入；**需带 Referer** 才可播 |
| huya | `csp_huya` | 120 | FLV | 直播流，带时效签名，状态波动 |
| 斗鱼 | `csp_douyu` | 8 | FLV | 本次新纳入；直播流 |

> 👨‍👩‍👧 **家庭内容过滤**：需要给儿童使用时，从 `subs/vod.json` 里删掉 `avdb` 一条即可（其余 9 个不受影响）。

## 未纳入主订阅的源及原因

| 源 | 列表 | 播放深检结论 | 原因 |
|---|:---:|---|---|
| 4k-av | ❌ 本次 | `getCards` 阶段 `ERR_INVALID_URL` | 站点从 `4kmp.com` 迁到 `4k-av.com` 后**间歇性整体 403**（连首页都 403），源逻辑本身正确 |
| hdmoli | ✅ 40 | `getPlayinfo` 抛 `ENOTFOUND` | 站点已转纯网盘下载站，播放器标记全部消失 |
| 多多影音 | ✅ 72 | 网盘源（`pan`） | 源码注释明写「網盤源不需要寫播放」，`getPlayinfo` 返回 `{"urls":[]}` |
| 麻豆社 madou | ✅ 20 | 首轮 m3u8 可播，**复验连续两次拉流超时** | 不稳定且成人向，故剔除；脚本仍留在 `js/` 可自行启用 |
| alist_tvbox / alist_xiaoya | ✅ 2 | `getPlayinfo` 抛异常 | 需自备 AList 服务端地址，非即插即用影视源 |
| czzy / lmm85 / novipnoad / symx | ✅ | 返回 `{"urls":[]}` 或 `[null]` | 播放地址解析失效 |
| zxzj | ✅ 12 | 拉流返回 HTML（403） | 防盗链 / 需登录 |

原 8 源配置完整保留在 `subs/legacy-8.json`，想用随时切回。

## 播放修复记录

### 农民影视 wwgz（列表正常但播放转圈）

**症状**：海报、列表都正常，也有流量（约 4.88 kb/s），点播放却卡在 00:00。

**根因**：列表接口 `vip.wwgz.cn:5200` 正常，但原 `getPlayinfo()` 强制把地址送去 `https://api.nmvod.me:520/player/` 二次解析。该域名 DNS 能解析（128.14.74.x），但 80 / 443 / 520 端口在境内**全部 TCP 超时**。实测播放页内嵌的 `mac_url` 本身就是可直播的 m3u8 直链（主清单 200、子清单 200、分片 693KB、首字节 `0x47`）。

**修复**：`getPlayinfo()` 改为 **m3u8 直链优先**，解析接口降级为兜底；`getTracks()` 的 `mac_from` / `mac_url` 正则补空值保护。回归验证 `api.nmvod.me` 请求从链路中完全消失。

### anime1（cookie 防盗链）

播放 API 会下发 3 个 `set-cookie` 作防盗链签名 —— 实测**不带 Cookie 返回 403，带 Cookie 返回 206 + `ftypisom`**。原实现只认大写 `Set-Cookie`，且用 `split(',')` 粗暴切分（`expires=Thu, 12 Nov ...` 里的逗号会把 cookie 切碎），键名不符时抛异常被 `catch` 吞掉 → 返回空地址。已改为兼容大小写 / 数组 / 合并字符串、按「逗号后紧跟 `key=`」分割、修正 `User-Anent` 拼写、补全相对地址。

### 4k-av（站点侧问题，非脚本 bug）

源逻辑本来是对的（曾实测 m3u8 + `0000.m4s` 分片 200），但站点有间歇性 403 反爬限流。⚠️ **不要改 `appConfig.site`**：试过改成 `www.4k-av.com`，不带尾斜杠同样 403，反而把列表打挂。现只保留空值保护、单集回退、地址兜底与补全。

## 目录结构

```
xptv-sources/
├── README.md                        本说明
├── docs/
│   ├── 播放链路检测报告.md            ★ 全量检测结论、归因、修复记录
│   ├── result-2026-11-12-list.json   72 源列表检测原始数据
│   └── result-2026-11-12-play.json   21 源播放深检原始数据
├── subs/
│   ├── vod.json                     ★ 主订阅：10 个稳定可播（推荐）
│   ├── playable.json                与 vod.json 相同，兼容旧链接
│   └── legacy-8.json                最初的 8 源全量（回退用）
├── js/                              14 个扩展脚本（10 主订阅 + 4 备用/legacy）
└── tools/
    ├── check.js                     列表可用性检测（72 源全量）
    ├── playcheck.js                 ★ 播放链路深检（列表→剧集→地址→真实拉流）
    ├── package.json                 依赖：cheerio + crypto-js
    └── publish.sh                   一键提交推送
```

## 常用操作

**改完某个源后推送**
```bash
cd ~/Desktop/xptv-sources
./tools/publish.sh                # 默认 xptv-sources
```

**★ 复测播放链路（能发现「有海报但播不了」）**
```bash
cd ~/Desktop/xptv-sources/tools
npm install                                        # 首次即可
TIMEOUT=15000 node playcheck.js                     # 项目内 14 个源全量
TIMEOUT=15000 node playcheck.js ../js 4kav,anime1    # 只测指定源
cat playcheck-result.json                           # 结构化结果
```
`playcheck.js` 走完 `getConfig → getCards → getTracks → getPlayinfo → 真实拉流`，校验 m3u8 主/子清单与分片、mp4 `ftyp`、TS `0x47`、FLV 头，并标出**卡在哪一环**；自动识别网盘源（标 `pan`）。

**列表层检测 / 重检整个上游仓库**
```bash
cd ~/Desktop/xptv-sources/tools
TIMEOUT=12000 node check.js ../js                   # 项目内源
TIMEOUT=12000 node check.js /path/to/xptv-extensions/js   # 上游全量 72 源
```
`check.js` 模拟 XPTV 运行时 API（`createCheerio` / `$fetch` / `respHeaders` / `$cache` / `$utils` / `$html` / `createCryptoJS` / `loadJSEncrypt`），并发真实请求取列表条数，并对域名做独立 HTTP 复核，区分「源代码坏了」和「网络不通」。

## 注意事项

- 🌐 **境内直连视角**：本次 23 个源因网络不通而列表失败；挂代理后表现会不同，别急着改代码。
- ⏱️ **GitHub raw 限流**：短时间连续请求会 `502 Tunnel connection failed`，间隔 2–3 秒重试即可；XPTV 里某源首次加载失败刷新一下通常就好。
- 📺 **直播源**（huya / 斗鱼）地址带时效签名，单次检测结果会波动。
- 🛡️ **4k-av** 有反爬限流，刷列表过频会临时 403。
- 📦 **网盘源**需外部网盘 App / 解析，XPTV 播放器无法直放。
- 📌 上游 Yswag 的修复不会自动同步；如需跟进，手动对比 `js/` 下同名文件即可。
