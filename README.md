# xptv-sources — 自建 XPTV 可播源

独立维护、**完全自控**的 XPTV 源项目：不依赖上游 `Yswag/xptv-extensions`，不会被同步覆盖，站点改版可以自己修。

> **2026-11-12 第二次全量重检**：把上游仓库 `js/` 下 **72 个源**全部重跑一遍，并首次对所有候选源做了**播放链路深检**（取列表 → 取剧集 → 取播放地址 → 真实拉流）。主订阅已从原先的「8 个能出列表」收敛为 **10 个复验稳定可播**的源。详见 [检测报告](docs/播放链路检测报告.md)。

## 自动同步状态

每天**北京时间凌晨 03:00**，GitHub Actions 会自动从上游 GitHub 仓库收集全部扩展源，跑「列表检测 → 播放深检」，把确认可播的源收敛进本项目并推送。详细机制见 [每日自动收集](#每日自动收集)。

<!-- AUTO:BEGIN -->
> 🤖 本节由 `automation/auto-collect.js` 自动生成，**请勿手工编辑**（每天北京时间 03:00 更新）。

**最近自动检测**：2026-11-12 12:46（北京时间） · 离线复算 · 上游 72 源 → 列表可用 20 → 播放可播 11 → 主订阅 **10 源** · 本次新增：无 · 移除：无

| 源名 | api | 流格式 | 列表条数 | 连续通过 | 状态 |
|---|---|:---:|---:|:---:|:---:|
| anime1 | `csp_anime1` | mp4 | 1964 | 3 天 | ✅ |
| avdb | `csp_avdb` | m3u8 | 100 | 3 天 | ✅ |
| PPnix | `csp_ppnix` | m3u8 | 24 | 3 天 | ✅ |
| 农民影视 | `csp_wwgz` | m3u8 | 30 | 3 天 | ✅ |
| 小蘋果 | `csp_apple` | m3u8 | 20 | 3 天 | ✅ |
| 7sefun | `csp_7sefun` | mp4 | 20 | 3 天 | ✅ |
| kuaikaw | `csp_kuaikaw` | mp4 | 10 | 3 天 | ✅ |
| rrmj | `csp_rrmj` | mp4 | 30 | 3 天 | ✅ |
| huya | `csp_huya` | flv | 120 | 3 天 | ✅ |
| 斗鱼 | `csp_douyu` | flv | 8 | 3 天 | ✅ |

> 详细归因见 `docs/last-run.json` 与 `docs/result-<日期>-play.json`；手动复测命令见下方「常用操作」。
<!-- AUTO:END -->

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
├── README.md                        本说明（含 AUTO 自动区块）
├── .github/workflows/
│   └── daily-sync.yml               ★ 每日 03:00 定时任务
├── automation/
│   ├── config.json                  ★ 上游、排除名单、修复版、收录阈值
│   └── auto-collect.js              ★ 自动收集主程序
├── docs/
│   ├── 播放链路检测报告.md            全量检测结论、归因、修复记录
│   ├── state.json                   跨天累计命中/失败次数（自动维护）
│   ├── last-run.json                最近一次运行摘要（自动维护）
│   ├── result-2026-11-12-list.json  72 源列表检测原始数据
│   └── result-2026-11-12-play.json  21 源播放深检原始数据
├── subs/
│   ├── vod.json                     ★ 主订阅：稳定可播（自动收敛）
│   ├── playable.json                与 vod.json 相同，兼容旧链接
│   └── legacy-8.json                最初的 8 源全量（回退用，不自动改）
├── js/                              扩展脚本（10 主订阅 + 备用/legacy，自动同步上游）
└── tools/
    ├── check.js                     列表可用性检测（72 源全量）
    ├── playcheck.js                 ★ 播放链路深检（列表→剧集→地址→真实拉流）
    ├── package.json                 依赖：cheerio + crypto-js
    └── publish.sh                   一键提交推送
```

## 每日自动收集

**不用管它，每天自动跑。** 工作流在 `.github/workflows/daily-sync.yml`：

| 项 | 值 |
|---|---|
| 定时 | 每天 **北京时间 03:00**（UTC 19:00，cron `0 19 * * *`） |
| 触发方式 | 定时 / 网页手动 **Run workflow** / 改动 `automation/**` 时自动验证一次 |
| 运行位置 | GitHub 云端 `ubuntu-latest`，**不依赖你的 Mac 开机** |
| 推送凭据 | Actions 自带 `GITHUB_TOKEN`，绕开本机已失效的 API token |

### 每天做什么

1. `git clone --depth=1` 上游 `hanzhenya/xptv-extensions`，取全部 `js/` 扩展源
2. 组装检测目录：上游全量 ＋ 项目独有 ＋ **本地修复版优先覆盖**
3. `tools/check.js` 跑列表层（`getConfig` + `getCards` 真实请求）
4. 对「列表可用源 ＋ 已收录源」跑 `tools/playcheck.js` 播放链路深检（取剧集 → 播放地址 → 真实拉流校验）
5. 按 `automation/config.json` 收敛 `subs/vod.json` / `playable.json` / `js/`
6. 写 `docs/state.json`（累计命中）、`docs/last-run.json`（本次摘要）、`docs/result-<日期>-{list,play}.json`（原始数据）
7. 重写本页 AUTO 自动区块；**有文件变化才**用 `[auto-sync]` 前缀提交推送（自动提交不会再次触发工作流）

> ✅ **部署的就是测过的**：脚本把检测用的 js 复制进 `js/`，避免「测上游版、设备跑旧版」。本地修复版（`anime1` / `wwgz` / `4kav`）列在 `config.pinned`，**永不被上游覆盖**。

### 收录规则（防抖动）

| 规则 | 默认 | 含义 |
|---|---|---|
| `minHitsToAdd` | 2 | 新源要**连续 2 天**播放深检通过才进主订阅 |
| `maxMissesToRemove` | 3 | 已收录源**连续 3 天**失败才移除 |
| `minKeepRatio` | 0.5 | 单次可播数低于已有收录数一半 → 判定「检测环境异常」，**只增不删** |
| `minAbsoluteOk` | 3 | 可播数为 0 → **完全不动**订阅 |

`config.exclude` 里的源（网盘类、站点改版、成人向不稳定）永不自动纳入；`adultKeywords` 命中的新源也会被过滤（**已收录的 `avdb` 不受影响**）。手工从 `vod.json` 删掉的源会被记为 `manualExclude`，不会被自动加回来，家庭内容过滤的改动能一直保留。

### 改配置 / 手动运行

编辑 `automation/config.json` 后 `./tools/publish.sh` 推送即生效。

- **改时间**：改 workflow 的 cron（GitHub 一律用 UTC）。想改北京时间 06:00 → `0 22 * * *`
- **暂停**：仓库 → Actions → `XPTV 每日自动收集` → **Disable workflow**
- **立即跑一次**：Actions 页点 **Run workflow**；勾 `dry_run` 则只输出结论、不写文件不提交
- **加更多上游仓库**：`config.upstreams` 里预留了 `Yswag/xptv-extensions`（`enabled: false`），启用时还需在 workflow 里增加一次 clone 并合并 `js/`
- **本地手动跑完整流程**（用你自己的网络视角定稿）：
  ```bash
  git clone --depth=1 https://github.com/hanzhenya/xptv-extensions.git /tmp/upstream
  cd ~/Desktop/xptv-sources/tools && npm install
  cd ..
  node automation/auto-collect.js \
    --upstream-dir /tmp/upstream/js --subs-dir /tmp/upstream/subs --dry-run
  ```
  去掉 `--dry-run` 才实际写文件，再 `./tools/publish.sh` 推送。离线复算可加 `--from-list <json> --from-play <json>`。

### ⚠️ 一个必须知道的差异

GitHub Actions 的机器在**境外**，网络视角与你家里的 XPTV（境内直连）不完全一样：某些境内可播的站在 CI 里可能超时，某些境内被墙的站在 CI 里反而能通。安全阀（只增不删 / 归零不动）正是为此设计——**最坏情况是订阅「没变好」，绝不会「被清空」**。要按家里网络定稿，本地跑一次上面的命令即可。

> GitHub 的 `schedule` 在整点高峰可能延迟几分钟；连续 60 天仓库无任何活动会暂停定时任务，本项目每天都有提交，不会触发。

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
- 🤖 上游同名脚本**每天 03:00 自动同步**（见[每日自动收集](#每日自动收集)），但 `config.pinned` 里的 3 个本地修复版不会被覆盖。
- 🔧 想永久禁用某个源，把它加进 `automation/config.json` 的 `exclude`；只想临时去掉，直接从 `subs/vod.json` 删掉即可（自动流程会尊重手工删除）。
