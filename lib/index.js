/**
 * Host loader entry for the deployment-level Docker plugin.
 *
 * Migrated from the dynamic plugin (dock-1/pkg-8) to a persistent deployment
 * plugin: 18 model tools (docker_info/ps/images/pull/run/start/stop/restart/
 * rm/rmi/logs/exec/inspect/stats/network/volume/build/cli) plus /dock-api/*
 * HTTP routes served by this host half for the client panel (deployment
 * plugins have no harness.handle/host.call private RPC, so the panel talks
 * to /dock-api/* routes instead).
 */

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

// ---------- 基础工具 ----------
function fmtError(e) {
  return String((e && e.message) || e)
}

function capText(text, max) {
  text = String(text || '')
  if (text.length <= max) return text
  return text.slice(0, max) + '\n...[output too long, truncated]'
}

function pick(obj, keys) {
  const out = {}
  if (obj && typeof obj === 'object') {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]
    }
  }
  return out
}

function parseSize(s) {
  if (typeof s !== 'string') return 0
  let num = ''
  let i = 0
  while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) {
    num += s[i]
    i++
  }
  if (!num) return 0
  const n = parseFloat(num)
  if (!isFinite(n)) return 0
  const rest = s.slice(i).trim().toLowerCase()
  const mult = rest.indexOf('k') === 0 ? 1024
    : rest.indexOf('m') === 0 ? 1024 * 1024
    : rest.indexOf('g') === 0 ? 1024 * 1024 * 1024
    : rest.indexOf('t') === 0 ? 1024 * 1024 * 1024 * 1024
    : 1
  return Math.round(n * mult)
}

function parseLines(text) {
  const out = []
  for (const line of String(text).split(String.fromCharCode(10))) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t))
    } catch (e) { /* skip */ }
  }
  return out
}

function psName(o) {
  const n = o.Names
  if (Array.isArray(n)) return (n[0] || '').trim() || o.ID || ''
  if (typeof n === 'string') {
    const first = n.split(',').map((s) => s.trim()).filter((s) => s.length > 0)[0]
    return first || o.ID || ''
  }
  return o.ID || ''
}

function statNum(v) {
  const f = parseFloat(String(v == null ? '' : v))
  return isFinite(f) ? f : 0
}

// ---------- docker 执行 ----------
async function dockerRun(argv, opts) {
  opts = opts || {}
  try {
    const out = await execFileP('docker', argv, {
      timeout: opts.timeoutMs || 120000,
      maxBuffer: 8 * 1024 * 1024,
    })
    return { exitCode: 0, stdout: String(out.stdout || ''), stderr: String(out.stderr || '') }
  } catch (err) {
    return {
      exitCode: (err && typeof err.code === 'number') ? err.code : -1,
      stdout: String((err && err.stdout) || ''),
      stderr: String((err && err.stderr) || fmtError(err)),
    }
  }
}

// ---------- 缓存 ----------
let dfCache = { at: 0, bytes: 0 }
let imgCache = { at: 0, count: 0 }
let hostCache = { at: 0, totalMem: 0, totalCpu: 0 }

async function diskBytes() {
  const now = Date.now()
  if (now - dfCache.at < 30000) return dfCache.bytes
  const r = await dockerRun(['system', 'df', '--format', 'json'])
  let bytes = 0
  if (r.exitCode === 0) {
    for (const line of r.stdout.split(String.fromCharCode(10))) {
      const t = line.trim()
      if (!t) continue
      try {
        bytes += parseSize(JSON.parse(t).Size)
      } catch (e) { /* ignore */ }
    }
  }
  dfCache = { at: now, bytes }
  return bytes
}

async function imageCount() {
  const now = Date.now()
  if (now - imgCache.at < 30000) return imgCache.count
  const r = await dockerRun(['images', '-q'])
  const count = r.exitCode === 0 ? r.stdout.trim().split(String.fromCharCode(10)).filter((x) => x.length > 0).length : 0
  imgCache = { at: now, count }
  return count
}

async function hostInfo() {
  const now = Date.now()
  if (now - hostCache.at < 60000) return hostCache
  const r = await dockerRun(['info', '--format', 'json'])
  let totalMem = 0
  let totalCpu = 0
  if (r.exitCode === 0) {
    try {
      const i = JSON.parse(r.stdout)
      totalMem = i.MemTotal || 0
      totalCpu = i.NCPU || 0
    } catch (e) { /* ignore */ }
  }
  hostCache = { at: now, totalMem, totalCpu }
  return hostCache
}

// ---------- Shell 观察流(只读) ----------
const watchers = new Map()

