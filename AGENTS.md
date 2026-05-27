# AGENTS.md

## 项目概览

`nrm-desktop` 是一个 Tauri 桌面端前后端一体项目：前端为 Vue 3 + TypeScript + Vite，后端为 Rust/Tauri 2 命令层。项目用于管理 npm registry、测速、切换源、配置导入导出、托盘菜单、自启动等桌面能力。

当前不是 Monorepo，没有独立 HTTP API 服务；前后端通过 Tauri `invoke` 通信。根目录另有 `website/` 独立官网子项目，使用自己的 `package.json` 和 `pnpm-lock.yaml` 管理依赖，不与桌面应用源码混合。未发现数据库、ORM、缓存、队列、鉴权、Docker、OpenAPI/Swagger 配置。

## 技术栈

### 前端技术栈

| 类型 | 技术 |
| --- | --- |
| 框架 | Vue 3 |
| 构建工具 | Vite 7 |
| 语言 | TypeScript |
| 包管理器 | pnpm |
| 路由 | 主桌面应用未使用 vue-router，主界面由 `src/App.vue` 组合 |
| 状态管理 | Pinia |
| 请求/通信 | `@tauri-apps/api/core` 的 `invoke` |
| UI 组件库 | Element Plus、`@element-plus/icons-vue` |
| 样式方案 | UnoCSS、Less、全局 CSS、Element Plus 主题变量覆盖 |
| 自动导入 | `unplugin-auto-import`（Vue/Pinia/Element Plus API）、`unplugin-vue-components`（Element Plus 组件按需） |
| 动画/工具 | GSAP、VueUse |
| 代码规范 | TypeScript strict；ESLint 9 flat config（`eslint.config.js`）；未发现 Prettier 配置 |

### 后端技术栈

| 类型 | 技术 |
| --- | --- |
| 后端语言 | Rust 2021 |
| 后端框架 | Tauri 2 |
| 运行时 | Tauri 桌面应用命令层 |
| 包管理器 | Cargo |
| API 风格 | `#[tauri::command]` + 前端 `invoke` |
| 数据访问 | 文件系统、`.npmrc`、应用配置与 registry JSON 逻辑 |
| 网络请求 | `reqwest` + `rustls-tls` 用于测速 |
| 异步 | Tauri async runtime、`tokio` |
| 序列化 | `serde`、`serde_json` |
| 桌面能力 | tray icon、dialog、shell、autostart 插件 |

### 官网技术栈

| 类型 | 技术 |
| --- | --- |
| 位置 | `website/` |
| 框架 | Vue 3 |
| 构建工具 | Vite 7 |
| 语言 | TypeScript |
| 包管理器 | pnpm（`website/pnpm-lock.yaml` 独立管理） |
| 路由 | vue-router（Hash History，单 HTML 入口） |
| 发布 | GitHub Pages，通过 `.github/workflows/deploy-website.yml` |
| 数据来源 | 浏览器端读取 GitHub Releases latest API，失败回退到 Releases 页面 |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | Tauri 本地开发；自动从 1420 起寻找可用端口并生成临时 dev config |
| `pnpm ui:dev` | 仅启动 Vite 前端开发服务 |
| `pnpm ui:build` | 前端类型检查并构建：`vue-tsc --noEmit && vite build` |
| `pnpm typecheck` | 前端 TypeScript 类型检查 |
| `pnpm website:dev` | 启动 `website/` 官网开发服务 |
| `pnpm website:build` | 构建 `website/` 官网 |
| `pnpm website:preview` | 预览 `website/` 构建产物 |
| `pnpm lint` | ESLint 检查 `src` 与根目录 `*.ts`/`*.js` 配置 |
| `pnpm lint:fix` | ESLint 自动修复 |
| `pnpm test` | Vitest 单元测试（`src/**/*.test.ts`） |
| `pnpm test:watch` | Vitest 监听模式 |
| `pnpm build` | 构建 Tauri 桌面应用并输出产物路径 |
| `pnpm build:pretty` | 同 `pnpm build` |
| `pnpm build:win` | Windows 构建脚本 |
| `pnpm tauri` | 调用 Tauri CLI |
| `pnpm update:logo` | 生成/更新应用图标 |
| `pnpm sync:version` | 将 `package.json` 版本同步到 Tauri/Cargo 配置 |
| `pnpm version` | 同步版本号脚本 |
| `pnpm changelog:context` | 收集上个版本 tag 到当前 HEAD 的 changelog 生成上下文 |

当前 `package.json` 未提供根应用 `preview`、格式化或数据库迁移命令。

## 目录结构

```txt
.
├── src/                 # Vue 前端源码
├── src-tauri/           # Rust/Tauri 桌面后端与打包配置
├── scripts/             # 开发、构建、版本同步、图标生成脚本
├── website/             # 独立官网：Vite + Vue + TypeScript，部署到 GitHub Pages
├── docs/images/         # README 截图资源
├── index.html           # Vite HTML 入口
├── package.json         # pnpm scripts 与前端依赖
├── vite.config.ts       # Vite + Vue + UnoCSS 配置
├── uno.config.ts        # UnoCSS presetWind3、主题色和 shortcuts
├── tsconfig.json        # 前端 TypeScript 配置
└── tsconfig.node.json   # Node 侧配置文件类型检查配置
```

