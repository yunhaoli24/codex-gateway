# AGENTS.md

## 项目结构

- `app/`：Nuxt 前端与客户端状态。页面入口在 `app/app.vue`，业务组件按领域放在 `app/components/{chat,common,settings,sidebar,thread}`。
- `packages/gateway-ui/`、`packages/gateway-ai-elements/`：预编译的 shadcn-vue 和 AI Elements 组件；`packages/gateway-browser-runtime/`：重型浏览器依赖。业务组件优先复用这些包的公开导出。
- `app/stores/`：按领域拆分的 Pinia store；状态和动作放在对应领域，跨领域事件沿用现有 `gateway/domain-events.ts` 等机制，不重新集中到单个 gateway store。
- `server/api/`、`server/routes/`：Nuxt/Nitro HTTP、WebSocket 和代理入口，浏览器通过 Gateway 访问远端服务。
- `server/utils/gateway/`：后端 gateway 核心，包括 SSH、Codex app-server RPC、thread broker、运行时索引。
- `shared/types.ts`：前后端共享 DTO 和类型。
- `i18n/locales/`：UI 文案。默认中文，新增可见文案必须同步维护中英文。
- `tests/e2e/`：Playwright E2E。测试必须走真实 Nuxt server、真实 SSH 环境、真实 Codex app-server。
- `third_party/openai-codex/`：官方 Codex 源码 submodule，只用于参考。除非任务明确要求，不要修改其中内容。
- Codex 协议基准是 `server/utils/gateway/infra/codex/codex-version.ts` 中的 `SUPPORTED_CODEX_VERSION`，submodule 对齐该发布 tag。明确升级 Codex 时再核对 npm latest 并同步适配，普通任务不顺手升级。

## 运行命令

- 安装依赖：`pnpm install`
- 本地开发：`pnpm dev`
- 类型、规则与格式检查：`pnpm lint`
- 子包类型检查：`pnpm typecheck:dependencies`；根 `lint` 不检查子包源码，`postinstall` 会构建并检查子包。
- 构建：`pnpm build`
- E2E：`pnpm test:e2e`

## 测试命令

- 常规代码改动至少运行 `pnpm lint`；纯文档改动检查内容和 `git diff --check` 即可。
- 改变 SSH、RPC、thread 数据流、实时同步、上传、配置导入导出、路由恢复或语言切换行为时，必须运行 `pnpm test:e2e`。纯文案或样式改动按影响范围验证，不仅凭文件所在目录决定全量回归。
- `pnpm test:e2e` 在 Docker 中构建生产产物，应用、浏览器和构建使用独立容器，并连接真实 SSH/Codex 测试环境。统一使用该脚本，不在宿主机直接运行 Playwright，不用 mock app-server 替代真实集成链路。
- 如果 E2E 失败，先看 Playwright trace、Gateway 测试容器和 SSH 测试容器日志，再判断是测试环境还是代码问题。
- 构建、完整 E2E、镜像导出等长任务应使用一次足够长的前台等待或 `sleep` 后再检查结果，不要用短间隔频繁轮询刷日志。

## Git 协作

- 任何代码更改必须先从 `main`/`master` checkout 新分支，例如 `feat/*`、`fix/*`；如果当前已经位于非 `main`/`master` 分支，则无需再次创建分支。
- 禁止直接在 `main` 或 `master` 分支提交与推送代码更改。多人协作统一通过“分支 + PR + Review”完成合并，避免直接推送造成冲突。
- 当用户要求提交、合并并部署时，必须按以下顺序执行，不得从功能分支直接部署：
  1. 在当前功能分支完成上述适用检查和 `git diff --check`。
  2. 提交全部任务相关改动并推送当前分支到 `origin`。
  3. 使用 `gh pr create` 创建 PR，确认检查结果和变更范围后使用 `gh pr merge` 合并；禁止绕过 PR 直接推送 `main`。
  4. 切换回 `main`，使用 `git pull --ff-only origin main` 获取远端合并结果，并确认工作区干净且提交与远端一致。
  5. 仅从最新 `main` 执行 `docker compose up -d --build codex-gateway`；确认容器健康、连接 `web-common`、公网首页返回 200，并检查启动日志。需要认证的 API 应带凭据验证，不将未登录的 401 当作启动失败。

## 代码风格

- 全项目使用 Nuxt 4 + TypeScript；前后端都写 TS，不引入 Go/Python/Rust 等新服务实现。
- 浏览器不直接连接远端 Codex app-server；登录使用 Gateway token，SSH/Codex 凭据由服务端管理。凭据录入可提交到 Gateway，但不在浏览器持久化远端凭据。
- Gateway 业务实时交互统一走每个浏览器页面一条 WebSocket，复用 host/thread/terminal 等 topic。配置、版本等 HTTP 请求和文件/Git 等既有 WS 查询沿用各自 transport；预览页面自身的代理连接不属于这条业务总线。
- 同一 host 在 gateway 后端只维护一个共享 SSH 连接；多个浏览器页面必须复用同一个 gateway-side SSH/RPC 生命周期管理。
- Codex app-server/thread 是事实源。前端和 gateway 只做配置、索引、缓存和广播，不发明不可失效的二次 timeline。
- 远端 Codex 低于 `SUPPORTED_CODEX_VERSION` 时，gateway 负责升级并重启 app-server；升级/重启状态必须推送到前端。
- Host、Project、置顶等用户配置以服务端 SQLite 为事实源，敏感连接配置加密保存。订阅、运行状态和历史快照是内存运行态；浏览器可保存登录、路由、布局和文件 tab 等偏好，不用 localStorage 作为连接配置的事实源。
- UI 默认中文，交互布局参考 Codex Desktop。不要做营销页或假数据页面。
- 前端业务界面必须全局响应式布局；业务组件和业务样式禁止使用 `px` 级固定宽高、固定列宽、固定弹窗尺寸或固定字体，优先使用 Tailwind scale、`rem`、`clamp()`、`min()/max()`、`minmax()` 和容器约束。`packages/gateway-ui/`、`packages/gateway-ai-elements/` 的上游基础组件除非任务明确要求，不作为业务布局清理范围。
- 业务组件按领域拆分；通用能力沉到 `app/components/common/` 或对应领域目录。避免单文件持续膨胀。
- Markdown、diff、图片查看、上传、模型/审批/推理设置等功能必须使用真实 app-server 语义和真实数据。
- 使用成熟库处理协议、SSH、WebSocket、Markdown、拖拽/弹层等复杂行为；不要手写脆弱协议解析。
- 当用户要求“全项目”“系统性”“重构”级别修改时，必须先用搜索列出完整影响范围，再逐个文件按语义手动修改；禁止用机械替换、局部修补或只处理截图可见位置来冒充完成。
- 保持 ASCII 代码为主；只有 UI 文案、中文注释或现有文件语境需要时才加入非 ASCII。

## 禁止事项

- 禁止添加 fake/mock thread、fake host、fake progress 来绕过真实 app-server。
- 禁止为旧的本机 `local` host 或旧字段写兼容迁移，除非用户明确要求；配置 schema 应该严格暴露错误。
- 不为旧版服务端或未发布 main 协议增加兼容分支；当前支持版本仍可返回 legacy 历史格式，其必要读取路径不属于旧服务端兼容，不能因此删除。
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
- Gateway 请求错误经脱敏后统一通过 Sonner 通知，不重复插入 Agent loop；详细诊断留在服务端日志，官方对话中的错误事件仍按其语义展示。
- 新增 UI 在桌面和移动端均不重叠、不溢出，滚动区域和弹窗可用。
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