async function ensureWatcher(name) {
  const existing = watchers.get(name)
  if (existing) {
    existing.lastRead = Date.now()
    return existing
  }
  const insp = await dockerRun(['inspect', name])
  let running = false
  try {
    const arr = JSON.parse(insp.stdout)
    running = !!(arr && arr[0] && arr[0].State && arr[0].State.Running)
  } catch (e) { /* ignore */ }
  if (!running) return { error: '容器未运行, 无法观察' }
  const proc = spawn('docker', ['logs', '-f', '--tail', '200', '--timestamps', name], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const entry = {
    proc,
    mode: 'logs',
    stdoutOffset: 0,
    stderrOffset: 0,
    outBuf: '',
    errBuf: '',
    lastRead: Date.now(),
    ended: false,
    endError: null,
  }
  proc.stdout.on('data', (d) => {
    entry.outBuf = (entry.outBuf + d.toString('utf8')).slice(-1024 * 1024)
  })
  proc.stderr.on('data', (d) => {
    entry.errBuf = (entry.errBuf + d.toString('utf8')).slice(-256 * 1024)
  })
  proc.on('close', (code) => {
    entry.ended = true
    if (code !== null && code !== 0) {
      entry.endError = entry.errBuf || ('docker logs 进程退出, code=' + code)
    }
  })
  proc.on('error', (err) => {
    entry.ended = true
    entry.endError = fmtError(err)
  })
  watchers.set(name, entry)
  return entry
}

// ---------- 状态聚合 ----------
async function statusView() {
  const ver = await dockerRun(['version', '--format', 'json'])
  if (ver.exitCode !== 0) {
    return { ok: false, error: 'Docker 守护进程不可用: ' + capText(ver.stderr || ver.stdout, 200) }
  }
  let clientVersion = null
  let serverVersion = null
  let apiVersion = null
  try {
    const v = JSON.parse(ver.stdout)
    clientVersion = v.Client ? v.Client.Version : null
    serverVersion = v.Server ? v.Server.Version : null
    apiVersion = v.Server ? v.Server.ApiVersion : null
  } catch (e) { /* ignore */ }
  const ps = await dockerRun(['ps', '-a', '--no-trunc', '--format', '{{json .}}'])
  const containers = []
  let running = 0
  for (const o of parseLines(ps.stdout)) {
    const state = o.State || 'unknown'
    if (state === 'running') running++
    containers.push({
      id: o.ID,
      name: psName(o),
      image: o.Image,
      state,
      status: o.Status || state,
      ports: o.Ports || '',
      created: o.CreatedAt || '',
      cpuPerc: null,
      memPerc: null,
      memBytes: null,
    })
  }
  const st = await dockerRun(['stats', '--no-stream', '--format', '{{json .}}'])
  const statsByName = new Map()
  if (st.exitCode === 0) {
    for (const o of parseLines(st.stdout)) {
      if (o.Name) statsByName.set(o.Name, o)
    }
  }
  let totalCpuPerc = 0
  let totalMemBytes = 0
  for (const c of containers) {
    const s = statsByName.get(c.name)
    if (s) {
      c.cpuPerc = statNum(s.CPUPerc)
      c.memPerc = statNum(s.MemPerc)
      const mu = String(s.MemUsage || '').split('/')
      c.memBytes = mu.length > 0 ? parseSize(mu[0]) : 0
      totalCpuPerc += c.cpuPerc
      totalMemBytes += c.memBytes
    }
  }
  const [images, disk, host] = await Promise.all([imageCount(), diskBytes(), hostInfo()])
  return {
    ok: true, clientVersion, serverVersion, apiVersion,
    running, total: containers.length, images, disk,
    totalCpu: host.totalCpu, totalMem: host.totalMem,
    totalCpuPerc, totalMemBytes, containers,
  }
}

function inspectView(name) {
  return dockerRun(['inspect', String(name || '')]).then((r) => {
    if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 200) }
    let o = null
    try {
      const arr = JSON.parse(r.stdout)
      o = Array.isArray(arr) ? arr[0] : arr
    } catch (e) {
      return { ok: false, error: '解析失败' }
    }
    if (!o) return { ok: false, error: '未找到容器' }
    const slim = {
      id: o.Id,
      name: o.Name,
      image: o.Config ? o.Config.Image : null,
      created: o.Created || '',
      state: o.State ? pick(o.State, ['Status', 'Running', 'Paused', 'Restarting', 'ExitCode', 'Pid', 'StartedAt', 'FinishedAt']) : null,
      cmd: o.Config ? o.Config.Cmd : null,
      entrypoint: o.Config ? o.Config.Entrypoint : null,
      workingDir: o.Config ? o.Config.WorkingDir : null,
      user: o.Config ? o.Config.User : null,
      envCount: o.Config && o.Config.Env ? o.Config.Env.length : 0,
      tty: !!(o.Config && o.Config.Tty),
      restartPolicy: o.HostConfig && o.HostConfig.RestartPolicy ? o.HostConfig.RestartPolicy.Name : null,
      ports: o.NetworkSettings ? o.NetworkSettings.Ports : null,
      networks: o.NetworkSettings && o.NetworkSettings.Networks ? Object.keys(o.NetworkSettings.Networks) : [],
      mounts: (o.Mounts || []).map((m) => ({ type: m.Type, source: m.Source || null, dest: m.Destination, rw: !!m.RW })),
      labels: o.Config && o.Config.Labels ? o.Config.Labels : {},
    }
    return { ok: true, data: slim }
  })
}

