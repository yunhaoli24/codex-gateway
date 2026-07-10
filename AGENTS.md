# AGENTS.md

## 项目结构

- `app/`：Nuxt 前端与客户端状态。页面入口在 `app/app.vue`，业务组件按领域放在 `app/components/{chat,common,settings,sidebar,thread}`。
- `app/components/ui/`：shadcn-vue 组件目录。已有 shadcn 组件必须优先复用，不要在业务组件里手写可替代的原生控件。
- `app/stores/gateway/`：Pinia gateway store。复杂状态和动作拆到 `actions/`、`domain-events.ts`、`domain-subscribers.ts`，不要继续把逻辑堆回单个 store 文件。
- `server/api/`：Nuxt/Nitro server routes，是浏览器访问 gateway 的唯一入口。
- `server/utils/gateway/`：后端 gateway 核心，包括 SSH、Codex app-server RPC、thread broker、运行时索引。
- `shared/types.ts`：前后端共享 DTO 和类型。
- `i18n/locales/`：UI 文案。默认中文，新增可见文案必须同步维护中英文。
- `tests/e2e/`：Playwright E2E。测试必须走真实 Nuxt server、真实 SSH 环境、真实 Codex app-server。
- `third_party/openai-codex/`：官方 Codex 源码 submodule，只用于参考。除非任务明确要求，不要修改其中内容。
- Codex 协议基准是 npm `@openai/codex` 的 latest 发布版；参考源码时必须把 submodule 切到对应发布 tag，不按未发布 main 分支或旧版本实现。

## 运行命令

- 安装依赖：`pnpm install`
- 本地开发：`pnpm dev`
- 类型检查：`pnpm lint`
- 构建：`pnpm build`
- E2E：`pnpm test:e2e`

## 测试命令

- 常规改动至少运行 `pnpm lint`。
- 涉及 SSH、RPC、thread、实时同步、上传、配置导入导出、路由恢复、i18n 的改动，必须运行 `pnpm test:e2e`,不要使用`pnpm exec playwright ..`启动宿主机测试。
- `pnpm test:e2e` 会启动 Nuxt dev server，并通过 Docker 启动真实 SSH 测试环境；不要把 E2E 改成 mock app-server 或 fake 数据。
- 如果 E2E 失败，先看 Playwright trace、webServer 日志和 Docker SSH 环境日志，再判断是测试环境还是代码问题。
- 构建、完整 E2E、镜像导出等长任务应使用一次足够长的前台等待或 `sleep` 后再检查结果，不要用短间隔频繁轮询刷日志。

## Git 协作

- 任何代码更改必须先从 `main`/`master` checkout 新分支，例如 `feat/*`、`fix/*`；如果当前已经位于非 `main`/`master` 分支，则无需再次创建分支。
- 禁止直接在 `main` 或 `master` 分支提交与推送代码更改。多人协作统一通过“分支 + PR + Review”完成合并，避免直接推送造成冲突。

## 代码风格

- 全项目使用 Nuxt 4 + TypeScript；前后端都写 TS，不引入 Go/Python/Rust 等新服务实现。
- 浏览器永远不直接连接远端 Codex app-server，也不持有 SSH key、Codex token 以外的非必要派生状态；浏览器只访问 Nuxt server API 和页面级 WebSocket 实时总线。
- 实时交互统一走每个浏览器页面一条 WebSocket；同一页面内多个 host/thread/terminal topic 必须复用同一个 WS 消息总线，非实时配置、版本、列表等请求继续走 HTTP。
- 同一 host 在 gateway 后端只维护一个共享 SSH 连接；多个浏览器页面必须复用同一个 gateway-side SSH/RPC 生命周期管理。
- Codex app-server/thread 是事实源。前端和 gateway 只做配置、索引、缓存和广播，不发明不可失效的二次 timeline。
- 远端 Codex 低于 npm latest 时，gateway 负责升级并重启 app-server；升级/重启状态必须推送到前端。
- 连接配置以服务端 SQLite 为事实源，按用户加密保存 host/project/thread runtime config；浏览器只保存 Bearer token 和轻量路由选择，不再使用 localStorage 保存连接配置。
- UI 默认中文，交互布局参考 Codex Desktop。不要做营销页或假数据页面。
- 前端业务界面必须全局响应式布局；业务组件和业务样式禁止使用 `px` 级固定宽高、固定列宽、固定弹窗尺寸或固定字体，优先使用 Tailwind scale、`rem`、`clamp()`、`min()/max()`、`minmax()` 和容器约束。`app/components/ui/` 的 shadcn-vue 基础组件除非任务明确要求，不作为业务布局清理范围。
- 业务组件按领域拆分；通用能力沉到 `app/components/common/` 或对应领域目录。避免单文件持续膨胀。
- Markdown、diff、图片查看、上传、模型/审批/推理设置等功能必须使用真实 app-server 语义和真实数据。
- 使用成熟库处理协议、SSH、WebSocket、Markdown、拖拽/弹层等复杂行为；不要手写脆弱协议解析。
- 当用户要求“全项目”“系统性”“重构”级别修改时，必须先用搜索列出完整影响范围，再逐个文件按语义手动修改；禁止用机械替换、局部修补或只处理截图可见位置来冒充完成。
- 保持 ASCII 代码为主；只有 UI 文案、中文注释或现有文件语境需要时才加入非 ASCII。

