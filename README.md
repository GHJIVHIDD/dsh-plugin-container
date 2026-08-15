# dsh-plugin-container

> [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) (DSH) 的容器管理部署级插件：在对话/轨迹旁提供「容器」页签，支持仅观察/干预双模式 UI、18 个容器管理工具、只读实时 Shell 观察，以及 /dock-api/* HTTP 路由。
>
> 本地容器管理部署级插件：对话/轨迹旁「容器」页签，「仅观察 / 干预」双模式 UI，18 个智能体工具覆盖容器管理全功能，以及只读的容器 Shell 实时观察（仅观察，无法干预命令运行）。

---

## ✨ Features / 功能特性

- **UI 页签**:与对话/轨迹并列的「容器」页签,风格与 DSH 内置界面一致(简洁、美观)
- **双模式**:
  - **仅观察 (observe)** — 默认模式,隐藏全部操作按钮,只能查看详情 / 日志 / Shell,安全只读
  - **干预 (intervene)** — 显示每容器的 启动 / 停止 / 删除 按钮(删除带二次确认)
- **实时监控**:容器守护进程状态、CPU / 内存占用(动态渐变进度条)、容器数、镜像与磁盘占用,5 秒自动刷新
- **容器详情**:行内展开 — 状态/镜像/ID/端口/网络/挂载/环境变量/TTY/PID + 进程快照(8s 自动刷新)
- **日志**:最近 500 行,支持跟随与手动刷新
- **Shell 观察**:`docker logs -f` 只读实时流(无 stdin,无法干预命令),支持暂停 / 清空 / 重连
- **18 个模型工具**:`docker_info / ps / images / pull / run / start / stop / restart / rm / rmi / logs / exec / inspect / stats / network / volume / build / cli`(直通任意 docker 子命令)

## 🚀 Install / 安装

### 方式 A:官方 CLI(推荐,已实测验证 ✅)

需要 [pnpm](https://pnpm.io/installation) 与 dsh CLI:

```sh
# 从 GitHub 安装(public 仓库,无需认证)
npx -p @deepseek-ai/dsh dsh plugin --profile web add https://github.com/GHJIVHIDD/dsh-plugin-container

# 或使用 git 简写
npx -p @deepseek-ai/dsh dsh plugin --profile web add GHJIVHIDD/dsh-plugin-container
```

安装做了什么(官方机制,实测):
1. pnpm 从仓库安装包,写入 profile 的 `dependencies`
2. 识别 `dsh.bundle` 声明,自动 reconcile 进 `dsh.profile.bundles` 层
3. 包的 `cordis.patch.yml` 作为补丁层,自动把 `ui-container` 插件行插入组合树 —— **无需手动编辑任何文件**

**重启 dsh(web 或 headless)后生效**,刷新浏览器页面即可看到「容器」页签。

### 方式 B:手动安装(备选,与部署内既有插件一致)

```sh
# 1. 把包复制到 profile 的插件目录
cp -R dsh-plugin-container ~/.dsh/profiles/web/node_modules/@dsh-community/

# 2. 在 profile 的用户补丁层注册插件行
cat >> ~/.dsh/profiles/web/cordis.patch.yml << 'EOF'

- insert:
    - id: ui-container
      name: '@dsh-community/dsh-plugin-container'
EOF

# 3. 重启 profile(或等待 HMR 事务性重读用户补丁;client 名册经增量扫描自动收录)
```

### 卸载

```sh
# 官方 CLI 安装的:
dsh plugin --profile web remove @dsh-community/dsh-plugin-container

# 手动安装的:移除 cordis.patch.yml 中的 ui-container 行,删除包目录,重启 profile
rm -rf ~/.dsh/profiles/web/node_modules/@dsh-community/dsh-plugin-container
```

## 🧩 Architecture / 架构

```
浏览器 (client, lib/client.js)                     Node (host, lib/index.js)
┌─────────────────────────────────────┐   fetch    ┌────────────────────────────────────┐
│ window.__ModuleLoader__.load({...}) │ ── /dock-api/status|inspect|logs|top|op|watch ─▶ │ webServer.register({kind:'exact'}) │
│ slots.inject('conversation.view')   │ ◀────────── └────────────────────────────────────┘
│ 双模式 UI / Shell 只读观察            │   JSON        │ tools.register × 18 (docker_*)        │
└─────────────────────────────────────┘              │ execFile/spawn('docker', ...)       │
                                                     └────────────────────────────────────┘
```

- **部署级插件没有 `harness.handle` / `host.call` 私有 RPC** — 面板数据全部走 `webServer` HTTP 路由(`/dock-api/*`),与 VM 沙箱等官方部署插件同一模式
- host 侧零外部依赖(仅 Node 内置 `node:child_process` / `node:util`);client 侧仅 `require("react")`(浏览器平台模块)
- 所有副作用(effect)可卸载:路由 disposer、工具注册、watcher 子进程、样式、定时器
- Shell 观察:host 为每个容器 spawn 一个 `docker logs -f` 只读进程,client 轮询 offset 增量;90 秒无读取自动回收

## ✅ Verify / 离线验证

```sh
node scripts/verify.mjs
```

覆盖:双半区语法检查 → host ESM 导出 → mock ctx 下 18 工具 + 7 路由注册 → 真实 `docker_info` 调用(尽力而为)→ client bundle 沙箱模拟执行。

## 📦 Package structure / 包结构

```
dsh-plugin-container/
├── package.json          # dsh.bundle + dsh.client 声明、exports["./client"] 名册扫描硬要求
├── cordis.patch.yml      # bundle 补丁:向组合树插入 ui-container 行
├── lib/
│   ├── index.js          # host 半区(ESM: apply/inject)
│   ├── client.js         # client 半区(CJS closure-factory bundle)
│   └── types/index.d.ts  # host 类型声明
├── scripts/verify.mjs    # 离线验证
└── README.md / LICENSE
```

## 📄 License

[MIT](./LICENSE)