```txt
src/
├── api/                 # Tauri invoke 封装：registry、测速、配置、代理等
├── components/          # Vue 业务组件
│   └── RegistryList/    # 源列表、分类、拖拽、弹窗和局部 Less
├── composables/         # 主题、语言、配置 IO、分类管理、拖拽、自启动、关闭行为
├── stores/              # Pinia store，目前核心为 registry store
├── utils/               # 错误文案、延迟颜色等纯工具
├── types/               # 前端共享类型
├── main.ts              # Vue 应用入口
├── App.vue              # 主窗口布局
└── style.css            # 全局样式、主题变量、Element Plus 覆盖
```

```txt
src-tauri/
├── src/
│   ├── lib.rs           # Tauri builder、托盘、插件、command 注册
│   ├── main.rs          # 应用入口
│   ├── commands.rs      # 暴露给前端的 Tauri commands
│   ├── registries.rs    # registry 列表读写与默认源逻辑
│   ├── npmrc.rs         # .npmrc 读取、备份和写入
│   ├── speedtest.rs     # registry 测速
│   ├── app_settings.rs  # 应用设置和语言
│   ├── proxy.rs         # 代理配置
│   ├── project_registry.rs
│   └── models.rs        # Rust 数据模型
├── capabilities/        # Tauri 权限配置
├── icons/               # 应用图标
├── Cargo.toml           # Rust 依赖
└── tauri.conf.json      # Tauri 构建、窗口、bundle 配置
```

主桌面应用当前没有 `src/router`、`src/views`、`src/pages`、`src/assets`、数据库目录或后端 HTTP 路由目录；官网路由位于 `website/src/router.ts`。

```txt
website/
├── src/                 # 官网 Vue 源码
│   ├── pages/           # 官网路由页面
│   ├── components/      # 官网导航、下载矩阵、页脚等组件
│   ├── lib/             # 官网状态、文案、动效逻辑
│   ├── router.ts        # 官网路由
│   └── AppRoot.vue      # 官网根布局
├── public/images/       # 官网静态图片资源
├── package.json         # 官网独立脚本与依赖
├── pnpm-lock.yaml       # 官网独立锁文件
├── index.html           # 官网 HTML 入口
├── vite.config.ts       # 官网 Vite 配置
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
5. `src/style.css` 或 `uno.config.ts` 中的公共样式变量

### 修改前端接口调用 / Tauri command

优先阅读：
1. `src/api/tauri.ts` 或 `src/api/speedtest.ts`
2. 调用该 API 的组件、store 或 composable
3. `src-tauri/src/commands.rs`
4. `src-tauri/src/lib.rs` 的 `generate_handler!`
5. 相关 Rust 模块，如 `registries.rs`、`npmrc.rs`、`speedtest.rs`、`proxy.rs`

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
2. `src/style.css`
3. `uno.config.ts`
4. 同类组件现有 class、Element Plus 覆盖和 CSS 变量

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
2. 不要一开始全项目扫描，优先用 `rg` 搜索组件名、函数名、command 名、本地存储 key 或报错信息。
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

## 前端专项规则

### 组件规则

- 组件放在 `src/components`，业务复杂组件可使用子目录，如 `RegistryList`。
- 保持 Vue 3 `<script setup lang="ts">` 和 Composition API 写法。
- props/emits 使用 TypeScript 类型声明。
- 公共卡片优先复用 `AppSurfaceCard.vue`。
- 父子通信优先沿用 props、emits、Pinia、provide/inject 或现有 composable，不另起全局事件系统。

### TypeScript 规则

- 共享前端类型放在 `src/types` 或靠近 API/组件处。
- `tsconfig.json` 开启 `strict`、`noUnusedLocals`、`noUnusedParameters`，避免留下未使用变量和宽泛类型。
- 使用 `@/` alias 引用 `src` 内模块。
- 不强行引入复杂类型设计；跨 Tauri 边界的字段变更要同步检查 Rust struct 和前端 interface。

### 样式规则

- 全局样式和主题变量在 `src/style.css`。
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
- 具体业务逻辑放在同级模块：`registries.rs`、`npmrc.rs`、`speedtest.rs`、`proxy.rs`、`app_settings.rs` 等。
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

## 构建、部署与运行规则

- 本地完整开发使用 `pnpm dev`，不要在 Tauri `beforeDevCommand` 中递归调用 `pnpm dev`。
- 前端独立开发使用 `pnpm ui:dev`。
- 前端构建输出为 `dist`，Tauri `frontendDist` 指向 `../dist`。
- 桌面应用构建使用 `pnpm build`；Windows 构建使用 `pnpm build:win`。
- 版本号以 `package.json` 为来源，通过 `scripts/sync-app-version.mjs` 同步到 `src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml`。
- 未发现 Docker、服务端部署脚本或独立后端端口配置。

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

## 维护规则

当项目出现以下变化时，应同步更新 `AGENTS.md`：技术栈、目录结构、构建命令、包管理器、API 封装方式、Tauri command 组织方式、路由或状态管理方式、代码规范、UI 组件库、环境变量规则、Docker/部署方式、数据库/ORM、鉴权权限、前后端接口约定。
