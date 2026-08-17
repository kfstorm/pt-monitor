# pt-monitor + PT-depiler PoC

这个 PoC 验证：**Prowlarr 提供认证 Cookie，PT-depiler 提供站点适配/解析，在普通 Node.js CLI 中抓 PT 账号统计。**

没有配置文件。所有运行参数都通过 CLI 传入。

## 数据流

```text
Prowlarr prowlarr.db
  ├─ Indexers.Settings        手工登录 Cookie
  └─ IndexerStatus.Cookies    运行时 Cookie / 可能含 cf_clearance
             │
             ▼
       Node Cookie runtime
             │
             ▼
PT-depiler definition + schema
  pter.ts -> NexusPHP -> AbstractPrivateSite
             │
             ▼
       getUserInfoResult()
             │
       ┌─────┴─────┐
       │           │
   normal HTTP   Cloudflare
                   │
                   ▼
              FlareSolverr
             │
             ▼
         PT-depiler IUserInfo JSON
```

## PT-depiler 复用方式

PoC 不 fork/copy 整个 PT-depiler。`pnpm bootstrap` 会拉取并固定：

```text
pt-plugins/PT-depiler
82df7210244d9352d4f9792a17905f51f8ed2304
```

然后只覆盖浏览器平台 adapter，并应用少量 Node 兼容 patch。

## 要求

- Linux/macOS
- Node.js >= 24
- git
- pnpm 10（可先执行 `corepack enable`）
- 能访问 GitHub
- 能只读访问 Prowlarr 的 `prowlarr.db` 及同目录 WAL/SHM

Node 24 自带 `node:sqlite`，所以 PoC 不需要 `better-sqlite3`。DOM 使用 `jsdom`。

## 安装

```bash
corepack enable
pnpm install
pnpm bootstrap
```

`pnpm bootstrap` 会 clone PT-depiler、checkout 固定 commit、安装其依赖并应用 Node overlay。

## CLI

```text
pnpm cli doctor --db PATH
pnpm cli list   --db PATH [--all]
pnpm cli fetch  DEFINITION --db PATH [options]
```

### 1. 检查环境

```bash
pnpm cli doctor --db /srv/prowlarr/prowlarr.db
```

输出 vendor patch 状态、Node 版本和 Prowlarr DB 是否存在，不输出 Cookie 值。

### 2. 查看 Prowlarr indexer / Cookie 名称

```bash
pnpm cli list --db /srv/prowlarr/prowlarr.db

# 默认只列出 enabled 且非 public 的 indexer；排查时可查看全部
pnpm cli list --db /srv/prowlarr/prowlarr.db --all
```

类似：

```json
[
  {
    "id": 12,
    "name": "PTer",
    "enabled": true,
    "privacy": "private",
    "cookieNames": ["cf_clearance", "c_secure_pass", "c_secure_uid"],
    "cookieCount": 3,
    "cookieExpiration": "2026-09-01T00:00:00Z"
  }
]
```

`privacy` 为 `public` / `semi-private` / `private`。默认排除 `enabled=false` 和 `privacy=public`；`--all` 可查看全部。Cookie 仍然只显示名称，不显示值。

### 3. 抓 PTer

最短命令：

```bash
pnpm cli fetch pter --db /srv/prowlarr/prowlarr.db
```

默认会用 definition 名 `pter` 去匹配 Prowlarr indexer；匹配不对时显式指定：

```bash
pnpm cli fetch pter \
  --db /srv/prowlarr/prowlarr.db \
  --indexer PTer
```

也可以直接用 indexer ID：

```bash
pnpm cli fetch pter \
  --db /srv/prowlarr/prowlarr.db \
  --indexer 12
```

成功时输出 PT-depiler `IUserInfo`，例如：

```json
{
  "collector": "PT-depiler",
  "definition": "pter",
  "prowlarrIndexer": {
    "id": 12,
    "name": "PTer"
  },
  "cookieNames": ["c_secure_pass", "c_secure_uid"],
  "result": {
    "site": "pter",
    "id": 12345,
    "uploaded": 123456789,
    "downloaded": 1234567,
    "bonus": 1234.5,
    "seedingBonus": 6789,
    "bonusPerHour": 6.2,
    "seeding": 100,
    "seedingSize": 1234567890,
    "hnrPreWarning": 0,
    "hnrUnsatisfied": 0
  }
}
```

具体字段以当前 PT-depiler definition/schema 返回为准。

## Fetch 参数

