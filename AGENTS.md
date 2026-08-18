# PT Monitor

Node.js 24 + TypeScript 项目：从 Prowlarr 读取 indexer 认证信息，调用 vendored PT-depiler 采集账号状态。

## Commands

- `corepack enable && pnpm install`: 安装依赖。
- `pnpm bootstrap`: 下载固定版本的 PT-depiler 并应用 Node overlay；首次运行或更新 vendor 后执行。
- `pre-commit run --all-files`: 全量质量检查；CI 在 PR 上执行同一套。
- `pre-commit install`: 安装 git pre-commit hook，让每次提交自动对暂存文件执行检查（新文件需先 `git add` 才会被检查）。
- `scripts/check-backend.sh`: 后端类型检查（`tsc --noEmit`）。
- `scripts/check-frontend.sh`: 前端格式、lint、typecheck 与构建。
- `scripts/check-markdown.sh`: 文档规范检查。
- `scripts/test.sh`: 运行全部测试。
- `pnpm cli doctor --db /path/to/prowlarr.db`: 检查 Prowlarr DB、vendor 和运行环境。
- `pnpm cli list --db /path/to/prowlarr.db --all`: 查看 indexer 名称、definition、Cookie 名称和过期时间，不输出 Cookie 值。
- `pnpm cli fetch DEFINITION --db /path/to/prowlarr.db --debug`: 单站调试采集。

## Runtime Inputs

- `--db` 必须指向 Prowlarr 的 `prowlarr.db`，不能指向 `data/pt-monitor.db`；后者只有 snapshots 表。
- Prowlarr app-data 的 `Definitions/` 目录应与数据库一起只读提供，自动发现需要它判断 Cardigann privacy 和 definition。
- Docker 默认使用 `/prowlarr/prowlarr.db`；宿主机路径通过只读挂载映射到该路径。历史库是 `/app/data/pt-monitor.db`。
- `vendor/`、`data/`、`*.db` 和运行时日志不是源码，不要提交。

## Site Discovery

- 自动发现必须为每个启用且非公开的 Prowlarr indexer 输出“匹配”或“跳过”日志；不能因为缺少 `definitionFile`、文件名不同或自定义实现而静默丢站。
- 站点匹配使用通用信号和评分：definition/id 归一化、PT-depiler metadata 的 `name`/`aka`、配置的 base URL 与 metadata URL。不要添加 `MTeamTp -> mteam` 之类的站点专属映射。
- 发现结果必须保留 `definition` 与 Prowlarr indexer ID 的绑定，采集阶段直接使用该绑定，不要再次仅凭名称猜测 indexer。
- 无匹配或多候选时记录安全的诊断信息（ID、名称、实现、definition、候选及原因），并明确跳过或报歧义；不要猜选一个站点。
- Prowlarr 自定义实现也应通过通用 metadata 匹配处理。当前真实配置中 `MTeamTp`、`DICMusic` 没有 `definitionFile`，但 PT-depiler 分别有 `mteam.ts`、`dicmusic.ts`。

## Credentials

- Prowlarr `Settings` 是通用认证来源；PT-depiler `userInputSettingMeta` 是目标字段声明。先精确匹配字段名，再使用大小写/标点归一化和通用凭据语义（如 `apiKey`/`token`、`passkey`、`username`、`password`）对齐。
- `baseUrl` 也应从 Prowlarr 设置通用传入 PT-depiler；不要为单个站点增加读取入口。
- Cookie、密码、API key、token 和 passkey 只在内存请求链路中使用。日志、CLI JSON、Web API、测试快照和错误信息都不得包含它们的值。
- 认证材料不应一律要求 Cookie：有匹配的 PT-depiler input settings 时，Token/API 站点可以没有 Cookie；只有两类认证材料都缺失时才失败。
- 缺少必需认证字段时，输出字段名和 indexer 标识即可，不输出配置值；优先返回明确的 setup/auth 错误，不让上游产生误导性的 `parseError`。

## Vendored PT-depiler

- 不要直接把长期修复写进 `vendor/PT-depiler`。Node 兼容性改动写入 `patches/adapter.node.ts` 或 `scripts/patch-vendor.mjs`，然后重新运行 `pnpm bootstrap`。
- 修改站点采集逻辑前先查看对应的 PT-depiler definition、schema 和现有测试；保持上游 definition 差异由 metadata/adapter 处理。
- 新增或修改自动发现、认证映射时，使用脱敏的 Prowlarr fixtures 覆盖：精确 definition、归一化 definition、自定义实现、URL/名称匹配、未匹配日志和凭据字段映射。

## Verification

- 代码改动至少运行 `scripts/test.sh` 和 `scripts/check-backend.sh`；提交前运行 `pre-commit run --all-files` 通过全部 hook。
- 涉及 Prowlarr 解析或站点发现时，额外运行 `pnpm cli list --db ... --all` 或等价的脱敏 fixture 测试，确认每个候选 indexer 都有匹配/跳过诊断。
- 涉及真实站点请求时使用 `--debug`，只检查状态、请求目标和错误类型；不要打印完整 HTML、Cookie 或认证 header。
