<!-- 最后更新: 2026年06月02日 | 生成工具: create-agents-md | 版本: 1 -->

# AGENTS.md

## 项目概览

`nrm-desktop` 是一个 **桌面应用**（非发布型库）：Tauri 桌面端前后端一体，前端 Vue 3 + TypeScript + Vite，后端 Rust/Tauri 2 命令层。用于管理 npm registry、测速、切换源、配置导入导出、托盘菜单、自启动、应用更新等桌面能力。

当前不是 Monorepo，没有独立 HTTP API 服务；前后端通过 Tauri `invoke` 通信。根目录另有 `website/` 独立官网子项目，使用 Nuxt 4 静态生成，通过独立 `package.json` 和 `pnpm-lock.yaml` 管理依赖。未发现数据库、ORM、缓存、队列、鉴权、Docker、OpenAPI/Swagger 配置。

## 技术栈

### 前端技术栈（桌面应用）

| 类型 | 技术 |
| --- | --- |
| 框架 | Vue 3 |
| 构建工具 | Vite 7 |
| 语言 | TypeScript |
| 包管理器 | pnpm |
| 路由 | 主桌面应用未使用 vue-router，主界面由 `src/App.vue` 组合 |
| 状态管理 | Pinia（setup store） |
| 请求/通信 | `@tauri-apps/api/core` 的 `invoke` |
| UI 组件库 | Element Plus、`@element-plus/icons-vue` |
| 样式方案 | UnoCSS、Less、模块化 CSS（`src/styles/`）、Element Plus 主题变量覆盖 |
| 自动导入 | `unplugin-auto-import`（Vue/Pinia/Element Plus API）、`unplugin-vue-components`（Element Plus 组件按需） |
| 动画/工具 | GSAP、VueUse |
| 测试 | Vitest + happy-dom + `@vue/test-utils` |
| 代码规范 | TypeScript strict；ESLint 9 flat config（`eslint.config.js`）；未发现 Prettier 配置 |

### 后端技术栈

| 类型 | 技术 |
| --- | --- |
| 后端语言 | Rust 2021（`rust-toolchain.toml` 锁定 1.88.0） |
| 后端框架 | Tauri 2 |
| 运行时 | Tauri 桌面应用命令层 |
| 包管理器 | Cargo |
| API 风格 | `#[tauri::command]` + 前端 `invoke` |
| 数据访问 | 文件系统、`.npmrc`、应用配置与 registry JSON 逻辑 |
| 网络请求 | `reqwest` + `rustls-tls` 用于测速 |
| 异步 | Tauri async runtime、`tokio` |
| 序列化 | `serde`、`serde_json` |
| 桌面能力 | tray icon、dialog、shell、autostart、updater 插件 |

### 官网技术栈

| 类型 | 技术 |
| --- | --- |
| 位置 | `website/` |
| 框架 | Nuxt 4 + Vue 3 |
| 构建工具 | Nuxt generate（`nuxt generate`） |
| 语言 | TypeScript |
| 包管理器 | pnpm（`website/pnpm-lock.yaml` 独立管理） |
| 路由 | Nuxt 文件路由，`/en/*` 与 `/zh/*` 双语静态路径 |
| 发布 | GitHub Pages，通过 `.github/workflows/deploy-website.yml` |
| 数据来源 | 浏览器端优先读取 `release-manifest.json`，失败回退 GitHub Releases latest API |
| 项目配置 | `website/app/site.config.ts` 控制默认主题、SEO、站点链接、Release 地址和静态资源 |

## 环境要求

