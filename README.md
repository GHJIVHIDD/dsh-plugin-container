# dsh-plugin-container

> DeepSeek Harness（DSH）的 **Docker 容器沙箱** 部署级插件。  
> 在会话视图环中新增「容器」页签，提供 **仅观察 / 干预** 双模式原生 UI、**39 个 `docker_*` 模型工具**、**15 个 `/dock-api/*` HTTP 路由**，并**完整对齐官方 `dsh-plugin-vm-sandbox` v0.1.0 的全部能力**：快照/回滚、文件传输、端口转发、后台任务、审计、共享协作、配额与回收、网络策略、自定义资源、初始化脚本、多容器并行执行、增强状态查询。

---

## 为什么需要这个插件？

官方 `dsh-plugin-vm-sandbox` 依赖 **OrbStack**（macOS 专属）。Linux 用户与 Windows 用户没有 OrbStack，就无法获得会话级沙箱能力。

本插件以 **本地 Docker Engine** 作为底层，把 VM 沙箱的能力一一映射到 Docker：

| 能力 | dsh-plugin-vm-sandbox | dsh-plugin-container v1.0.0 |
|---|---|---|
| 清单 / 创建 / 删除 | `vm_list` / `vm_create` / `vm_delete` | `docker_ps` / `docker_create` / `docker_run` / `docker_rm` |
| 生命周期 | `vm_start` / `vm_stop` / `vm_restart` | `docker_start` / `docker_stop` / `docker_restart` |
| 增强状态 | `vm_status` | `docker_status` |
| 快照 / 回滚 | `vm_snapshot` / `vm_snapshot_list` / `vm_restore` / `vm_snapshot_delete` | `docker_snapshot` / `docker_snapshot_list` / `docker_restore` / `docker_snapshot_delete` |
| 文件传输 | `vm_upload` / `vm_download` | `docker_upload` / `docker_download` |
| 端口转发 | `vm_port_forward` / `vm_port_forward_list` / `vm_port_forward_stop` | `docker_port_forward` / `docker_port_forward_list` / `docker_port_forward_stop` |
| 后台任务 | `vm_job_submit` / `vm_job_list` / `vm_job_status` / `vm_job_stop` / `vm_job_output` | `docker_job_submit` / `docker_job_list` / `docker_job_status` / `docker_job_stop` / `docker_job_output` |
| 操作审计 | `vm_audit` | `docker_audit` |
| 共享协作 | `vm_share` / `vm_unshare` / `vm_policy` | `docker_share` / `docker_unshare` / `docker_policy` |
| 网络策略 | `vm_network` | `docker_network_policy` |
| 命令执行 | `vm_exec`（支持 `machines` 并行） | `docker_exec`（支持 `containers` 并行） |
| 自定义资源 | `cpus` / `memory` / `disk` | `cpus` / `memory` / `memory_swap` / `shm_size` / `pids_limit` / `disk_quota` |
| 初始化脚本 | `init_script` / `cloud_init` | `init_script` / `command` |

> Docker 与 OrbStack 是两种不同抽象：OrbStack 的 `orb clone` 按需复制磁盘、`orb push/pull` 直接进入 VM；Docker 版本使用 `docker commit` 镜像快照与 `docker cp` 文件传输，语义等价、实现完全 Docker-native。网络策略则通过 `dsh-sandbox` 公网 bridge 与 `dsh-sandbox-internal` 内部网络（`docker network create --internal`）实现。

---

## 项目定位

- **部署级插件**：与官方 VM 沙箱一致，不依赖私有 RPC。面板数据全部通过宿主 `webServer` 暴露的 `/dock-api/*` 标准 HTTP 路由获取。
- **官方目录结构**：严格参照 `dsh-plugin-vm-sandbox` 仓库布局（根包 `prepare` → `dsh-plugin-container/lib` 发布入口；内层 `dsh-plugin-container/` 为 npm 发布包；`cordis.patch.yml` 自动插入 `ui-container`）。
- **零运行时依赖**：Host 半区只使用 Node 内置模块与官方 `docker` CLI；Client 半区仅依赖 `react` 浏览器模块。
- **跨平台**：只要 Docker CLI 能连上 Docker Engine 即可使用 —— Linux、Windows（Docker Desktop）、macOS（Docker Desktop / OrbStack Docker context）全部支持。