```text
--db PATH                     Prowlarr DB，必填
--indexer NAME_OR_ID          Prowlarr indexer；默认等于 definition
--base-url URL                覆盖 PT-depiler definition 默认站点 URL
--timeout-ms MS               HTTP timeout，默认 30000
--user-agent UA               覆盖 User-Agent
--flaresolverr-url URL        传入即开启 Cloudflare fallback
--flaresolverr-timeout-ms MS  默认 90000
--debug                       非敏感调试日志
```

例如站点走 FlareSolverr：

```bash
pnpm cli fetch pter \
  --db /srv/prowlarr/prowlarr.db \
  --indexer PTer \
  --flaresolverr-url http://127.0.0.1:8191/v1
```

需要覆盖站点地址时：

```bash
pnpm cli fetch pter \
  --db /srv/prowlarr/prowlarr.db \
  --base-url https://pterclub.net/
```

## Cloudflare

```text
PT-depiler request
    │
    ├─ 自动注入 Prowlarr Cookie
    ▼
normal axios request
    │
    ├─ success -> Document -> PT-depiler parser
    │
    └─ Cloudflare challenge
           │
           ▼
       FlareSolverr
       + 当前 Cookie
           │
           ├─ 本次进程保存新 cf_clearance 等 Cookie
           ├─ 本次进程保存 FlareSolverr User-Agent
           ▼
       Document -> PT-depiler parser
```

FlareSolverr 返回的新 Cookie 不会写回 Prowlarr。

## 为什么没有使用 PT-depiler 的 `getSite()`？

上游 `getSite()` 依赖 Vite `import.meta.glob()`。PoC 直接动态 import 指定 definition：

```text
definitions/pter.ts
       │
       ├─ 有 default class -> 直接用
       └─ 无 default class -> 按 siteMetadata.schema 加载 schema
```

因此 CLI 不需要变成 Vite/WebExtension 应用。

## 调试

```bash
pnpm cli fetch pter \
  --db /srv/prowlarr/prowlarr.db \
  --debug
```

日志只显示 definition、indexer、Cookie 名称等，不打印 Cookie 值。

## 测试

```bash
pnpm test
```

当前测试覆盖 Prowlarr configured/runtime Cookie 合并，包括运行时 Cookie 覆盖旧值和保留 `cf_clearance`。

## 当前边界

还没有：SQLite 历史统计、Prometheus/Grafana exporter、systemd timer/daemon、H&R 明细/deadline、M-Team 官方 API adapter、自动映射所有 Prowlarr indexer → PT-depiler definition。

这个 PoC 首先验证 `pter -> NexusPHP -> getUserInfoResult()` 能否在 Node 环境真实跑通。

## 安全

`prowlarr.db`、Cookie、passkey 都是认证秘密。Prowlarr 目录建议只读挂载；不要打印 Cookie 值，也不要把带登录态的 debug HTML 上传到公共 issue。

## Compatibility note

Node 21+ provides a read-only `globalThis.navigator`. v0.2.3 no longer overwrites it when installing the jsdom globals.



## Troubleshooting

If an older checkout fails with `Cannot find package '@ptd/social'`, update to v0.2.3 and rerun:

```bash
node scripts/patch-vendor.mjs
```

You do not need to reinstall npm dependencies or reclone PT-depiler for this patch.


### v0.2.3: remaining PT-depiler aliases

PT-depiler's `site` package still contains a few `@ptd/site` self-aliases and `@ptd/social` references in shared types or individual definitions. The Node overlay now rewrites all known aliases in the vendored `src/packages/site` tree to relative imports or tiny equivalent helpers, then retains the global alias-leak check. Existing checkouts only need the new `scripts/patch-vendor.mjs` followed by:

```bash
node scripts/patch-vendor.mjs
```

No dependency reinstall or vendor re-clone is required.


## Output streams

`fetch` reserves stdout for the final JSON document. PT-depiler `console.log`/`console.info`/`console.debug` output is suppressed by default. With `--debug`, those upstream diagnostics are redirected to stderr, so piping stdout to tools such as `jq` remains safe.


### `list` filtering

`pnpm cli list --db PATH` defaults to enabled, non-public indexers. `enabled` is read directly from the database. For Cardigann indexers, `privacy` is resolved from the cached `Definitions/<definitionFile>.yml` next to `prowlarr.db`; `privacySource` tells you whether this succeeded. Unknown privacy is retained rather than filtered. Use `--all` to include disabled/public entries.
