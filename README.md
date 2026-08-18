# PT Monitor v0.3.0

一个自托管的 PT 账号状态仪表盘原型：**复用 Prowlarr 的登录 Cookie，复用 PT-depiler 的站点解析逻辑**，采集账号上传/下载/分享率/魔力/时魔/做种/H&R 等信息，并保存 SQLite 历史。

> v0.3.0 是从 CLI PoC 向正式项目形态迈出的第一版：保留 CLI，同时加入内置 Web UI、SQLite snapshot 和定时采集。

## 特点

- 不重复维护 Cookie：读取 Prowlarr `prowlarr.db`
- PT-depiler 负责 NexusPHP / Gazelle / Unit3D 等站点差异
- 单进程、单端口
- 内置 SQLite，不要求 Prometheus/Grafana
- Web UI 展示当前账号状态和 7 天简单趋势
- 可选 FlareSolverr fallback
- CLI 仍可单站调试
- 不输出 Cookie 值
- 无运行时配置文件，全部使用 CLI 参数

## 架构

```text
Prowlarr DB
  ├─ Indexers.Settings
  └─ IndexerStatus.Cookies
          │
          ▼
      auth runtime
          │
          ▼
 PT-depiler adapters
          │
          ▼
   normalized snapshot
       │         │
       ▼         ▼
    SQLite     CLI JSON
       │
       ▼
    Web API
       │
       ▼
    Web UI
```

## 要求

- Node.js >= 24
- pnpm 10
- curl、tar（`pnpm bootstrap` 通过固定 commit 的 GitHub tarball 获取 PT-depiler，不依赖 git）
- 能只读访问 Prowlarr app-data 目录（至少 `prowlarr.db`，建议整个目录只读挂载，以便读取 `Definitions/`）

## 安装

```bash
corepack enable
pnpm install
pnpm bootstrap
```

`pnpm bootstrap` 会拉取并固定 PT-depiler commit：

```text
82df7210244d9352d4f9792a17905f51f8ed2304
```

然后应用 Node compatibility overlay。

## 直接启动 Web UI

显式指定要监控的 PT-depiler definitions：

```bash
pnpm cli serve \
  --db /data1/mediacenter/prowlarr/config/prowlarr.db \
  --sites hdtime,pter,ultrahd
```

打开：

```text
http://127.0.0.1:9709
```

默认每 30 分钟采集一次，并立即执行一次首次采集。历史保存在：

```text
./data/pt-monitor.db
```

也可以让它尝试自动发现 Prowlarr definition 与 PT-depiler definition 的交集：

```bash
pnpm cli serve \
  --db /data1/mediacenter/prowlarr/config/prowlarr.db
```

当前自动发现只做保守匹配；名称/definition 不一致的站建议使用 `--sites`。

### Serve 参数

```text
--db PATH                     Prowlarr DB，必填
--state-db PATH               历史 SQLite；默认 ./data/pt-monitor.db
--sites a,b,c                 PT-depiler definition 列表
--listen ADDRESS              默认 127.0.0.1
--port PORT                   默认 9709
--interval-minutes N          默认 30
--timeout-ms MS               默认 30000
--user-agent UA               自定义 User-Agent
--flaresolverr-url URL        开启 FlareSolverr fallback
--flaresolverr-timeout-ms MS  默认 90000
--debug                       PT-depiler 调试日志输出到 stderr
```

如果要局域网访问：

```bash
pnpm cli serve \
  --db /prowlarr/prowlarr.db \
  --listen 0.0.0.0 \
  --sites hdtime,pter
```

**当前版本没有 Web 登录认证。不要直接暴露到公网。**

## Web API

```text
GET  /api/health
GET  /api/sites
GET  /api/sites/:definition/history?hours=168
POST /api/collect
```

API 不返回 Cookie。

## CLI

### 查看 indexer

```bash
pnpm cli list --db /data1/mediacenter/prowlarr/config/prowlarr.db
```

默认排除：

- `enabled=false`
- 能明确识别为 `public` 的 Cardigann indexer

无法判断 privacy 的 indexer 保留并标记为 `unknown`。