## 功能特性

### 原生级 UI（会话视图环「容器」页签）

- 毛玻璃渐变背景、状态呼吸灯、玻璃拟态统计卡、丝滑展开/切换动画。
- 顶部模式切换：**仅观察**（默认，隐藏全部写操作）/ **干预**（显示创建、启动、停止、重启、快照、删除）。
- 容器 / 快照两个视图；容器支持搜索与「全部 / 本会话 / 运行中」过滤。
- 每个容器行内展示状态、镜像、CPU / 内存占用；展开后提供 **概览 / 日志 / Shell / 任务 / 端口** 五个页签。
- 概览：完整 inspect 配置、挂载、实时 CPU/内存/根分区、uptime、资源限额。
- 日志：`docker logs` 最近 500 行，支持跟随刷新。
- Shell：`docker_exec` 执行记录（命令 / 耗时 / 退出码 / stdout+stderr）与 **只读实时 stdout/stderr 观察流**（暂停 / 清空 / 重连，90 秒无读取自动回收）。
- 任务：该容器的后台任务列表；端口：该容器的端口转发隧道列表。
- 创建弹窗：镜像、名称、CPU / 内存 / shm / 磁盘配额、启动命令或初始化脚本、端口 / 环境变量 / 卷、网络、重启策略、内部网络 / 完全无网络 / TTY。
- 快照弹窗：备注说明后一键 `docker commit` 快照；快照列表支持一键恢复 / 删除。
- 全部使用 DSH 官方 `--dsw-alias-*` 设计令牌，自动适配浅色 / 深色主题与品牌变量。
- 静态设计稿：见仓库 [`docs/ui-preview.html`](./docs/ui-preview.html)。

### 快照与回滚

- `docker_snapshot`：基于官方 `docker commit --change LABEL ...` 生成带 `dsh.snapshot=1` 标签的快照镜像，自动保存来源容器的 run spec（端口 / 卷 / 环境 / 网络 / 资源限额 / 命令）。
- `docker_snapshot_list`：列出全部快照及本会话快照。
- `docker_restore`：删除当前容器 → 用快照镜像 + 原 run spec 重建 → 按原状态启动 / 保持创建态；快照记录保留，可重复回滚。
- `docker_snapshot_delete`：`docker rmi -f` 永久删除快照镜像。
- 限额：全局 64 个、每会话 16 个。

### 文件传输

- `docker_upload` / `docker_download`：基于官方 `docker cp`，支持文件与目录递归。
- `local_path` 强制约束在 DSH 工作区内（`sandboxPolicy.workspaceRoot`），防止任意宿主机路径读取。

### 端口转发

- `docker_port_forward`：在容器所在 bridge 网络上启动 `alpine/socat` 代理容器，`-p 127.0.0.1:host_port:proxy_port` 映射到本地回环；**无需修改原容器、无需重建**。
- 自动分配空闲本地端口或指定 `host_port`；`bind_host` 仅允许 `localhost` / `127.0.0.1` / `::1`。
- `docker_port_forward_list` / `docker_port_forward_stop`（按 `tunnel_id` 或 `host_port` 停止）。
- 隧道状态持久化，容器删除 / 恢复 / 插件对账时自动回收代理容器。

### 后台任务

- `docker_job_submit`：命令经 base64 写入容器 `/tmp/.dsh-jobs/<job-id>/`，以 `nohup sh run.sh &` 在容器内后台执行，不受单次 `docker_exec` 超时限制。
- `docker_job_list` / `docker_job_status` / `docker_job_stop` / `docker_job_output`。
- 每会话最多 32 个运行中任务；容器删除 / 恢复时自动终止并标记错误。