function logsView(name, tail) {
  const n = Math.min(Math.max(Number(tail) || 200, 1), 2000)
  return dockerRun(['logs', '--tail', String(n), '--timestamps', String(name || '')]).then((r) => {
    if (r.exitCode !== 0 && !r.stdout) return { ok: false, error: capText(r.stderr || r.stdout, 200) }
    return { ok: true, text: r.stdout + (r.stderr ? '[stderr]' + String.fromCharCode(10) + r.stderr : '') }
  })
}

function topView(name) {
  return dockerRun(['top', String(name || '')]).then((r) => {
    if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 200) }
    const lines = r.stdout.split(String.fromCharCode(10)).filter((l) => l.trim().length > 0)
    if (lines.length === 0) return { ok: true, titles: [], rows: [] }
    const head = lines[0].split(/\s+/)
    const titles = head.slice(0, 3).concat([head.slice(3).join(' ') || 'COMMAND'])
    const rows = lines.slice(1).map((l) => {
      const p = l.split(/\s+/)
      return [p[0] || '', p[1] || '', p[2] || '', p.slice(3).join(' ')]
    })
    return { ok: true, titles, rows }
  })
}

function opView(name, action) {
  const c = String(name || '')
  const a = action
  if (!c) return Promise.resolve({ ok: false, error: '缺少容器名' })
  let argv = null
  if (a === 'start') argv = ['start', c]
  else if (a === 'stop') argv = ['stop', c]
  else if (a === 'rm') argv = ['rm', '-f', c]
  else return Promise.resolve({ ok: false, error: '未知操作: ' + String(a) })
  return dockerRun(argv).then((r) => {
    if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 200) }
    return { ok: true, action: a, container: c, result: r.stdout.trim() || '成功' }
  })
}

function watchReadView(name, so, se) {
  return ensureWatcher(String(name || '')).then((entry) => {
    if (entry.error) return { ok: false, error: entry.error }
    entry.lastRead = Date.now()
    let delta = ''
    if (entry.outBuf.length > (Number(so) || 0)) {
      delta += entry.outBuf.slice(Number(so) || 0)
      entry.stdoutOffset = entry.outBuf.length
    }
    if (entry.errBuf.length > (Number(se) || 0)) {
      delta += entry.errBuf.slice(Number(se) || 0)
      entry.stderrOffset = entry.errBuf.length
    }
    return {
      ok: true,
      delta,
      stdoutOffset: entry.stdoutOffset,
      stderrOffset: entry.stderrOffset,
      mode: entry.mode,
      ended: entry.ended,
      endError: entry.endError,
    }
  })
}

function watchStopView(name) {
  const entry = watchers.get(String(name || ''))
  if (entry) {
    try {
      entry.proc.kill()
    } catch (e) { /* ignore */ }
    watchers.delete(String(name || ''))
  }
  return Promise.resolve({ ok: true })
}

// ---------- HTTP 路由 ----------
function queryOf(req) {
  try {
    return new URL(req.url || '/', 'http://localhost').searchParams
  } catch (e) {
    return new URLSearchParams()
  }
}

function sendJson(res, status, obj) {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.statusCode = status
    res.end(JSON.stringify(obj))
  } catch (e) { /* ignore */ }
}