## 禁止事项

- 禁止添加 fake/mock thread、fake host、fake progress 来绕过真实 app-server。
- 禁止为旧的本机 `local` host 或旧字段写兼容迁移，除非用户明确要求；配置 schema 应该严格暴露错误。
- 禁止为旧 Codex 协议或未发布 main 分支协议写兼容分支；本项目只支持当前 npm latest。
- 禁止让每个浏览器 tab 建立独立 SSH 连接。
- 禁止把 SSH 密码、私钥、Codex token 打到日志、toast、测试输出或提交记录中。
- 禁止无关重构、格式化第三方 submodule、改动用户未要求的文件。
- 禁止用 `git reset --hard`、`git checkout --` 等破坏性命令回滚用户改动。
- 禁止把所有 UI 控件堆进一个文件，或绕过 shadcn-vue 写一套平行组件体系。
- 禁止在业务前端新增 `px` 级固定布局；确需像素级边界时必须先确认属于 shadcn 基础组件或第三方组件内部细节。
- 禁止在项目级重构请求里只改当前报错文件、当前截图或当前可见组件；必须按请求边界完成全局排查和语义修复。

## 完成标准

- 功能使用真实远端 SSH/Codex app-server 跑通，不依赖假数据。
- 多浏览器打开同一 thread 时，事件流、运行状态、发送消息、完成状态保持一致。
- 页面刷新后能通过 URL/localStorage 恢复合理状态，不能出现空白、假加载或需要重复手动滚动才能看到最新消息的问题。
- 错误要从后端透传到前端可见位置，尤其是 SSH 登录、代理、app-server RPC、schema 校验错误。
- 新增 UI 在桌面宽度下不重叠、不溢出，滚动区域和弹窗可用。
- 涉及全项目 UI 布局清理时，必须确认业务前端代码没有新增 `px` 级布局，并说明 shadcn/第三方内部代码是否被排除。
- 涉及全项目或系统性重构时，必须能说明排查范围、实际修改范围和未覆盖范围；不能用机械替换结果替代人工判断。
- 相关类型检查和 E2E 通过；未运行的测试必须在最终说明里明确写出原因。
- 变更保持可维护：状态流转清楚，模块边界明确，没有把临时逻辑塞进大文件。

## Review 标准

- 先看正确性：是否破坏 gateway 统一管理 SSH/RPC、thread broker、WS fan-out、配置同步或 URL 恢复。
- 再看真实性：是否引入 fake 数据、mock app-server、无效 fallback 或浏览器直连远端。
- 再看安全性：是否泄露 SSH/Codex 凭据，是否把敏感配置写到日志或测试产物。
- 再看生命周期：SSH keepalive、断线重连、RPC close、WS unsubscribe/resubscribe、controller 缓存是否会泄漏或卡死。
- 再看 UI：是否符合 Codex Desktop 风格、默认中文、shadcn-vue 使用一致、滚动/弹窗/图片/Markdown/diff 可用。
- 对全项目/系统性修改，额外检查是否真的覆盖了完整影响面，是否存在只修局部、机械替换、留下固定 `px` 业务布局或破坏响应式约束的问题。
- 最后看测试：关键路径是否有 E2E 覆盖，失败路径是否能在前端看见明确错误。