查看全部：

```bash
pnpm cli list --db ... --all
```

### 单站抓取（不写历史）

```bash
pnpm cli fetch hdtime \
  --db /data1/mediacenter/prowlarr/config/prowlarr.db
```

### 单站抓取并写 SQLite

```bash
pnpm cli snapshot hdtime \
  --db /data1/mediacenter/prowlarr/config/prowlarr.db \
  --state-db ./data/pt-monitor.db
```

### 显式指定 Prowlarr indexer

```bash
pnpm cli fetch pter \
  --db /path/to/prowlarr.db \
  --indexer PTer
```

## Snapshot 模型

当前 normalized snapshot 包含：

```text
definition
collectedAt
status / statusName
uploaded
downloaded
ratio
bonus
bonusPerHour
seedingCount
seedingSize
hnrUnsatisfied
hnrPreWarning
username
level
```

原始 PT-depiler user-info JSON 也保存在 SQLite `raw_json` 中，便于以后增加站点特有字段；不会保存 Cookie。

## SQLite

数据库目前只有一张核心表：

```text
snapshots
```

每次成功执行 collector（包括 `parseError` / `needLogin` 等 PT-depiler 状态返回）都会保存一条 snapshot。真正抛出的 transport/setup 错误只记录日志，不制造假 snapshot。

## Cloudflare

可以启用 FlareSolverr：

```bash
pnpm cli serve \
  --db /path/to/prowlarr.db \
  --sites pter,hdtime \
  --flaresolverr-url http://127.0.0.1:8191/v1
```

FlareSolverr 返回的新 Cookie 只在当前进程内存里使用，不写回 Prowlarr。

## Docker（实验性）

```bash
docker build -t pt-monitor .
docker run -d \
  --name pt-monitor \
  -p 9709:9709 \
  -v /data1/mediacenter/prowlarr/config:/prowlarr:ro \
  -v "$PWD/data:/app/data" \
  -e PROWLARR_DB=/prowlarr/prowlarr.db \
  -e SITES=hdtime,pter,ultrahd \
  pt-monitor
```

先修改 Prowlarr volume 路径。常用环境变量（均有默认值，除 `PROWLARR_DB` 外均可省略）：

```text
PROWLARR_DB                 Prowlarr prowlarr.db 路径；默认 /prowlarr/prowlarr.db
STATE_DB                    历史 SQLite；默认 /app/data/pt-monitor.db
SITES                       PT-depiler definition 列表，逗号分隔；默认自动发现
LISTEN                      默认 0.0.0.0
PORT                        默认 9709
INTERVAL_MINUTES            默认 30
TIMEOUT_MS                  默认 30000
USER_AGENT                  自定义 User-Agent
FLARESOLVERR_URL            启用 FlareSolverr fallback
FLARESOLVERR_TIMEOUT_MS     默认 90000
DEBUG                       设 1 或 true 开启 PT-depiler 调试日志
```

也可在 `docker run` 末尾追加 CLI 参数覆盖。

## 测试

```bash
pnpm test
```

当前覆盖：

- Prowlarr configured/runtime Cookie merge
- Prowlarr enabled/privacy 解析
- normalized snapshot
- SQLite latest/history

## v0.3.0 仍然没有做

- 完整的 Prowlarr ↔ PT-depiler 自动站点映射
- UI 中配置站点映射
- Web 登录/多用户
- H&R 明细/deadline
- 新人考核/升级进度规则
- M-Team 官方 API collector
- 通知
- Prometheus `/metrics`
- 自动 retention/downsampling

这些都应该建立在 collector + normalized model + history 稳定之后。

## 安全

`prowlarr.db`、Cookie、passkey 都属于认证秘密：

- Prowlarr app-data 建议只读挂载
- 不要把 DB 或 Cookie 提交到 Git
- 不要把登录后的完整 HTML 上传到公共 issue
- Web UI 当前无认证，默认只监听 `127.0.0.1`

## License

本项目代码使用 MIT License。PT-depiler 仍按其自身 MIT License 使用；`vendor/PT-depiler` 由 bootstrap 获取并保留上游许可证。
