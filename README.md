# xptv-sources — 自建 XPTV 精选源

独立维护的 8 个 XPTV 可用源，**完全自控**：不依赖上游 Yswag 仓库，不会被同步覆盖，可以随站点改版随时自己修。

## 导入方法

在 XPTV 设置 → 订阅配置里填入下面任一地址（或导入本地同名文件）：

| 用途 | 订阅地址 |
|---|---|
| **推荐**：5 个验证可播 | `https://raw.githubusercontent.com/hanzhenya/xptv-sources/main/subs/playable.json` |
| 8 个源全量（含网盘/直播源） | `https://raw.githubusercontent.com/hanzhenya/xptv-sources/main/subs/vod.json` |

> 两者区别见 [播放链路检测报告](docs/播放链路检测报告.md)：8 源里只有 5 个能保证直接播放，`hdmoli`/`多多影音` 是网盘源、`huya` 是直播源。

> ✅ **已上线**（2026-11-12）：`hanzhenya/xptv-sources` 为**公开仓库**，`main` 分支。订阅配置与 8 个 js 均已匿名访问验证（HTTP 200、内容与本地逐字节一致），按线上地址下载后沙箱实跑 8/8 出列表。
>
> 以后改完任何文件，执行 `./tools/publish.sh` 即可更新，XPTV 端刷新订阅生效。

## 收录的 8 个源

全部经过真实请求验证：按配置 URL 下载 js → 在 XPTV 运行时沙箱里实跑 `getConfig()` + `getCards()` → 成功拿到列表。**播放状态**列来自 `playcheck.js` 的播放链路深检（详见报告）。

| 源名 | api | 列表条数 | 播放 | 说明 |
|---|---|---:|:---:|---|
| anime1 | `csp_anime1` | 1964 | ✅ | 列表量最大；已修 cookie 防盗链 |
| huya | `csp_huya` | 120 | ⚠️ | 直播 FLV 流，带时效签名，状态波动 |
| avdb | `csp_avdb` | 100 | ✅ | m3u8 + 分片 |
| 多多影音 | `csp_yydsys` | 72 | 📦 | 网盘源，设计上不返回播放流 |
| 4k-av | `csp_4kav` | 42 | ✅* | 曾实测可播；站点有间歇 403 限流 |
| hdmoli | `csp_hdmoli` | 40 | 📦 | 站点已转纯网盘下载站，无在线播放器 |
| 农民影视 | `csp_wwgz` | 30 | ✅ | **已修复播放**（见下） |
| PPnix | `csp_ppnix` | 24 | ✅ | m3u8 + 分片 |

✅ 可直接播放 ｜ ⚠️ 直播/不稳定 ｜ 📦 网盘跳转 ｜ * 站点侧限流

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

## anime1 播放修复（2026-11-12）

播放 API 会下发 3 个 `set-cookie` 作防盗链签名 —— 实测**不带 Cookie 返回 403，带 Cookie 返回 206 + `ftypisom`**。原实现只认大写 `Set-Cookie`，且用 `split(',')` 粗暴切分（`expires=Thu, 12 Nov ...` 里的逗号会把 cookie 切碎）；键名不符时直接抛异常被 `catch` 吞掉 → 返回空地址。已改为兼容大小写 / 数组 / 合并字符串、按「逗号后紧跟 `key=`」分割、修正 `User-Anent` 拼写、补全相对地址。复测 ✅ mp4 可播。

## 4k-av 说明

源逻辑**本来就是对的**（曾实测 m3u8 + `0000.m4s` 分片 200）。但站点从 `4kmp.com` 迁到 `4k-av.com` 后有**间歇性 403 反爬限流**，连首页都可能 403 —— 这就是「海报正常但点播放没反应」的外部原因。

已还原原版域名，只保留空值保护、单集回退、地址兜底与补全。⚠️ **不要改 `appConfig.site`**：试过改成 `www.4k-av.com`，不带尾斜杠同样 403，反而会把列表打挂。遇到加载失败稍后刷新即可。

## 目录结构

```
xptv-sources/
├── README.md                    本说明
├── docs/
│   └── 播放链路检测报告.md       8 源逐一的播放链路结论与修复记录
├── subs/
│   ├── vod.json                 8 源全量订阅
│   └── playable.json            5 个验证可播（推荐）
├── js/                          8 个扩展脚本
│   ├── anime1.js  huya.js  avdb.js  yydsys.js
│   └── 4kav.js  hdmoli.js  wwgz.js  ppnix.js
└── tools/
    ├── check.js                 列表可用性检测
    ├── playcheck.js             ★ 播放链路深检（列表→剧集→地址→真实拉流）
    ├── package.json             两个检测脚本的依赖
    └── publish.sh               一键提交推送
```

## 常用操作

**改完某个源后推送**
```bash
cd ~/Desktop/xptv-sources
./tools/publish.sh              # 默认仓库 xptv-sources
./tools/publish.sh 其他仓库名    # 指定仓库
```

**★ 复测播放链路（推荐，能发现「有海报但播不了」）**
```bash
cd ~/Desktop/xptv-sources/tools
npm install
TIMEOUT=15000 node playcheck.js                      # 8 个源全量
TIMEOUT=15000 node playcheck.js ../js 4kav,anime1     # 只测指定源
cat playcheck-result.json                           # 结构化结果
```
`playcheck.js` 会走完 `getConfig → getCards → getTracks → getPlayinfo → 真实拉流`，校验 m3u8 主/子清单与分片、mp4 `ftyp`、TS `0x47`、FLV 头，并标出**卡在哪一环**。

**列表层检测（另一个维度）**
```bash
TIMEOUT=15000 node check.js ../js
```
`check.js` 模拟 XPTV 运行时 API（`createCheerio` / `$fetch` / `$cache` / `$utils` / `$html` / `createCryptoJS` / `loadJSEncrypt`），逐个真实发请求取列表条数，并对域名做独立 HTTP 复核，区分「源代码坏了」和「网络不通」。

> ⚠️ **列表 8/8 通过 ≠ 8 个都能播**。列表接口和播放接口常是两台不同服务器，本项目里 `anime1`、`农民影视` 都是列表正常但播放断链。所以排查播放问题时**必须用 `playcheck.js`**。

## 注意事项

- 🌐 **境内网络视角**：检测结果表明境外站点直连普遍不通。若某源失效，先确认是网络问题还是源逻辑问题，别急着改代码。
- ⏱️ **GitHub raw 限流**：短时间内连续请求会返回 `502 Tunnel connection failed`，这是限流不是链接失效，间隔 2–3 秒重试即可。XPTV 里某源首次加载失败时刷新一下通常就好。
- 🔒 **huya** 是全混淆脚本，本机沙箱跑通 120 条，但真机偶有兼容问题；若加载异常，直接删掉 `subs/vod.json` 里对应那一条，不影响其他 7 个。
- 📌 上游 Yswag 仓库的修复不会自动同步过来；如需跟进上游改动，手动对比 `js/` 下同名文件即可。
