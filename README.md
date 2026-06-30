# Codex Gateway

[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](nuxt.config.ts)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](package.json)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](package.json)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)](tests/e2e)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

Codex Gateway 是一个面向官方 Codex app-server 的 Web 前端与连接网关。

它不是另一个 Codex 实现，也不在浏览器里重写 agent runtime。浏览器只连接 Codex Gateway，Gateway 通过 SSH 管理远端机器上的官方 `codex app-server`，并把官方 app-server 的线程、事件、审批、文件变更和实时输出呈现在网页里。

目标很直接：在浏览器里访问多台服务器上的 Codex 会话，同时让 Codex app-server 继续作为唯一事实源。桌面端、其他客户端和这个 Web 前端只要连接到同一个 app-server/thread，就应该看到一致的状态流。

## 项目定位

- Codex Web 前端：提供类似桌面端的会话、输入框、agent loop、diff、图片、审批和实时输出 UI。
- App-server first：线程历史、turn 生命周期、工具事件和中间过程都来自官方 Codex app-server。
- Gateway 而不是代理脚本：浏览器不直连远端服务器，不持有 SSH 密码、私钥或远端 app-server socket。
- 多主机工作台：一个 Web 页面可以管理多台 SSH host、多项目目录和多个 Codex thread。
- 实时同步：每个浏览器页面使用一条 WebSocket 连接 Gateway，Gateway 负责 app-server event fan-out。
- 可部署服务：Nuxt server、SQLite 配置存储、Docker 镜像和 nginx 反代场景都按长期运行服务设计。

## 架构原则

```text
Browser
  └─ HTTP + WebSocket
     └─ Codex Gateway (Nuxt server)
        ├─ SQLite encrypted config
        ├─ SSH connection pool
        ├─ one shared RPC client per host
        └─ remote official codex app-server
```

- 浏览器只访问 Gateway API 和 Gateway WebSocket。
- Gateway 通过 SSH 在远端检测、升级和连接官方 Codex app-server。
- 同一台 host 在 Gateway 后端共享一个 SSH/RPC 生命周期。
- App-server 事件原样进入前端协议处理层，再转换为 UI domain event。
- 前端状态只做展示、缓存、路由恢复和输入草稿，不发明第二套不可失效的 timeline。

## 已包含能力

- 认证与配置：管理员手动创建用户，Bearer token 登录，host/project 配置加密存储在服务端 SQLite。
- 远端主机：支持 SSH password、private key、ssh-agent，以及可选 SSH proxy。
- Codex runtime：检测远端 Codex 版本，低版本自动升级并重启 app-server。
- 会话管理：发现远端 Codex 历史会话，按 host/project/thread 打开和恢复。
- 实时 turn：发送新 turn、运行中 steer、状态探针、断线后状态恢复。
- Agent loop UI：思考过程、命令执行、文件编辑、diff、图片查看、上下文压缩、sleep 等 app-server 语义展示。
- 多客户端同步：多个浏览器页面打开同一 thread 时，通过 Gateway WebSocket 接收同一 app-server 事件流。
- 通知：回合结束后发送浏览器通知，标题包含会话名，同一页面内同一 turn 只通知一次。
- 移动端：使用 Nuxt device/layout 适配移动端侧边栏、长按菜单和输入区。
- 测试：Playwright E2E 使用真实 Nuxt server、真实 SSH Docker target、真实 Codex app-server。

## 目录结构

```text
.
├── app/                    # Nuxt 前端、Pinia store、chat/thread/settings UI
├── app/components/ui/      # shadcn-vue 基础组件
├── server/api/             # 浏览器访问 Gateway 的 HTTP/WebSocket API
├── server/utils/gateway/   # SSH、Codex RPC、runtime broker、配置存储
├── shared/                 # 前后端共享 DTO、配置和类型
├── i18n/locales/           # 中文/英文 UI 文案
├── tests/e2e/              # 真实 SSH + app-server Playwright E2E
├── third_party/openai-codex/ # 官方 Codex 源码 submodule，只用于协议参考
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

创建本地管理员用户：

```bash
CODEX_GATEWAY_CONFIG_SECRET="replace-with-a-long-random-secret" \
CODEX_GATEWAY_DB_PATH="./data/codex-gateway.db" \
pnpm user:create <username> <password>
```

`CODEX_GATEWAY_CONFIG_SECRET` 用于加密保存连接配置。生产环境必须设置稳定且足够长的 secret；更换 secret 会导致已有加密配置无法解密。

## Docker 部署

```bash
export CODEX_GATEWAY_CONFIG_SECRET="replace-with-a-long-random-secret"
docker compose up -d --build
```

默认容器只暴露内部 `3000` 端口，适合放在 nginx、Caddy 或 Cloudflare Tunnel 后面。`docker-compose.yml` 使用 `/data/codex-gateway.db` 保存 SQLite 数据，并通过 `./data:/data` 持久化。

## 测试与质量

本项目的 E2E 不 mock Codex app-server：

- 测试容器启动真实 Nuxt server。
- Docker SSH target 提供真实 SSH 登录环境。
- Gateway 通过 SSH 启动/连接远端 Codex app-server。
- Playwright 以浏览器行为验证登录、配置、会话、实时同步、移动端和 UI 交互。

运行：

```bash
pnpm test:e2e
```

涉及 SSH、RPC、WebSocket、thread 状态、配置、上传、diff 或移动端的改动，都应该跑完整 E2E。

## 与 Codex 的关系

Codex Gateway 只面向官方 Codex app-server 协议演进。`third_party/openai-codex/` 是官方源码 submodule，用来参考 app-server 协议和行为；业务代码不会修改这个 submodule，也不会为旧协议或未发布协议维护平行兼容分支。

如果 app-server 协议变化，正确做法是对齐官方协议，而不是在前端伪造事件或维护第二套状态机。

## License

MIT
