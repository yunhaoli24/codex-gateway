# Codex Gateway

[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](nuxt.config.ts)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](package.json)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](package.json)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)](tests/e2e)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) | 中文

Codex Gateway 是一个面向官方 Codex app-server 的 Web 前端与连接网关。

它不是另一个 Codex 实现，也不会在浏览器里运行 agent runtime。浏览器只连接 Codex Gateway。Gateway 通过 SSH 连接远端机器，管理官方 `codex app-server` 的生命周期，并把官方 app-server 的线程、事件、审批、文件变更、图片、diff、终端输出和子代理过程渲染到网页里。

目标很直接：在浏览器里访问多台服务器上的 Codex 会话，同时让 Codex app-server 继续作为唯一事实源。Codex 桌面端、其他客户端和这个 Web 前端只要连接到同一个 app-server thread，就应该看到一致的状态流。

<p align="center">
  <img src="docs/images/codex-gateway-workspace.png" alt="Codex Gateway 展示远端主机、项目、Codex agent loop 和工作区标签页" width="100%">
</p>

<p align="center"><sub>在一个浏览器工作区中访问多台远端 SSH 主机上的 Codex 会话。</sub></p>

## 为什么需要

- 可以在任意浏览器使用 Codex，同时不把 SSH 凭据暴露给浏览器。
- 可以在一个工作台里管理多台 SSH host、多个项目目录和多个 Codex thread。
- 对齐官方 Codex app-server 语义，而不是发明一套平行协议。
- 同一台 host 在 Gateway 后端只维护一份共享 SSH/RPC 生命周期，多个浏览器 tab 复用。
- 浏览器刷新、app-server 重启或 SSH 短暂断开后，后端会恢复并校准 thread 状态。
- 需要人工检查或修复远端环境时，可以在 agent loop 旁边直接打开 SSH 终端。
- 无需发布远端端口，即可在隔离的浏览器面板中预览远端 Web 应用。

## 架构

```text
Browser
  └─ HTTP + WebSocket
     └─ Codex Gateway (Nuxt server)
        ├─ SQLite encrypted config
        ├─ SSH connection pool
        ├─ one shared RPC client per host
        ├─ direct SSH PTY terminal sessions
        ├─ HTTP/WebSocket preview proxy over SSH
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
- **可停靠 IDE 工作区**：Agent、Files、Terminal、Browser 和 Sub-agent 面板支持分屏、缩放、浮动和弹出窗口，并按对话在本地保存布局。
- **远程文件工作区**：浏览当前项目文件树，直接预览 Markdown、代码、图片、PDF 和 Office 文件，无需先下载。
- **远程终端 tab**：基于 `@xterm/xterm` 打开独立 SSH PTY 终端，和 agent loop 并排显示；终端 session 按用户和 host 隔离。
- **远程浏览器 tab**：通过 SSH 在 Dockview 中预览 Host 上的 `localhost` HTTP/HTTPS 应用，同时代理 WebSocket，不需要额外暴露 Gateway 端口。
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

## 快速开始

前置条件：安装 Docker Compose 和 Git，并确保 Gateway 所在机器可以访问需要管理的 SSH 主机。

```bash
git clone --recurse-submodules https://github.com/yunhaoli24/codex-gateway.git
cd codex-gateway

cp .env.example .env
# 使用 openssl rand -hex 32 替换 .env 中的 CODEX_GATEWAY_CONFIG_SECRET

docker network create web-common 2>/dev/null || true
docker compose build
docker compose run --rm codex-gateway \
  node scripts/create-user.mjs admin '<至少-8-位-密码>'
docker compose up -d
```

通过反向代理打开服务，使用手动创建的账号登录，然后在设置中添加第一台 SSH 主机。项目自带的 Compose 文件只把 `3000` 端口暴露到外部 `web-common` Docker 网络，不会直接发布宿主机端口。

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
| `BROWSER_PREVIEW_DOMAIN` | 使用浏览器预览时 | 隔离预览 origin 使用的父域名；需要为 `p-*.your-domain` 配置 wildcard DNS。 |
| `BROWSER_PREVIEW_SECRET` | 否 | 为 user/Host/target 生成稳定预览 origin 的 HMAC secret。默认复用 `CODEX_GATEWAY_CONFIG_SECRET`。 |
| `BROWSER_PREVIEW_SCHEME` | 否 | 公开预览协议，默认 `https`。仅本地 E2E/开发使用 `http`。 |
| `BROWSER_PREVIEW_PUBLIC_PORT` | 否 | 本地开发时写入预览 origin 的可选公开端口。 |

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
- 远程终端 tab 和浏览器预览代理都使用服务端 SSH channel，不会把 SSH key 或远端端口暴露给浏览器。
- 公网部署应该放在可信反向代理和 HTTPS 后面。

## Docker 部署

```bash
export CODEX_GATEWAY_CONFIG_SECRET="replace-with-a-long-random-secret"
docker compose up -d --build
```

默认容器只把 `3000` 暴露到 Docker 网络，适合放在 nginx、Caddy、Cloudflare Tunnel 或其他可信反向代理后面。SQLite 数据保存在 `/data/codex-gateway.db`，并通过 `./data:/data` 持久化。

远程浏览器面板使用 `p-<hmac>.example.com` 形式的隔离 origin。需要为 `p-*.example.com` 配置 wildcard DNS，并把这些 host 转发到 Codex Gateway 同一个 Nitro 端口 `3000`。反向代理必须保留 Host header 和 WebSocket Upgrade；不需要增加第二个监听端口或发布新的容器端口。Gateway 会保留上游的 `Content-Security-Policy` 与 `X-Frame-Options`，因此明确禁止 iframe 嵌入的应用仍会被浏览器阻止。

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

## 参与贡献

欢迎提交 issue 和 pull request。修改 SSH、RPC、实时状态或 app-server 协议行为前，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按照 [SECURITY.md](SECURITY.md) 私下报告。

## License

[MIT](LICENSE)