| 运行时 | 版本 / 约束 | 来源 |
| --- | --- | --- |
| Node.js | `.nvmrc` 为 `20.19.6`；`engines` 允许 `>=20.19.0 <21` 或 `>=22.12.0` | `.nvmrc`、`package.json` |
| pnpm | `>=8.0.0`（CI 使用 10.18.3） | `package.json`、`ci.yml` |
| Rust | 1.88.0（minimal profile） | `rust-toolchain.toml` |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | Tauri 本地开发；自动从 1420 起寻找可用端口并生成临时 dev config |
| `pnpm ui:dev` | 仅启动 Vite 前端开发服务 |
| `pnpm ui:build` | 前端类型检查并构建：`vue-tsc --noEmit && vite build` |
| `pnpm ui:build:ci` | 仅 Vite 构建（跳过类型检查，CI 安装包构建用） |
| `pnpm typecheck` | 前端 TypeScript 类型检查 |
| `pnpm website:dev` | 启动 `website/` Nuxt 官网开发服务 |
| `pnpm website:build` | 静态生成 `website/` 官网 |
| `pnpm website:preview` | 预览 `website/` Nuxt 构建产物 |
| `pnpm lint` | ESLint 检查 `src` 与根目录 `*.ts`/`*.js` 配置 |
| `pnpm lint:fix` | ESLint 自动修复 |
| `pnpm test` | Vitest 单元测试（`src/**/*.test.ts`、`scripts/**/*.test.mjs`） |
| `pnpm test:watch` | Vitest 监听模式 |
| `pnpm test:coverage` | Vitest 覆盖率报告 |
| `pnpm verify:updater` | 校验 Tauri updater 配置 |
| `pnpm build` | 构建 Tauri 桌面应用并输出产物路径 |
| `pnpm build:pretty` | 同 `pnpm build` |
| `pnpm build:win` | Windows 构建脚本 |
| `pnpm tauri` | 调用 Tauri CLI |
| `pnpm update:logo` | 生成/更新应用图标 |
| `pnpm sync:version` | 将 `package.json` 版本同步到 Tauri/Cargo 配置 |
| `pnpm version` | 同步版本号脚本 |
| `pnpm sync:tags` | 同步远程 git tags |
| `pnpm sync:pull` | 拉取远程并同步 tags |
| `pnpm changelog:context` | 收集上个版本 tag 到当前 HEAD 的 changelog 生成上下文 |
| `pnpm setup:git-hooks` | 安装项目 git hooks（`prepare` 也会自动执行） |

当前 `package.json` 未提供根应用 `preview`、格式化或数据库迁移命令。

## 目录结构

```txt
.
├── src/                 # Vue 前端源码
├── src/styles/          # 模块化全局样式（tokens、组件覆盖、布局等）
├── src-tauri/           # Rust/Tauri 桌面后端与打包配置
├── scripts/             # 开发、构建、版本同步、图标、changelog、git hooks 脚本
├── website/             # 独立官网：Nuxt + Vue + TypeScript，静态生成后部署到 GitHub Pages
├── docs/                # 发布指南、agent skills 等文档
├── .codegraph/          # CodeGraph 代码知识图谱索引（主库 *.db 纳入版本控制）
├── docs/images/         # README 截图资源
├── index.html           # Vite HTML 入口
├── package.json         # pnpm scripts 与前端依赖
├── vite.config.ts       # Vite + Vue + UnoCSS 配置
├── uno.config.ts        # UnoCSS presetWind3、主题色和 shortcuts
├── vitest.config.ts     # Vitest 与覆盖率配置
├── tsconfig.json        # 前端 TypeScript 配置
└── tsconfig.node.json   # Node 侧配置文件类型检查配置
```

```txt
src/
├── api/                 # Tauri invoke 封装：registry、测速、配置、代理等
├── components/          # Vue 业务组件
│   └── RegistryList/    # 源列表、分类、拖拽、弹窗和局部 Less
├── composables/         # 主题、语言、配置 IO、分类管理、拖拽、自启动、关闭行为、应用更新
├── stores/              # Pinia store，目前核心为 registry store
├── styles/              # 模块化全局 CSS（按功能域拆分）
├── utils/               # 错误文案、延迟颜色、Markdown 渲染等纯工具
├── types/               # 前端共享类型
├── main.ts              # Vue 应用入口
└── App.vue              # 主窗口布局
```