function apply(ctx) {
  const tools = ctx.get('tools')
  const webServer = ctx.get('webServer')
  try {
    console.log('[dock] apply: webServer=' + (webServer ? 'yes' : 'NO') + ', tools=' + (tools ? 'yes' : 'NO'))
  } catch (e) { /* ignore */ }

  // watchers 统一清理 + 闲置回收
  ctx.effect(() => {
    return () => {
      for (const entry of watchers.values()) {
        try {
          entry.proc.kill()
        } catch (e) { /* ignore */ }
      }
      watchers.clear()
    }
  }, 'dock: watchers cleanup')
  ctx.effect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      for (const [name, entry] of watchers) {
        if (!entry.ended && now - entry.lastRead > 90000) {
          try {
            entry.proc.kill()
          } catch (e) { /* ignore */ }
          watchers.delete(name)
        }
      }
    }, 30000)
    return () => clearInterval(timer)
  }, 'dock: idle sweep')

  // ---------- HTTP 路由 ----------
  if (webServer) {
    const route = (path, handler) => {
      ctx.effect(() => {
        try {
          const disposer = webServer.register({ kind: 'exact', path, handler })
          try { console.log('[dock] route registered: ' + path) } catch (e) { /* ignore */ }
          return disposer
        } catch (err) {
          try { console.error('[dock] route FAILED: ' + path + ' -> ' + String((err && err.message) || err)) } catch (e) { /* ignore */ }
        }
      }, 'dock: ' + path)
    }

    route('/dock-api/status', async (req, res) => {
      try {
        sendJson(res, 200, await statusView())
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })

    route('/dock-api/inspect', async (req, res) => {
      try {
        const container = queryOf(req).get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await inspectView(container))
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })

    route('/dock-api/logs', async (req, res) => {
      try {
        const q = queryOf(req)
        const container = q.get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await logsView(container, q.get('tail') || 500))
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })

    route('/dock-api/top', async (req, res) => {
      try {
        const container = queryOf(req).get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await topView(container))
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })

    route('/dock-api/op', async (req, res) => {
      try {
        const q = queryOf(req)
        const container = q.get('container') || ''
        const action = q.get('action') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await opView(container, action))
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })

    route('/dock-api/watch', async (req, res) => {
      try {
        const q = queryOf(req)
        const container = q.get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await watchReadView(container, q.get('so') || 0, q.get('se') || 0))
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })

    route('/dock-api/watchstop', async (req, res) => {
      try {
        const container = queryOf(req).get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await watchStopView(container))
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })
  }

  // ---------- 模型工具 ----------
  if (tools) {
    const registerTool = (tool) => {
      ctx.effect(() => {
        try {
          const disposer = tools.register(tool)
          try { console.log('[dock] tool registered: ' + tool.name) } catch (e) { /* ignore */ }
          return disposer
        } catch (err) {
          try { console.error('[dock] tool FAILED: ' + tool.name + ' -> ' + String((err && err.message) || err)) } catch (e) { /* ignore */ }
        }
      }, 'dock: tool ' + tool.name)
    }

    const strArr = (label) => ({ type: 'array', items: { type: 'string' }, description: label })
    const OUT = { schema: { type: 'object', additionalProperties: true }, render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }

    registerTool({
      name: 'docker_info',
      description: '查看本地 Docker 守护进程状态:版本、API、容器/镜像/卷/网络数量与磁盘占用。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      async execute() {
        const [ver, info, df] = await Promise.all([
          dockerRun(['version', '--format', 'json']),
          dockerRun(['info', '--format', 'json']),
          dockerRun(['system', 'df', '--format', 'json']),
        ])
        if (ver.exitCode !== 0) {
          return { ok: false, error: 'Docker 守护进程不可用: ' + capText(ver.stderr || ver.stdout, 300) }
        }
        const out = { ok: true }
        try {
          const v = JSON.parse(ver.stdout)
          out.clientVersion = v.Client ? v.Client.Version : null
          out.serverVersion = v.Server ? v.Server.Version : null
          out.apiVersion = v.Server ? v.Server.ApiVersion : null
        } catch (e) { /* ignore */ }
        try {
          const i = JSON.parse(info.stdout)
          out.server = i.ServerVersion || null
          out.context = i.Name || null
          out.storageDriver = i.Driver || null
          out.memoryBytes = i.MemTotal || 0
          out.cpuCount = i.NCPU || 0
          out.containers = i.Containers
            ? { running: i.Containers.Running || 0, paused: i.Containers.Paused || 0, stopped: i.Containers.Stopped || 0 }
            : null
          out.images = i.Images || 0
          out.volumes = i.Volumes || 0
          out.networks = i.Networks || 0
        } catch (e) { /* ignore */ }
        let disk = 0
        for (const line of df.stdout.split(String.fromCharCode(10))) {
          const t = line.trim()
          if (!t) continue
          try {
            const o = JSON.parse(t)
            disk += parseSize(o.Size)
          } catch (e) { /* ignore */ }
        }
        out.diskBytes = disk
        return out
      },
    })

    registerTool({
      name: 'docker_ps',
      description: '列出本地容器(默认仅运行中;all=true 含已停止)。返回 ID/名称/镜像/状态/端口等,可用于后续操作。',
      parameters: {
        type: 'object',
        properties: {
          all: { type: 'boolean', description: '是否包含已停止的容器, 默认 false' },
          filters: { type: 'string', description: '逗号分隔的过滤条件, 如 name=web,status=exited' },
        },
      },
      output: OUT,
      async execute(args) {
        const argv = ['ps', '--no-trunc', '--format', '{{json .}}']
        if (args.all) argv.push('-a')
        if (args.filters) {
          for (const f of String(args.filters).split(',')) {
            const f2 = f.trim()
            if (f2) argv.push('--filter', f2)
          }
        }
        const r = await dockerRun(argv)
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        const items = parseLines(r.stdout).map((o) => ({
          id: o.ID,
          name: psName(o),
          image: o.Image,
          command: o.Command,
          state: o.State,
          status: o.Status,
          ports: o.Ports,
          created: o.CreatedAt,
          size: o.Size,
        }))
        return { ok: true, count: items.length, items }
      },
    })

    registerTool({
      name: 'docker_images',
      description: '列出本地镜像:仓库、标签、ID、大小、创建时间。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      async execute() {
        const r = await dockerRun(['images', '--format', '{{json .}}'])
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        const items = parseLines(r.stdout).map((o) => ({
          repository: o.Repository,
          tag: o.Tag,
          id: o.ID,
          digest: o.Digest,
          size: o.Size,
          createdSince: o.CreatedSince,
          createdAt: o.CreatedAt,
        }))
        return { ok: true, count: items.length, items }
      },
    })

    registerTool({
      name: 'docker_pull',
      description: '从仓库拉取镜像, 如 nginx 或 python:3.12-slim。可指定平台。',
      parameters: {
        type: 'object',
        properties: {
          image: { type: 'string', description: '镜像名(可含 tag), 如 nginx:latest' },
          platform: { type: 'string', description: '平台, 如 linux/amd64' },
        },
        required: ['image'],
      },
      output: OUT,
      async execute(args) {
        const argv = ['pull']
        if (args.platform) argv.push('--platform', args.platform)
        argv.push(args.image)
        const r = await dockerRun(argv, { timeoutMs: 600000 })
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 800) }
        return { ok: true, result: capText(r.stdout || r.stderr, 2000).trim() }
      },
    })

    registerTool({
      name: 'docker_run',
      description: '创建并启动容器。ports 如 ["8080:80"], volumes 如 ["/host:/data"], env 如 ["K=V"]。detach 默认 true;command 在容器内以 sh -lc 执行。',
      parameters: {
        type: 'object',
        properties: {
          image: { type: 'string', description: '镜像名' },
          name: { type: 'string', description: '容器名' },
          detach: { type: 'boolean', description: '后台运行, 默认 true' },
          rm: { type: 'boolean', description: '退出后自动删除' },
          tty: { type: 'boolean', description: '分配 TTY' },
          interactive: { type: 'boolean', description: '保持 stdin 打开' },
          ports: strArr('端口映射, 如 8080:80'),
          volumes: strArr('卷挂载, 如 /host:/data'),
          env: strArr('环境变量, 如 KEY=VALUE'),
          network: { type: 'string', description: '网络名' },
          restart: { type: 'string', description: '重启策略, 如 unless-stopped' },
          user: { type: 'string', description: '运行用户' },
          workdir: { type: 'string', description: '工作目录' },
          entrypoint: { type: 'string', description: '覆盖入口点' },
          labels: strArr('标签, 如 app=web'),
          command: { type: 'string', description: '容器内要执行的命令(经 sh -lc)' },
        },
        required: ['image'],
      },
      output: OUT,
      async execute(args) {
        const argv = ['run']
        if (args.detach !== false) argv.push('-d')
        if (args.rm) argv.push('--rm')
        if (args.tty) argv.push('-t')
        if (args.interactive) argv.push('-i')
        if (args.name) argv.push('--name', args.name)
        for (const p of args.ports || []) argv.push('-p', String(p))
        for (const v of args.volumes || []) argv.push('-v', String(v))
        for (const e of args.env || []) argv.push('-e', String(e))
        for (const l of args.labels || []) argv.push('--label', String(l))
        if (args.network) argv.push('--network', args.network)
        if (args.restart) argv.push('--restart', args.restart)
        if (args.user) argv.push('-u', args.user)
        if (args.workdir) argv.push('-w', args.workdir)
        if (args.entrypoint) argv.push('--entrypoint', args.entrypoint)
        argv.push(args.image)
        if (args.command) argv.push('sh', '-lc', args.command)
        const r = await dockerRun(argv, { timeoutMs: 600000 })
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 800) }
        const id = r.stdout.trim().split(String.fromCharCode(10)).pop() || ''
        return { ok: true, containerId: id, note: capText(r.stderr, 500) || null }
      },
    })

    registerTool({
      name: 'docker_start',
      description: '启动已停止的容器。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID' },
        },
        required: ['container'],
      },
      output: OUT,
      async execute(args) {
        const r = await dockerRun(['start', args.container])
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        return { ok: true, result: '已启动: ' + (r.stdout.trim() || args.container) }
      },
    })

    registerTool({
      name: 'docker_stop',
      description: '停止运行中的容器。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID' },
          timeout: { type: 'integer', description: '优雅停止等待秒数' },
        },
        required: ['container'],
      },
      output: OUT,
      async execute(args) {
        const argv = ['stop']
        if (args.timeout) argv.push('-t', String(args.timeout))
        argv.push(args.container)
        const r = await dockerRun(argv, { timeoutMs: 120000 })
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        return { ok: true, result: '已停止: ' + (r.stdout.trim() || args.container) }
      },
    })

    registerTool({
      name: 'docker_restart',
      description: '重启容器。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID' },
          timeout: { type: 'integer', description: '停止等待秒数' },
        },
        required: ['container'],
      },
      output: OUT,
      async execute(args) {
        const argv = ['restart']
        if (args.timeout) argv.push('-t', String(args.timeout))
        argv.push(args.container)
        const r = await dockerRun(argv, { timeoutMs: 120000 })
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        return { ok: true, result: '已重启: ' + (r.stdout.trim() || args.container) }
      },
    })

    registerTool({
      name: 'docker_rm',
      description: '删除容器(默认仅停止的容器;force=true 强制删除运行中容器)。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID' },
          force: { type: 'boolean', description: '强制删除运行中的容器' },
          volumes: { type: 'boolean', description: '同时删除匿名卷' },
        },
        required: ['container'],
      },
      output: OUT,
      async execute(args) {
        const argv = ['rm']
        if (args.force) argv.push('-f')
        if (args.volumes) argv.push('-v')
        argv.push(args.container)
        const r = await dockerRun(argv)
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        return { ok: true, result: (r.stdout.trim() || args.container) + ' 已删除' }
      },
    })

    registerTool({
      name: 'docker_rmi',
      description: '删除镜像。',
      parameters: {
        type: 'object',
        properties: {
          image: { type: 'string', description: '镜像名或 ID' },
          force: { type: 'boolean', description: '强制删除' },
        },
        required: ['image'],
      },
      output: OUT,
      async execute(args) {
        const argv = ['rmi']
        if (args.force) argv.push('-f')
        argv.push(args.image)
        const r = await dockerRun(argv)
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        return { ok: true, result: capText(r.stdout.trim() || '已删除', 1000) }
      },
    })

    registerTool({
      name: 'docker_logs',
      description: '读取容器日志(默认最近 200 行)。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID' },
          tail: { type: 'integer', description: '最近行数, 默认 200, 最大 5000' },
          since: { type: 'string', description: '起始时间, 如 2026-08-15T10:00:00 或 30m' },
          timestamps: { type: 'boolean', description: '是否带时间戳' },
        },
        required: ['container'],
      },
      output: OUT,
      async execute(args) {
        const tail = Math.min(Math.max(Number(args.tail) || 200, 1), 5000)
        const argv = ['logs', '--tail', String(tail)]
        if (args.since) argv.push('--since', String(args.since))
        if (args.timestamps) argv.push('--timestamps')
        argv.push(args.container)
        const r = await dockerRun(argv)
        if (r.exitCode !== 0 && !r.stdout) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        const text = r.stdout + (r.stderr ? '[stderr]' + String.fromCharCode(10) + r.stderr : '')
        return { ok: true, text: capText(text, 50000) }
      },
    })

    registerTool({
      name: 'docker_exec',
      description: '在运行中的容器内执行命令(容器内以 sh -lc 执行, 支持管道/变量)。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID' },
          command: { type: 'string', description: '要执行的命令, 如 ls -la /app' },
          user: { type: 'string', description: '以指定用户执行' },
          workdir: { type: 'string', description: '工作目录' },
          env: strArr('附加环境变量'),
        },
        required: ['container', 'command'],
      },
      output: OUT,
      async execute(args) {
        const argv = ['exec']
        if (args.user) argv.push('-u', args.user)
        if (args.workdir) argv.push('-w', args.workdir)
        for (const e of args.env || []) argv.push('-e', String(e))
        argv.push(args.container, 'sh', '-lc', args.command)
        const r = await dockerRun(argv, { timeoutMs: 120000 })
        if (r.exitCode !== 0) {
          return { ok: false, exitCode: r.exitCode, output: capText(r.stdout, 20000), error: capText(r.stderr, 2000) }
        }
        return { ok: true, exitCode: 0, output: capText(r.stdout, 20000), stderr: capText(r.stderr, 2000) || null }
      },
    })

    registerTool({
      name: 'docker_inspect',
      description: '查看对象详细信息(JSON), 对象类型可为容器/镜像/网络/卷。',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '名称或 ID' },
          type: { type: 'string', enum: ['container', 'image', 'network', 'volume'], description: '对象类型, 默认 container' },
        },
        required: ['target'],
      },
      output: OUT,
      async execute(args) {
        const argv = ['inspect']
        if (args.type) argv.push('--type', args.type)
        argv.push(args.target)
        const r = await dockerRun(argv)
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        let data = null
        try {
          const arr = JSON.parse(r.stdout)
          data = Array.isArray(arr) ? arr[0] : arr
        } catch (e) {
          return { ok: false, error: 'inspect 输出解析失败' }
        }
        const json = JSON.stringify(data)
        if (json.length > 60000 && data && data.State) {
          data = {
            id: data.Id,
            name: data.Name,
            image: data.Config ? data.Config.Image : null,
            state: data.State ? pick(data.State, ['Status', 'Running', 'Paused', 'ExitCode', 'StartedAt', 'FinishedAt', 'Pid']) : null,
            created: data.Created,
            config: pick(data.Config || {}, ['Image', 'Cmd', 'Entrypoint', 'Env', 'Labels', 'Tty', 'OpenStdin', 'WorkingDir', 'User', 'Hostname']),
            host: pick(data.HostConfig || {}, ['RestartPolicy', 'NetworkMode', 'PortBindings', 'Binds', 'Privileged']),
            network: pick(data.NetworkSettings || {}, ['Ports', 'Networks']),
            mounts: data.Mounts,
          }
        }
        return { ok: true, truncated: json.length > 60000, data }
      },
    })

    registerTool({
      name: 'docker_stats',
      description: '容器资源占用快照(CPU/内存/网络/磁盘 IO/PID)。container 为空时返回全部运行中容器。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID, 可选' },
        },
      },
      output: OUT,
      async execute(args) {
        const argv = ['stats', '--no-stream', '--format', '{{json .}}']
        if (args.container) argv.push(args.container)
        const r = await dockerRun(argv)
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        const items = parseLines(r.stdout).map((o) => ({
          name: o.Name,
          id: o.ID,
          cpu: o.CPUPerc,
          mem: o.MemUsage,
          memPerc: o.MemPerc,
          net: o.NetIO,
          block: o.BlockIO,
          pids: o.PIDs || null,
        }))
        return { ok: true, count: items.length, items }
      },
    })

    registerTool({
      name: 'docker_network',
      description: '网络管理:list 列出, create 创建(-d driver, --subnet), rm 删除, connect/disconnect 连接容器, inspect 查看详情。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'rm', 'connect', 'disconnect', 'inspect'], description: '操作' },
          name: { type: 'string', description: '网络名' },
          driver: { type: 'string', description: 'create 时的驱动, 如 bridge/overlay/macvlan' },
          subnet: { type: 'string', description: 'create 时的子网, 如 172.20.0.0/16' },
          container: { type: 'string', description: 'connect/disconnect 的容器' },
        },
        required: ['action'],
      },
      output: OUT,
      async execute(args) {
        const a = args.action
        if (a === 'list') {
          const r = await dockerRun(['network', 'ls', '--format', '{{json .}}'])
          if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr, 300) }
          return { ok: true, items: parseLines(r.stdout).map((o) => ({ id: o.ID, name: o.Name, driver: o.Driver, scope: o.Scope, internal: o.Internal })) }
        }
        if (!args.name) return { ok: false, error: '缺少 name' }
        let argv = ['network', a]
        if (a === 'create') {
          if (args.driver) argv.push('-d', args.driver)
          if (args.subnet) argv.push('--subnet', args.subnet)
          argv.push(args.name)
        } else if (a === 'rm') {
          argv.push(args.name)
        } else if (a === 'connect' || a === 'disconnect') {
          if (!args.container) return { ok: false, error: '缺少 container' }
          argv.push(args.name, args.container)
        } else if (a === 'inspect') {
          argv.push(args.name)
        }
        const r = await dockerRun(argv)
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        if (a === 'inspect') {
          try {
            return { ok: true, data: JSON.parse(r.stdout) }
          } catch (e) {
            return { ok: true, text: capText(r.stdout, 20000) }
          }
        }
        return { ok: true, result: capText(r.stdout || r.stderr, 1000).trim() || '成功' }
      },
    })

    registerTool({
      name: 'docker_volume',
      description: '卷管理:list 列出, create 创建, rm 删除, inspect 查看详情。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'rm', 'inspect'], description: '操作' },
          name: { type: 'string', description: '卷名' },
          driver: { type: 'string', description: 'create 时的驱动, 默认 local' },
          label: { type: 'string', description: 'create 时的标签' },
        },
        required: ['action'],
      },
      output: OUT,
      async execute(args) {
        const a = args.action
        if (a === 'list') {
          const r = await dockerRun(['volume', 'ls', '--format', '{{json .}}'])
          if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr, 300) }
          return { ok: true, items: parseLines(r.stdout).map((o) => ({ name: o.Name, driver: o.Driver, scope: o.Scope })) }
        }
        if (!args.name) return { ok: false, error: '缺少 name' }
        let argv = ['volume', a]
        if (a === 'create') {
          if (args.driver) argv.push('-d', args.driver)
          if (args.label) argv.push('--label', args.label)
          argv.push(args.name)
        } else {
          argv.push(args.name)
        }
        const r = await dockerRun(argv)
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        if (a === 'inspect') {
          try {
            return { ok: true, data: JSON.parse(r.stdout) }
          } catch (e) {
            return { ok: true, text: capText(r.stdout, 20000) }
          }
        }
        return { ok: true, result: capText(r.stdout || r.stderr, 1000).trim() || '成功' }
      },
    })

    registerTool({
      name: 'docker_build',
      description: '从上下文目录构建镜像(上下文为宿主机路径, 相对路径基于工作区)。',
      parameters: {
        type: 'object',
        properties: {
          context: { type: 'string', description: '构建上下文路径' },
          tag: { type: 'string', description: '镜像标签, 如 myapp:latest' },
          dockerfile: { type: 'string', description: 'Dockerfile 路径(相对 context)' },
          buildArgs: strArr('构建参数, 如 VERSION=1.0'),
          noCache: { type: 'boolean', description: '不使用缓存' },
          target: { type: 'string', description: '多阶段构建目标阶段' },
          platform: { type: 'string', description: '平台, 如 linux/amd64' },
        },
        required: ['context'],
      },
      output: OUT,
      async execute(args) {
        const argv = ['build']
        if (args.tag) argv.push('-t', args.tag)
        if (args.dockerfile) argv.push('-f', args.dockerfile)
        for (const b of args.buildArgs || []) argv.push('--build-arg', String(b))
        if (args.noCache) argv.push('--no-cache')
        if (args.target) argv.push('--target', args.target)
        if (args.platform) argv.push('--platform', args.platform)
        argv.push(args.context)
        const r = await dockerRun(argv, { timeoutMs: 900000 })
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 1500) }
        return { ok: true, output: capText((r.stdout + String.fromCharCode(10) + r.stderr).trim(), 3000) }
      },
    })

    registerTool({
      name: 'docker_cli',
      description: '通用 docker 命令直通:覆盖全部子命令(compose/push/tag/save/load/cp/commit/exec/port/events 等)。args 为完整参数列表, 如 ["compose","up","-d"] 或 ["images"]。',
      parameters: {
        type: 'object',
        properties: {
          args: strArr('docker 子命令及参数, 如 ["run","-d","nginx"]'),
          note: { type: 'string', description: '本次操作意图说明(可选)' },
        },
        required: ['args'],
      },
      output: OUT,
      async execute(args) {
        const argv = (args.args || []).map(String)
        if (!argv.length || argv.some((x) => x.length === 0)) return { ok: false, error: 'args 不能为空' }
        const r = await dockerRun(argv, { timeoutMs: 300000 })
        const out = capText(r.stdout, 100000)
        const err = capText(r.stderr, 40000)
        if (r.exitCode !== 0) return { ok: false, exitCode: r.exitCode, output: out, error: err || 'docker 命令失败' }
        return { ok: true, exitCode: 0, output: out, stderr: err || null }
      },
    })
  }

  try { console.log('[dock] Docker deployment plugin ready') } catch (e) { /* ignore */ }
}

export { apply }
export const inject = ['webServer', 'tools']
