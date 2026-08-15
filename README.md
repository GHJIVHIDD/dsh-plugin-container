# dsh-plugin-container

> DeepSeek Harness（DSH）的本地 Docker 容器管理部署级插件。  
> 在 Web 会话视图环中新增「容器」页签，提供 **仅观察 / 干预** 双模式 UI、**18 个模型可用工具**、**只读实时 Shell 观察** 与 `/dock-api/*` HTTP 路由，让智能体和用户无需离开对话即可完成容器生命周期管理、状态监控与故障排查。

---

## 项目定位

- **部署级插件**：与 VM 沙箱等官方部署插件一致，不依赖私有 RPC；面板数据通过宿主 `webServer` 暴露的 `/dock-api/*` 路由获取。
- **双模式安全设计**：默认「仅观察」隐藏所有操作入口，适合只读审计；需要变更容器状态时再显式切换「干预」模式。
- **模型可编程能力**：为 DeepSeek Harness 智能体注册 `docker_*` 系列工具，覆盖 Docker 高频操作与 CLI 直通能力，可在对话中直接驱动容器资源。

## 功能特性

### UI 页签

- 与对话/轨迹并列的「容器」页签，视觉风格与 DSH 内置界面一致。
- 页面自动每 5 秒刷新守护进程状态、容器数量、镜像数量、磁盘占用及 CPU/内存概览。
- 行内展开查看容器详情，进程快照每 8 秒自动刷新。

### 双模式操作

| 模式 | 说明 |
|---|---|
| 仅观察（observe） | 默认模式。隐藏启动、停止、删除等操作按钮，仅可查看详情、日志与 Shell 输出，适合只读审计与安全演示。 |
| 干预（intervene） | 显式开启后显示常用操作按钮，支持启动 / 停止 / 删除；删除操作带二次确认，降低误操作风险。 |

### 容器管理

- 查看容器状态、镜像、ID、端口映射、网络、挂载、环境变量、TTY、PID 等元数据。
- 查看最近 500 行日志，支持跟随与手动刷新。
- 查看容器内进程快照（`docker top`）。
- 只读 Shell 实时观察：基于 `docker logs -f` 的流式输出，**无 stdin、无法干预命令运行**；支持暂停、清空、重连，90 秒无读取自动回收。

### 模型工具

为智能体提供以下 18 个工具：

`docker_info` · `docker_ps` · `docker_images` · `docker_pull` · `docker_run` · `docker_start` · `docker_stop` · `docker_restart` · `docker_rm` · `docker_rmi` · `docker_logs` · `docker_exec` · `docker_inspect` · `docker_stats` · `docker_network` · `docker_volume` · `docker_build` · `docker_cli`

其中 `docker_cli` 可直通任意 Docker 子命令，作为高级逃生舱；其余工具覆盖镜像、容器、网络、卷、构建与资源统计等日常运维场景。

## 架构

```text
浏览器 (client, lib/client.js)                     Node (host, lib/index.js)
┌─────────────────────────────────────┐   fetch    ┌────────────────────────────────────┐
│ window.__ModuleLoader__.load({...}) │ ── /dock-api/status|inspect|logs|top|op|watch ─▶ │ webServer.register({kind:'exact'}) │
│ slots.inject('conversation.view')   │ ◀────────── └────────────────────────────────────┘
│ 双模式 UI / Shell 只读观察            │   JSON        │ tools.register × 18 (docker_*)        │
└─────────────────────────────────────┘              │ execFile/spawn('docker', ...)       │
                                                     └────────────────────────────────────┘
```

- **Host 侧**：零外部运行时依赖，仅使用 Node 内置 `node:child_process` / `node:util`；负责执行 Docker CLI、维护日志观察子进程、注册 HTTP 路由与模型工具。
- **Client 侧**：仅依赖 `react`（浏览器平台模块），以 CJS closure-factory bundle 形式注入会话视图。
- **可卸载性**：路由 disposer、工具注册、watcher 子进程、样式与定时器均通过 effect 管理，插件卸载时自动清理。

## 安全模型

- 默认只读：未切换到干预模式前，界面不展示任何写操作入口。
- 写操作显式授权：干预模式需用户主动切换；删除容器必须二次确认。
- Shell 观察无交互通道：只读流不带 stdin，智能体无法通过该面板注入命令。
- 不引入私有 RPC：全部面板接口走标准 HTTP 路由，权限边界与 DSH 部署插件保持一致。
- 输出截断与超时保护：长输出截断、Docker 调用默认 120 秒超时，避免资源被异常任务耗尽。

## 安装

### 方式 A：通过 dsh CLI 从 GitHub 安装（推荐）

需要已安装 [pnpm](https://pnpm.io/) 与 dsh CLI：

```bash
# 从 GitHub 仓库安装（public 仓库，无需认证）
npx -p @deepseek-ai/dsh dsh plugin --profile web add https://github.com/GHJIVHIDD/dsh-plugin-container

# 或使用 git 简写
npx -p @deepseek-ai/dsh dsh plugin --profile web add GHJIVHIDD/dsh-plugin-container
```

安装过程由官方机制自动完成：

1. pnpm 从仓库安装包并写入 profile 的 `dependencies`。
2. 根据 `dsh.bundle` 声明自动 reconcile 进 `dsh.profile.bundles` 层。
3. 应用 `cordis.patch.yml` 补丁，自动向组合树插入 `ui-container` 行，无需手工编辑配置文件。

重启 dsh（web 或 headless）后生效，刷新浏览器即可看到「容器」页签。

### 方式 B：手动安装

```bash
# 1. 将包复制到 profile 的插件目录
cp -R dsh-plugin-container ~/.dsh/profiles/web/node_modules/@dsh-community/

# 2. 在用户补丁层注册插件行
cat >> ~/.dsh/profiles/web/cordis.patch.yml << 'EOF'

- insert:
    - id: ui-container
      name: '@dsh-community/dsh-plugin-container'
EOF

# 3. 重启 profile（或等待 HMR 事务性重读用户补丁）
```

### 卸载

```bash
# 通过官方 CLI 安装的
dsh plugin --profile web remove @dsh-community/dsh-plugin-container

# 手动安装的：移除补丁中的 ui-container 行并删除包目录
rm -rf ~/.dsh/profiles/web/node_modules/@dsh-community/dsh-plugin-container
```

## 验证

仓库内置离线验证脚本：

```bash
node scripts/verify.mjs
```

覆盖内容：

- 双半区语法检查
- Host ESM 导出检查
- Mock 上下文下 18 个工具与 7 个路由注册
- 真实 `docker_info` 调用（尽力而为）
- Client bundle 沙箱模拟执行

## 目录结构

```text
dsh-plugin-container/
├── package.json          # dsh.bundle + dsh.client 声明、exports["./client"]
├── cordis.patch.yml      # 向组合树插入 ui-container 的补丁
├── lib/
│   ├── index.js          # Host 半区（ESM：apply/inject）
│   ├── client.js         # Client 半区（CJS closure-factory bundle）
│   └── types/index.d.ts  # Host 类型声明
├── scripts/verify.mjs    # 离线验证
└── README.md / LICENSE
```

## License

[MIT](./LICENSE)