```txt
src-tauri/
├── src/
│   ├── lib.rs           # Tauri builder、插件、托盘、command 注册
│   ├── main.rs          # 应用入口
│   ├── commands.rs      # 暴露给前端的 Tauri commands
│   ├── registries.rs    # registry 列表读写与默认源逻辑
│   ├── registry_config.rs # registry 配置读写
│   ├── npmrc.rs         # .npmrc 读取、备份和写入
│   ├── speedtest.rs     # registry 测速
│   ├── app_settings.rs  # 应用设置和语言
│   ├── proxy.rs         # 代理配置
│   ├── project_registry.rs
│   ├── instance_lock.rs # 单实例锁定
│   ├── paths.rs         # 应用路径解析
│   ├── tray.rs          # 托盘菜单逻辑
│   └── models.rs        # Rust 数据模型
├── capabilities/        # Tauri 权限配置
├── icons/               # 应用图标
├── Cargo.toml           # Rust 依赖
└── tauri.conf.json      # Tauri 构建、窗口、bundle 配置
```

主桌面应用当前没有 `src/router`、`src/views`、`src/pages`、`src/assets`、数据库目录或后端 HTTP 路由目录；官网路由由 `website/app/pages` 的 Nuxt 文件路由生成。

```txt
website/
├── app/                 # 官网 Nuxt 源码（srcDir）
│   ├── pages/           # Nuxt 文件路由，包含 `[locale]` 双语路由
│   ├── components/      # 官网导航、下载矩阵、页脚和页面组件
│   ├── composables/     # 官网状态、主题、SEO 和 Release 数据逻辑
│   ├── lib/             # 官网动效与运行时工具
│   ├── assets/          # 官网全局样式
│   ├── types/           # 官网类型定义
│   ├── site.config.ts   # 官网项目配置：SEO、默认主题、链接、资源
│   └── app.vue          # 官网根布局
├── public/images/       # 官网静态图片资源
├── public/release-manifest.json # Release 下载清单（CI 刷新）
├── package.json         # 官网独立脚本与依赖
├── pnpm-lock.yaml       # 官网独立锁文件
├── nuxt.config.ts       # 官网 Nuxt 静态生成配置
└── tsconfig.json        # 官网 TypeScript 配置
```

## Agent 工作流

### 生成版本更新日志

当用户要求生成、填写、刷新或补全版本更新日志时，必须先阅读 `docs/agent-skills/changelog.md` 并按其中流程执行。

标准事实收集命令是：

```bash
pnpm changelog:context
```

如果该命令因为历史最近 tag 和最高版本 tag 不一致而退出，必须询问用户选择 tag；不要自动猜测起点。生成内容只写入 `CHANGELOG.md` 的 `Unreleased` 和 `CHANGELOG.zh-CN.md` 的 `未发布`，具体版本归档仍由 `scripts/prepare-release.mjs` 负责。

## 前后端协作说明

