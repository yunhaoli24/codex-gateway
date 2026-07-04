# Codex Gateway

[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](nuxt.config.ts)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](package.json)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](package.json)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)](tests/e2e)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

[English](README.md) | 中文

Codex Gateway 是一个面向官方 Codex app-server 的 Web 前端与连接网关。

它不是另一个 Codex 实现，也不会在浏览器里运行 agent runtime。浏览器只连接 Codex Gateway。Gateway 通过 SSH 连接远端机器，管理官方 `codex app-server` 的生命周期，并把官方 app-server 的线程、事件、审批、文件变更、图片、diff、终端输出和子代理过程渲染到网页里。

目标很直接：在浏览器里访问多台服务器上的 Codex 会话，同时让 Codex app-server 继续作为唯一事实源。Codex 桌面端、其他客户端和这个 Web 前端只要连接到同一个 app-server thread，就应该看到一致的状态流。

## 为什么需要

- 可以在任意浏览器使用 Codex，同时不把 SSH 凭据暴露给浏览器。
- 可以在一个工作台里管理多台 SSH host、多个项目目录和多个 Codex thread。
- 对齐官方 Codex app-server 语义，而不是发明一套平行协议。
- 同一台 host 在 Gateway 后端只维护一份共享 SSH/RPC 生命周期，多个浏览器 tab 复用。
- 浏览器刷新、app-server 重启或 SSH 短暂断开后，后端会恢复并校准 thread 状态。
- 需要人工检查或修复远端环境时，可以在 agent loop 旁边直接打开 SSH 终端。

## 架构

```text
Browser
  └─ HTTP + WebSocket
     └─ Codex Gateway (Nuxt server)
        ├─ SQLite encrypted config
        ├─ SSH connection pool
        ├─ one shared RPC client per host
        ├─ direct SSH PTY terminal sessions
        ├─ thread/event cache
        └─ remote official codex app-server
```

核心规则：

- 浏览器永远不直接连接远端 app-server 或 SSH host。
- Gateway 负责 SSH、远端 Codex 升级、app-server 启动、RPC 和事件广播。
- turn start、steer、interrupt、终端输入、终端 resize 和 app-server 动态请求响应都走页面 WebSocket。
- Gateway 缓存近期 thread 状态，预热置顶 thread，并定时从 app-server 刷新疑似 stale 的 running thread。
- 前端只渲染 Gateway 下发的 domain state，不维护第二套持久 timeline。

## 功能

- **服务端账号与配置**：手动创建用户，Bearer token 登录，host/project/thread 配置加密存储在 SQLite。
- **远端主机**：支持 SSH password、private key、ssh-agent，以及可选 SSH proxy。
- **Codex runtime 管理**：检测远端 Codex 版本，升级旧版本，重启 stale app-server，并自动重连。
- **会话发现与恢复**：从远端状态发现 Codex 会话，打开 thread 时优先加载较小的缓存 turn 窗口。
- **实时 turn**：通过 WebSocket 发起新 turn、steer 运行中的 turn、中断 active turn，并响应 app-server 动态请求。
- **Plan 和 Goal 模式**：斜杠命令支持 Codex plan mode 和 goal progress，并在输入框上方展示 token/耗时状态。
- **Agent loop UI**：展示思考、命令执行、终端等待、文件编辑、流式 diff、图片、上下文压缩、sleep、MCP/tool 调用、通知和子代理侧边栏。
- **远程终端 tab**：基于 `@xterm/xterm` 打开独立 SSH PTY 终端，和 agent loop 并排显示；终端 session 按用户和 host 隔离。
- **多客户端同步**：多个浏览器 tab 打开同一个 thread 时，通过 Gateway 接收同一条 app-server 事件流。
- **状态修复**：SSH/app-server 重连后，Gateway 会刷新 running thread 状态；Nitro 定时任务也会扫描 stale running thread。
- **Bark 通知**：主 turn 完成后由服务端发送 Bark 推送，并按 user/turn 去重。
- **移动端布局**：响应式侧边栏、输入框、长按菜单和子代理面板。
- **真实 E2E 覆盖**：Playwright 测试使用真实 Nuxt server、真实 SSH Docker target 和真实 Codex app-server。