### 审计

- 所有 39 个工具调用（含 `docker_cli` 直通）统一经过审计包装器：记录 sessionId、容器、操作名、参数摘要、耗时、成功 / 失败与错误。
- 面板操作（创建 / 启停 / 删除 / 快照 / 恢复）同样写入审计。
- `docker_audit` 支持按 session / container / operation 过滤。

### 共享协作与资源治理

- `docker_share` / `docker_unshare`：把当前会话容器共享给其他会话；`mode=exec`（执行 / 传输 / 任务 / 端口转发）或 `mode=manage`（额外允许生命周期 / 网络 / 快照）。
- `docker_policy`：每会话最大容器数（1–8，默认 8）、闲置自动停止分钟数（默认 30）、闲置自动删除天数（默认 0 关闭）。
- 全局运行上限 64，超过后仅自动停止**本插件创建**的、超过 15 分钟未使用的旧容器，绝不干扰用户手工容器。
- 归档 / 删除会话自动清理其容器；`domain/changed`、`session/disposed` 事件驱动 + 每 5 分钟对账。

### 网络策略

- `docker_network_policy`：`public_access` / `internal_access` / `isolated` / `isolate_network`。
  - `public_access=false`：保存当前网络，断开除 `dsh-sandbox-internal` 外的网络，接入 `--internal` 内部网络（无法访问公网）。
  - `internal_access=false`：断开沙箱内部网络。
  - `isolated=true`：断开全部网络，等价 `--network none`。
  - `isolate_network=true`：仅保留内部网络并强制 `public_access=false`。
- 策略持久化，容器每次启动时自动重新应用。

### 基础 Docker 能力（保留并增强）

原有 18 个工具全部保留：`docker_info`、`docker_ps`、`docker_images`、`docker_pull`、`docker_run`、`docker_start`、`docker_stop`、`docker_restart`、`docker_rm`、`docker_rmi`、`docker_logs`、`docker_exec`、`docker_inspect`、`docker_stats`、`docker_network`、`docker_volume`、`docker_build`、`docker_cli`。

---

## 架构

```text
浏览器 (client, lib/client.js)                       Node (host, lib/index.js)
┌────────────────────────────────────────┐  fetch   ┌───────────────────────────────────────────┐
│ window.__ModuleLoader__.load({...})    │ ───────▶ │ webServer.register({kind:'exact',...})     │
│ slots.inject('conversation.view')      │          │ /dock-api/status|inspect|logs|top|op|      │
│ 原生 UI: 模式/统计/创建/详情/日志/Shell │ ◀─────── │   create|shell|snapshot|restore|...        │
│ 快照/任务/端口视图                       │  JSON    ├───────────────────────────────────────────┤
└────────────────────────────────────────┘          │ tools.register × 39 (docker_*)             │
                                                     │ execFile/spawn('docker', ...)              │
                                                     │ 状态 ~/.dsh/container-sandbox/state.json  │
                                                     └───────────────────────────────────────────┘
```

- **Host 侧**：零外部运行时依赖；负责执行 Docker CLI、维护日志观察 / socat 代理子进程、注册 HTTP 路由与模型工具、治理配额 / 闲置回收 / 归档清理。
- **Client 侧**：CJS closure-factory bundle，仅依赖 `react`；注入 `conversation.view`（id `docker`，order `10.5`，label「容器」）。
- **可卸载性**：路由 disposer、工具注册、watcher 进程、socat 代理、定时器与样式均通过 `ctx.effect` 管理，插件卸载时自动清理。

## 安全模型