1. 前端请求封装在 `src/api/tauri.ts` 和 `src/api/speedtest.ts`。
2. 后端 command 实现在 `src-tauri/src/commands.rs`，统一注册在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler!`。
3. 前端通过 `invoke<ReturnType>("command_name", payload)` 调用 Rust command，不存在 HTTP 路径、CORS、HTTP 代理或请求拦截器。
4. 新增跨端能力时，需要同时维护前端 API 封装、Rust command 实现、`generate_handler!` 注册和必要的数据类型。
5. 错误通常由 Rust 返回 `Result<_, String>`，前端通过 `formatInvokeErrorMessage`、`formatLatencyErrorMessage` 和 Element Plus message 展示。
6. 前端 `src/types` 与 Rust `models.rs` 没有自动共享类型或代码生成，字段变更必须人工同步检查。
7. 未发现 OpenAPI/Swagger、统一 HTTP 响应结构、鉴权 token 或数据库 schema。

## 文件阅读策略

### CodeGraph 代码智能

项目已启用 CodeGraph（`.codegraph/`）。进行代码探索、符号查找、调用链追踪或影响分析时：

1. **优先**使用 CodeGraph MCP 工具：`codegraph_explore`、`codegraph_query`、`codegraph_callers`、`codegraph_callees`、`codegraph_impact`、`codegraph_context`。
2. 仅在 CodeGraph 未覆盖目标时（如配置文件、静态资源、非代码文件）再回退到 `rg`/Glob/Read。
3. 回答架构问题前，可用 `codegraph context <任务描述>` 获取预构建上下文。
4. 修改函数/类/模块前，用 `codegraph impact <符号>` 评估下游影响。
5. 较大范围代码变更完成后，在项目根目录运行 `codegraph sync` 保持索引同步。

### 修改前端页面

优先阅读：
1. `src/App.vue`
2. 被组合的 `src/components/*`
3. 相关 `src/api/*`
4. `src/stores/registry.ts`
5. 相关 `src/composables/*`

### 修改前端组件

优先阅读：
1. 目标 `.vue` 组件
2. 同目录类似组件和样式文件
3. 父组件或使用位置
4. 相关 composable、store、utils、types
5. `src/styles/` 对应模块或 `uno.config.ts` 中的公共样式变量

### 修改前端接口调用 / Tauri command

优先阅读：
1. `src/api/tauri.ts` 或 `src/api/speedtest.ts`
2. 调用该 API 的组件、store 或 composable
3. `src-tauri/src/commands.rs`
4. `src-tauri/src/lib.rs` 的 `generate_handler!`
5. 相关 Rust 模块，如 `registries.rs`、`npmrc.rs`、`speedtest.rs`、`proxy.rs`、`tray.rs`

### 修改后端命令层

优先阅读：
1. `src-tauri/src/commands.rs`
2. 对应业务模块
3. `src-tauri/src/models.rs`
4. `src-tauri/src/lib.rs`
5. 前端 `src/api/*` 和调用位置

### 修改状态管理

优先阅读：
1. `src/stores/registry.ts`
2. 使用 `useRegistryStore` 或 `storeToRefs` 的组件/composable
3. 相关 API 和类型

### 修改样式

优先阅读：
1. 目标组件 scoped style 或 `src/components/RegistryList/index.less`
2. `src/styles/` 中对应模块（如 `tokens.css`、`element-plus.css`）
3. `uno.config.ts`
4. 同类组件现有 class、Element Plus 覆盖和 CSS 变量

### 修改官网

优先阅读：
1. `website/app/site.config.ts`
2. `website/nuxt.config.ts`
3. 目标 `website/app/pages/` 或 `website/app/components/`
4. `website/app/composables/useSiteState.ts`
5. `.github/workflows/deploy-website.yml`

### 修改构建配置

优先阅读：
1. `package.json`
2. `vite.config.ts`
3. `tsconfig.json`、`tsconfig.node.json`
4. `uno.config.ts`
5. `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`
6. `scripts/*`

### 修改环境变量

当前未发现 `.env*` 文件。优先阅读：
1. `vite.config.ts` 中的 `TAURI_DEV_HOST`
2. `scripts/*` 中传递的 `process.env`
3. `src-tauri` 中读取环境变量的位置

### 排查报错

优先按报错关键词用 `rg` 定位。前端报错看组件、store、API、composable；Tauri invoke 报错同时看前端封装、Rust command、`generate_handler!` 注册和相关 Rust 模块。

## Token 节省规则

1. 先阅读 `AGENTS.md`，再决定是否继续读文件。
2. 代码探索优先 CodeGraph MCP（见上文「CodeGraph 代码智能」），其次用 `rg` 搜索组件名、函数名、command 名、本地存储 key 或报错信息。
3. 只读取与任务直接相关的文件，已确认无关的文件不要重复读取。
4. 不输出完整文件内容，除非用户明确要求。
5. 简单问题直接给结论；复杂问题只展示关键修改点、关键 diff 或必要代码片段。
6. 跨前后端问题沿 `组件/store/composable -> src/api -> commands.rs -> Rust 模块` 的调用链定位。
7. 不为了“更全面”读取图片、锁文件全文、`node_modules`、`dist`、`.git` 或无关业务文件。

## 代码修改原则

1. 优先最小改动，先判断影响范围。
2. 优先复用现有组件、composable、store、API 封装、Rust 模块和样式变量。
3. 保持现有目录组织、命名习惯和代码风格。
4. 不随意升级依赖，不引入不必要的新依赖。
5. 不做与任务无关的重构，不大范围格式化无关文件。
6. 不删除可能被动态引用的 command、事件名、本地存储 key、托盘菜单 id 或配置项。
7. 修改公共组件、全局样式、Pinia store、API 封装、Tauri command、构建脚本前必须判断影响范围。
8. 涉及前后端字段或 command 名变更时，必须检查前端调用和 Rust 实现是否兼容。

### 代码规范（ESLint / TypeScript）

- ESLint 9 flat config；Vue 推荐规则，关闭了部分格式化类规则（`vue/html-indent` 等）。
- `@typescript-eslint/no-unused-vars` 为 error，`_` 前缀可忽略。
- `@typescript-eslint/no-explicit-any` 为 warn。
- TypeScript strict；`noUnusedLocals`、`noUnusedParameters` 开启。
- 未发现 Prettier；不要引入与现有 ESLint 冲突的格式化改动。

### 提交信息风格

遵循 Conventional Commits，中英文混用均可，常见前缀：`feat:`、`fix:`、`refactor:`、`style:`、`chore:`。示例：`feat: 迁移官网至 Nuxt`、`fix: 更新首页标题以更准确地反映下载内容`。

### 实际代码模式

- **导入/导出**：命名导出为主；Vue SFC 默认导出组件；API 函数在 `src/api/*.ts` 中以 named export 封装 `invoke`。
- **错误处理**：Rust 返回 `Result<T, String>`；前端用 i18n formatter + Element Plus message；Vue 全局 `errorHandler` 仅 console.error。
- **状态管理**：Pinia setup store；组件内用 `storeToRefs`；持久化偏好用 VueUse `useLocalStorage`。
- **API 调用**：统一经 `src/api/tauri.ts` / `speedtest.ts`，不散落 `invoke`。
- **命名**：TS/Vue 用 camelCase；文件用 kebab-case 或 PascalCase（组件 `.vue`）；Rust 用 snake_case。

## 专项功能规则

### i18n（国际化）

**桌面应用**

- 语言 composable：`src/composables/useI18n.ts`；支持 `zh-CN` / `en`。
- 持久化键：`LANGUAGE_STORAGE_KEY`（`nrm-desktop-language`）；启动时 `main.ts` 先尝试 Rust `get_app_language`，失败则回退浏览器语言。
- 文案以 `useI18n.ts` 内嵌 `messages` 对象维护，键名形如 `app.xxx`、`registry.xxx`；新增 UI 文案需同时补中英文。
- 错误文案单独模块：`src/utils/invoke-error-i18n.ts`、`src/utils/latency-error-i18n.ts`；Rust 错误经 formatter 再展示。
- 托盘/后端语言同步：`src-tauri/src/app_settings.rs` 与 `get_app_language` / `set_app_language` command。

**官网**

- Nuxt 文件路由：`website/app/pages/[locale]/` 生成 `/en/*` 与 `/zh/*` 静态路径。
- 站点配置与 SEO：`website/app/site.config.ts`；状态与主题：`website/app/composables/useSiteState.ts`。

修改界面文案时，先确认属于桌面端 composable 还是官网页面/组件，避免混用两套 i18n 机制。

### 主题（亮 / 暗 / 自动）

- Composable：`src/composables/useTheme.ts`；可选值 `light` | `dark` | `auto`。
- 持久化键：`nrm-desktop-theme`（JSON 字符串存 localStorage）。
- 暗色模式通过 `document.documentElement.classList.toggle('dark', …)` 驱动；UnoCSS 与 Element Plus 暗色变量依赖 `html.dark`。
- 全局暗色 CSS 变量在 `main.ts` 引入 `element-plus/theme-chalk/dark/css-vars.css`；设计 token 在 `src/styles/tokens.css`。
- 主题切换动画尊重 `prefers-reduced-motion`；修改样式时需同时验证 light/dark/auto 三种状态。

### 应用更新（Tauri Updater）

- 前端逻辑：`src/composables/useAppUpdate.ts`、`useAppUpdatePreferences.ts`；UI：`AppUpdateDialog.vue`。
- 仅在**打包后的 Tauri 运行时**可用（开发模式 `import.meta.env.DEV` 下 updater 不可用）。
- 本地偏好键：`nrm-desktop-update-last-check-at`、`nrm-desktop-update-dismissed-version`；自动检查间隔 24 小时。
- API：`@tauri-apps/plugin-updater` 的 `check()`；安装后通过 `restartApp`（`src/api/tauri.ts`）重启。
- 配置与 manifest：`src-tauri/tauri.conf.json` updater 段、`scripts/verify-updater-setup.mjs`、`scripts/generate-updater-manifest.mjs`。
- CI：`.github/workflows/bootstrap-updater-manifest.yml`；本地校验：`pnpm verify:updater`。

修改 updater 行为或 Release 资产时，需同步检查 Rust 插件配置、前端 composable 和 manifest 生成脚本。

### 跨平台注意事项

- 构建脚本在 Windows 上通过 `process.platform === 'win32'` 分支处理（如 `scripts/spawn-pnpm.mjs`、`tauri-build-win.mjs`、`tauri-build-with-output.mjs`）。
- Windows 专用构建：`pnpm build:win`；通用构建：`pnpm build`（脚本内按平台处理 bundle 产物）。
- CI 跨平台 installer：`.github/workflows/build-installers.yml`、`.github/workflows/installer-build-reusable.yml`。
- Shell spawn：Windows 需 `shell: true`（见 `spawn-pnpm.mjs`）；编写新 Node 脚本时沿用 `path.join` / `process.platform` 判断，避免硬编码 `/` 或 `\`。
- Tauri 平台差异（托盘、单实例、WebView2 等）以 `src-tauri` 模块注释和 Tauri 官方 prerequisite 为准。

## 常见陷阱

- **代理功能暂时关闭**：`src/App.vue` 中有多处 `TODO: 代理功能暂时关闭` 注释，入口和 UI 被注释/隐藏。重新启用前需通读这些 TODO，并同步检查 `src-tauri/src/proxy.rs` 与前端 composable。
- **托盘/单实例逻辑**：涉及 tray、window focus、instance lock 时必须先读 `src-tauri/src/lib.rs`、`tray.rs`、`instance_lock.rs` 中的注释，避免死锁或重复窗口。
- **跨端类型同步**：前端 `src/types` 与 Rust `models.rs` 无代码生成，字段变更必须双向检查。

## 前端专项规则

### 组件规则

- 组件放在 `src/components`，业务复杂组件可使用子目录，如 `RegistryList`。
- 保持 Vue 3 `<script setup lang="ts">` 和 Composition API 写法。
- props/emits 使用 TypeScript 类型声明。
- 公共卡片优先复用 `AppSurfaceCard.vue`。
- 父子通信优先沿用 props、emits、Pinia、provide/inject 或现有 composable，不另起全局事件系统。
- 大组件可用 `defineAsyncComponent` 懒加载（参考 `App.vue` 现有模式）。

### TypeScript 规则

- 共享前端类型放在 `src/types` 或靠近 API/组件处。
- 使用 `@/` alias 引用 `src` 内模块。
- 不强行引入复杂类型设计；跨 Tauri 边界的字段变更要同步检查 Rust struct 和前端 interface。

### 样式规则

- 全局样式按功能域拆分在 `src/styles/`（`tokens.css` 为主题变量入口）。
- UnoCSS shortcuts 和主题色在 `uno.config.ts`，暗色模式依赖 `html.dark`。
- `RegistryList` 的复杂样式在 `src/components/RegistryList/index.less`。
- 组件局部样式优先 scoped style；全局 Element Plus 覆盖必须谨慎评估影响。
- 保持现有 Element Plus、UnoCSS utility、CSS 变量和 Less 混合写法，不随意替换样式方案。

### 前端 API 请求规则

- Element Plus 组件与 `ElMessage`/`ElMessageBox` 等 API 由 Vite 插件自动导入，无需在 SFC 中手写 `import`；类型仍可从 `element-plus` 按需 `import type`。
- 新 Tauri 调用优先封装到 `src/api/tauri.ts` 或 `src/api/speedtest.ts`。
- 组件、store、composable 复用 API 封装，不要散落重复 `invoke`。
- 保持现有错误处理方式：Rust `String` 错误 -> 前端 i18n formatter -> Element Plus 提示。

### 前端状态管理规则

- Pinia setup store 位于 `src/stores/registry.ts`。
- 组件内读取 store ref 时优先使用 `storeToRefs`。
- 主题、语言、分类、排序等本地持久状态使用 VueUse `useLocalStorage`。

## 后端专项规则

### 后端分层规则

- `src-tauri/src/lib.rs` 负责 Tauri 初始化、插件、托盘、事件和 command 注册。
- `src-tauri/src/commands.rs` 负责暴露给前端的 command 和跨模块编排。
- 具体业务逻辑放在同级模块：`registries.rs`、`npmrc.rs`、`speedtest.rs`、`proxy.rs`、`app_settings.rs`、`tray.rs` 等。
- 数据模型放在 `models.rs`；新增返回给前端的数据结构需 `serde` 序列化。

### 后端 API 规则

- 新增 command 使用 `#[tauri::command]`，并注册到 `tauri::generate_handler!`。
- 不随意改变已有 command 名、参数名、返回字段和错误文本，前端依赖这些内容做调用与提示。
- 托盘切换源逻辑有死锁规避说明；涉及 tray/menu/window event 的修改必须先读 `lib.rs` 相关注释。

### 配置与运行规则

- Tauri 配置在 `src-tauri/tauri.conf.json`。
- Tauri `beforeBuildCommand` 会先执行 `pnpm sync:version && pnpm ui:build`。
- `pnpm dev` 会生成 `src-tauri/tauri.dev.auto-port.json` 临时配置并在退出后清理。
- 修改端口、alias、插件、bundle、窗口尺寸、图标、版本同步脚本前必须确认影响范围。

### 日志与错误处理规则

- Rust 侧多处使用 `Result<T, String>` 返回前端可展示错误。
- 后台/托盘相关错误多用 `eprintln!`，不要吞掉关键错误。
- 前端用户提示使用 Element Plus message/message box 和 i18n 文案。
- 不在日志或文档中输出敏感路径、token、密钥或用户配置值。

## CI/CD 与部署

| 工作流 | 触发 | 作用 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push/PR 到 `main`、`dev` | `pnpm typecheck`、`pnpm lint`、`pnpm test`；独立 job 构建 `website/` |
| `.github/workflows/deploy-website.yml` | push 到 `main`（`website/**` 变更）或手动 | 构建并部署官网到 GitHub Pages |
| `.github/workflows/release-installers.yml` | Release 相关 | 构建安装包 |
| `.github/workflows/bootstrap-updater-manifest.yml` | 更新 manifest | Tauri updater 引导 |
| `.github/workflows/build-installers.yml` | 构建安装包 | 跨平台 installer |
| `.github/workflows/installer-build-reusable.yml` | 被其他 workflow 调用 | 可复用 installer 构建 job |

本地可复现 CI 核心检查：

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --dir website install && pnpm website:build
```

- 桌面应用：本地 `pnpm build` / `pnpm build:win`；版本号以 `package.json` 为来源，通过 `scripts/sync-app-version.mjs` 同步。
- 官网：部署目标 GitHub Pages（`https://coderhsh.github.io/nrm-desktop/`）。
- 未发现 Docker、独立后端服务部署。

## 构建、部署与运行规则

- 本地完整开发使用 `pnpm dev`，不要在 Tauri `beforeDevCommand` 中递归调用 `pnpm dev`。
- 前端独立开发使用 `pnpm ui:dev`。
- 前端构建输出为 `dist`，Tauri `frontendDist` 指向 `../dist`。
- 桌面应用构建使用 `pnpm build`；Windows 构建使用 `pnpm build:win`。
- 官网独立开发/构建使用 `pnpm website:dev` / `pnpm website:build`。

## 禁止行为

1. 无关重构。
2. 擅自升级依赖或替换技术方案。
3. 删除业务逻辑、Tauri command、托盘事件、本地存储 key 或动态导入逻辑。
4. 大范围格式化无关文件。
5. 修改与任务无关的文件。
6. 编造不存在的命令、目录、数据库、鉴权、Docker 或部署规范。
7. 绕过现有 API/composable/store/Rust 模块另起一套实现。
8. 未确认影响范围就修改公共模块、全局样式、构建配置或 command 返回结构。
9. 在没有必要时读取大量文件或输出大段无关背景。
10. 把敏感环境变量、用户配置或本地路径细节写入文档或回复。

## 标准任务流程

1. 先阅读 `AGENTS.md`。
2. 理解用户需求并判断任务类型。
3. 用 `rg` 搜索关键词、组件名、函数名、command 名或报错信息。
4. 按文件阅读策略读取最小必要文件。
5. 制定最小修改方案。
6. 修改代码或文档。
7. 检查 TypeScript、Tauri command 兼容性、构建配置和样式影响。
8. 涉及前后端时，检查 `src/api`、`commands.rs`、`lib.rs` 注册和相关 Rust 模块。
9. 总结修改内容。
10. 给出验证方式；若未运行验证，明确说明。

## 输出要求

1. 先给结论。
2. 再列修改点。
3. 最后给验证方式。
4. 不输出无关背景知识。
5. 不重复解释已确认的信息。
6. 不粘贴完整文件，除非用户明确要求。
7. 遇到不确定信息时，说明不确定点和最小验证方式。
8. 涉及多个文件时，用列表说明每个文件的改动。
9. 涉及跨 Tauri 边界改动时，说明 command 兼容性。

## 参考文档

| 文件 | 说明 |
| --- | --- |
| `docs/agent-skills/changelog.md` | 版本更新日志生成流程 |
| `docs/release-install-guide.md` / `.zh-CN.md` | Release 安装指南 |
| `README.md` / `README.zh-CN.md` | 项目介绍与功能说明 |
| `CHANGELOG.md` / `CHANGELOG.zh-CN.md` | 版本历史 |

Agent 遇到相关任务时应阅读上述文件，不要将其全文复制到回复中。

## 自我维护

Agent 在修改项目文件或配置后，应检查 `AGENTS.md` 是否需要同步更新。触发条件包括：

- `package.json` / `website/package.json` 脚本或依赖变更
- `tsconfig*.json`、`vite.config.ts`、`nuxt.config.ts` 构建配置变更
- 新增目录或子项目（如新的 `src/styles/` 模块、`src-tauri` 模块）
- CI/CD 配置变更（`.github/workflows/`）
- 运行时版本变更（`.nvmrc`、`rust-toolchain.toml`、`engines`）
- Lint 配置变更（`eslint.config.js`）

**CodeGraph 同步**：新增/重命名/删除源码文件或较大范围重构后，在项目根目录运行 `codegraph sync`，再报告任务完成。

更新方式：仅修改受影响章节，更新文首 `last-updated` 时间戳，不要整文件重生成。使用命令或路径前先验证其仍存在且有效。

## 维护规则

当项目出现以下变化时，应同步更新 `AGENTS.md`：技术栈、目录结构、构建命令、包管理器、API 封装方式、Tauri command 组织方式、路由或状态管理方式、代码规范、UI 组件库、环境变量规则、Docker/部署方式、数据库/ORM、鉴权权限、前后端接口约定、CI/CD 工作流、官网结构。