## 项目结构

```text
.
├── app/                       # Nuxt 前端、Pinia store、chat/thread/settings UI
├── app/components/ui/         # shadcn-vue 基础组件
├── server/api/                # 浏览器访问 Gateway 的 HTTP/WebSocket API
├── server/tasks/              # Nitro 定时任务入口
├── server/utils/gateway/      # SSH、Codex RPC、runtime broker、存储、通知
├── shared/                    # 前后端共享 DTO、配置、协议辅助和 thread history
├── i18n/locales/              # 中文/英文 UI 文案
├── tests/e2e/                 # 真实 SSH + app-server Playwright E2E
├── third_party/openai-codex/  # 官方 Codex 源码 submodule，只用于协议参考
├── Dockerfile
└── docker-compose.yml
```

## 本地开发

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm lint
pnpm build
pnpm test:e2e
```

环境变量：

| 变量 | 是否必需 | 说明 |
| --- | --- | --- |
| `CODEX_GATEWAY_CONFIG_SECRET` | 生产环境必需 | 用于加密保存 host/project/thread 配置的稳定 secret。 |
| `CODEX_GATEWAY_DB_PATH` | 否 | SQLite 数据库路径。Docker 默认使用 `/data/codex-gateway.db`。 |
| `HOST` | 否 | Nuxt 监听地址。Docker 使用 `0.0.0.0`。 |
| `PORT` | 否 | Nuxt 监听端口。Docker 使用 `3000`。 |

创建管理员用户：

```bash
CODEX_GATEWAY_CONFIG_SECRET="replace-with-a-long-random-secret" \
CODEX_GATEWAY_DB_PATH="./data/codex-gateway.db" \
pnpm user:create <username> <password>
```

`CODEX_GATEWAY_CONFIG_SECRET` 用于加密保存连接配置。生产环境必须设置稳定且足够长的 secret；更换 secret 会导致已有加密配置无法解密。

## 安全模型

- SSH 凭据和 Codex token 只保存在服务端。
- 浏览器通过 Bearer token 登录 Gateway。
- 连接配置使用 `CODEX_GATEWAY_CONFIG_SECRET` 加密后存入 SQLite。
- 远程终端 tab 是服务端 SSH PTY channel，不会把 SSH key 暴露给浏览器。
- 公网部署应该放在可信反向代理和 HTTPS 后面。

## Docker 部署

```bash
export CODEX_GATEWAY_CONFIG_SECRET="replace-with-a-long-random-secret"
docker compose up -d --build
```

默认容器只把 `3000` 暴露到 Docker 网络，适合放在 nginx、Caddy、Cloudflare Tunnel 或其他可信反向代理后面。SQLite 数据保存在 `/data/codex-gateway.db`，并通过 `./data:/data` 持久化。

## 测试

本项目的 E2E 不 mock Codex app-server：

- 测试 runner 启动 production Nuxt build。
- Docker 提供真实 SSH target。
- Gateway 通过 SSH 连接 target，并启动或恢复真实 Codex app-server。
- Playwright 以浏览器行为验证登录、配置、thread 恢复、实时同步、移动端布局、diff 渲染、动态请求、通知和子代理 UI。

运行：

```bash
pnpm test:e2e
```

如果宿主机没有 `pnpm`，可以直接使用容器化测试 runner：

```bash
tests/e2e/run-in-containers.sh
```

涉及 SSH、RPC、WebSocket、thread 状态、配置、上传、diff 渲染、移动端或 app-server 协议处理的改动，都应该跑完整 E2E。

## 与 Codex 的关系

Codex Gateway 面向官方 Codex app-server 协议。`third_party/openai-codex/` 是官方源码 submodule，只用于参考协议和行为。Gateway 应该对齐官方 app-server，而不是在前端伪造事件或为旧协议维护兼容分支。

## License

MIT