- **默认只读 UI**：未切换到「干预」模式前不显示任何写操作入口。
- **删除二次确认**：容器删除需二次点击确认；快照删除使用原生 `confirm` 二次确认。
- **Shell 观察无交互通道**：只读 `docker logs -f` 流，不带 stdin，模型无法通过该面板注入命令。
- **工作区路径约束**：`docker_upload` / `docker_download` / `docker_build` 的宿主机路径必须位于工作区内。
- **共享权限边界**：插件登记的容器按 owner / exec / manage 三级校验；跨会话未共享的操作会被拒绝。
- **不引入私有 RPC**：面板全部走标准 HTTP 路由，权限边界与 DSH 部署插件保持一致。
- **输出截断与超时保护**：长输出截断、Docker 调用默认 120 秒超时（pull/build 等长任务 10–15 分钟上限）。

## 安装

### 方式 A：dsh CLI 从 GitHub 安装（推荐）

需要已安装 [pnpm](https://pnpm.io/) 与 dsh CLI：

```bash
npx -p @deepseek-ai/dsh dsh plugin --profile web add https://github.com/GHJIVHIDD/dsh-plugin-container
# 或 git 简写
npx -p @deepseek-ai/dsh dsh plugin --profile web add GHJIVHIDD/dsh-plugin-container
```

安装过程由官方机制自动完成：

1. pnpm 从仓库安装包并写入 profile 的 `dependencies`。
2. 根据 `dsh.bundle` 声明自动 reconcile 进 `dsh.profile.bundles` 层。
3. 应用 `cordis.patch.yml`，自动插入 `ui-container` 行，无需手工编辑配置。

重启 dsh（web 或 headless）后刷新浏览器即可看到「容器」页签。

### 方式 B：Releases tgz 安装

从 [Releases](https://github.com/GHJIVHIDD/dsh-plugin-container/releases) 下载 `dsh-plugin-container-1.0.3.tgz`，在包所在目录执行：

```bash
dsh plugin --profile web add ./dsh-plugin-container-1.0.3.tgz
```

### 方式 C：手动安装

```bash
# 1. 将包复制到 profile 的插件目录
cp -R dsh-plugin-container ~/.dsh/profiles/web/node_modules/@dsh-community/

# 2. 在用户补丁层注册插件行
cat >> ~/.dsh/profiles/web/cordis.patch.yml << 'EOF'

- insert:
    - id: ui-container
      name: '@dsh-community/dsh-plugin-container'
EOF

# 3. 重启 profile
```

### 卸载

```bash
dsh plugin --profile web remove @dsh-community/dsh-plugin-container
# 手动安装的：移除补丁中的 ui-container 行并删除包目录
```

## 使用

```bash
dsh --profile web
```

进入任意会话点击「容器」页签；智能体可直接调用 `docker_create`、`docker_exec`、`docker_snapshot`、`docker_upload`、`docker_job_submit`、`docker_network_policy` 等 39 个工具管理 Docker 沙箱。

## 兼容性

- 面向 DeepSeek Harness `web` profile。
- 需要 Web 端启用 `@deepseek-ai/dsh-client-runtime` 与 `@deepseek-ai/dsh-client-ui-conversation`。
- 宿主机需要 `docker` CLI 位于 `PATH` 且能连接 Docker Engine。
  - Linux：Docker Engine / rootless Docker / Docker Desktop。
  - Windows：Docker Desktop（建议启用 WSL2 backend）。
  - macOS：Docker Desktop 或 OrbStack 的 Docker context。
- 端口转发依赖 `alpine/socat`（官方镜像，首次使用自动 pull）。
- 插件版本：1.0.3。

## 验证

仓库内置两级测试，**必须全部通过**：

```bash
# 1. 结构 + 语法 + 39 工具/15 路由 + schema + live docker_info + client 沙箱模拟
npm run verify

# 2. 真实 Docker 集成冒烟:创建/并行 exec/生命周期/上传下载/后台任务/
#    端口转发实测回显/快照回滚/共享/策略/网络策略/审计/清理核验
npm run smoke

# 3. 生成 releases 包并校验 tarball 内容
npm run pack
```

### verify 覆盖

- 双半区语法检查。
- Host ESM 导出 `apply` + `inject`。
- Mock Cordis 上下文下 39 个工具与 15 个路由注册、effects disposer 清理。
- 与 `dsh-plugin-vm-sandbox` 对应的 19 组工具 schema 参数逐项比对。
- 真实 `docker_info` 调用（Docker daemon 不可用时硬失败）。
- Client bundle 在 Node `vm` 浏览器沙箱中执行，断言 `id`、`apply/inject`、`slots.inject('conversation.view')` 与样式挂载/卸载。

### smoke 覆盖（真实 Docker）

1. `docker_info` 实时探测。
2. `docker_create` 带 `cpus/memory/shm_size` 创建容器，`docker_status` 校验 owner / running / runtime。
3. `docker_exec` 双容器并行执行。
4. `docker_stop` / `docker_start` / `docker_restart`。
5. `docker_upload` / `docker_download` 内容一致性。
6. 后台任务提交、轮询完成、列表、完整日志。
7. `alpine/socat` echo 容器 + `docker_port_forward`，宿主机 `nc` 实测回显，转发停止。
8. `docker_snapshot` → 修改容器 → `docker_restore` → 校验快照标记恢复 → `docker_snapshot_delete`。
9. `docker_share` 后跨会话 exec、`docker_unshare`。
10. `docker_policy` 设置。
11. `docker_network_policy` 公网关闭 / 内部网络应用 / 恢复。
12. `docker_audit` 过滤校验。
13. finally 中自动清理全部 `dsh-smoke-*` 容器、`dsh-pf-*` 代理、`dsh-snap-*` 快照镜像，并验证无残留。

## 目录结构

```text
dsh-plugin-container/
├── package.json                 # 仓库根即插件源包(含 dsh.bundle / dsh.client)
├── scripts/
│   ├── prepare.mjs              # 根包 prepare:构建 dsh-plugin-container/lib
│   ├── verify.mjs               # 严格静态/结构/live 验证
│   ├── smoke.mjs                # 真实 Docker 集成冒烟
│   └── package.mjs              # 生成并校验 releases tgz
├── dsh-plugin-container/
│   ├── package.json             # 内层发布包
│   ├── cordis.patch.yml         # 自动插入「容器」页签的 patch 层
│   ├── src/
│   │   ├── index.js             # Host 侧实现(39 工具 + 15 路由)
│   │   ├── client.js            # 浏览器端原生 UI
│   │   └── types/index.d.ts     # Host 类型声明
│   ├── lib/                     # prepare 生成的发布入口(已提交)
│   └── scripts/prepare.mjs
├── docs/
│   └── ui-preview.html          # UI 静态设计稿(可独立浏览器打开预览)
├── LICENSE
└── README.md
```

## v1.0.0 更新内容（详细）

### 新增能力（对齐 dsh-plugin-vm-sandbox）

- `docker_snapshot` / `docker_snapshot_list` / `docker_restore` / `docker_snapshot_delete`
  - `docker commit --change LABEL` 带标签快照镜像；自动保存/恢复 run spec；限额治理。
- `docker_upload` / `docker_download`
  - `docker cp` 双向文件传输，工作区路径约束。
- `docker_port_forward` / `docker_port_forward_list` / `docker_port_forward_stop`
  - `alpine/socat` 代理容器端口转发，支持本地端口自动分配与回收。
- `docker_job_submit` / `docker_job_list` / `docker_job_status` / `docker_job_stop` / `docker_job_output`
  - 容器内 `/tmp/.dsh-jobs` 后台任务执行器，含状态探测与日志输出。
- `docker_audit`
  - 39 个工具 + 面板操作统一审计包装器，支持过滤查询。
- `docker_share` / `docker_unshare` / `docker_policy`
  - 会话间 exec/manage 共享、每会话配额、闲置停止/删除回收。
- `docker_network_policy`
  - 公网 / 内部网络 / 完全隔离 / 仅内部网络四类策略，持久化重放。
- `docker_status`
  - 增强状态：IP、网络、挂载、资源限额与实时用量、uptime、最近 Shell、任务、隧道。
- `docker_create`
  - VM 风格创建工具：自动命名、资源规格、初始化脚本、隔离网络。
- `docker_exec` 增强
  - `containers` 数组并行执行、`timeout_ms`、Shell 执行记录。
- `docker_run` 增强
  - `cpus/memory/memory_swap/shm_size/pids_limit/disk_quota`、`isolated/isolate_network`、会话归属登记。

### UI 重构

- 从旧版简单列表升级为**原生级完整控制台**：
  - 渐变光晕背景 + 玻璃拟态统计卡 + 状态呼吸灯。
  - 仅观察 / 干预双模式分段控件。
  - 容器 / 快照双视图、搜索、过滤。
  - 五页签详情（概览 / 日志 / Shell / 任务 / 端口）。
  - 创建容器弹窗、快照备注弹窗、操作 toast、确认式删除。
  - 使用 DSH 官方设计令牌，自动主题适配。

### 工程化重构

- 仓库布局严格对齐官方 `dsh-plugin-vm-sandbox`（根包 + 内层发布包 + prepare）。
- `scripts/verify.mjs` 全面重写：39 工具 / 15 路由 / 19 组 schema 比对 / live daemon 探测 / 浏览器沙箱执行。
- 新增 `scripts/smoke.mjs`：真实 Docker 18 项集成冒烟与清理核验。
- 新增 `scripts/package.mjs`：npm pack 生成 releases tgz 并校验 tarball 内容。
- 状态持久化升级至 `~/.dsh/container-sandbox/state.json`（containers / snapshots / shares / policies / network / jobs / tunnels / audit）。

### 兼容性与破坏性变更

- 旧的 7 个 `/dock-api/*` 路由与 18 个 `docker_*` 工具全部保留，现有用法不受影响。
- 插件登记容器新增 owner / share 权限校验；跨会话未共享时，原可操作行为会被拒绝（更安全，与 VM 沙箱一致）。
- `docker_run` / `docker_create` 默认网络由 `bridge` 改为 `dsh-sandbox`（自动创建），便于统一网络策略治理；可通过 `network` 参数覆盖。

## v1.0.3 修复内容（详细）

- 修复面板创建容器时 `pids_limit` 留空被透传为 `--pids-limit ""` 导致 Docker 报 `invalid argument ""` 的问题；空值现在与未传值一致，不再生成参数。
- `scripts/verify.mjs` 新增静态回归断言：`buildRunArgs` 的 pids-limit 分支必须带非空字符串保护。
- 修复后 `/dock-api/create` 全参数路径实测通过。

## v1.0.2 修复内容（详细）

- 修复 `/dock-api/create` 路由错误分支的 `sessionId` 作用域错误：缺少 `session` 或创建失败时，catch 分支原先会因未定义变量再次抛错，导致 `webServer` 返回 400 空响应而不是 JSON 500。
- `scripts/verify.mjs` 新增路由错误路径回归：直接调用 `/dock-api/create` 缺失 session 的 handler，断言返回 JSON 500 且 handler 不 reject。
- 完整 HTTP 路由实测（15/15）在 v1.0.2 通过。

## v1.0.1 修复内容（详细）

- 修复 `docker_job_stop` 主动停止的后台任务，在随后 `docker_job_list` / `docker_job_status` 探针中被错误覆盖为 `running` 的终态污染问题。
- `readJobStatus` 现在对 `done` / `error` / `stopped` 三种终态严格保护：终态不会被 `docker exec` 探针的 `running` / `dead` 覆盖，`endTime` 与退出码同样保持稳定。
- `scripts/smoke.mjs` 新增回归断言：提交长任务 → `docker_job_stop` → `docker_job_list` 必须保持 `stopped` 且 `endTime` 非空。


### License

This project is licensed under the Apache License 2.0.
See the full license at https://www.apache.org/licenses/LICENSE-2.0.
