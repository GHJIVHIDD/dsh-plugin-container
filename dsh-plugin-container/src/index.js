/**
 * Host loader entry for the deployment-level Docker container sandbox plugin.
 *
 * v1.0.0 — full parity with the official VM sandbox plugin (dsh-plugin-vm-sandbox)
 * implemented on top of the local Docker Engine so Linux / Windows / macOS
 * users without OrbStack get the same sandbox capabilities:
 *
 *   1. 快照与回滚 docker_snapshot / docker_snapshot_list / docker_restore / docker_snapshot_delete
 *   2. 文件传输 docker_upload / docker_download (docker cp)
 *   3. 生命周期管理 docker_create / docker_status / docker_start / docker_stop / docker_restart / docker_run
 *   4. 端口转发 docker_port_forward / docker_port_forward_list / docker_port_forward_stop
 *      (alpine/socat 代理容器, Docker 官方镜像)
 *   5. 后台任务 docker_job_submit / docker_job_list / docker_job_status / docker_job_stop / docker_job_output
 *   6. 操作审计 docker_audit
 *   7. 共享协作 docker_share / docker_unshare / docker_policy (归属、权限、配额、回收)
 *   8. 网络策略 docker_network_policy (public_access / internal_access / isolated / isolate_network)
 *   9. 自定义资源规格 docker_create / docker_run (cpus / memory / memory_swap / shm_size / pids_limit / disk_quota)
 *  10. 初始化脚本 docker_create / docker_run (init_script / command)
 *  11. 多容器并行执行 docker_exec(containers)
 *  12. 状态查询增强 docker_status(IP/资源用量/归属/权限/快照/任务/隧道)
 *
 * All underlying operations use the official Docker CLI only (no daemon socket
 * access, no private RPC): docker ps/inspect/run/commit/cp/exec/network/...
 */

import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

const DOCKER = 'docker'
const HOME = process.env.HOME || ''
const STATE_DIR = join(HOME, '.dsh', 'container-sandbox')
const STATE_FILE = join(STATE_DIR, 'state.json')
const PY_TABLE_FILE = join(STATE_DIR, 'pinyin-initials.json')

const PUBLIC_NETWORK = 'dsh-sandbox'
const INTERNAL_NETWORK = 'dsh-sandbox-internal'
const SOCAT_IMAGE = 'alpine/socat:latest'
const PF_PREFIX = 'dsh-pf-'

const MAX_RUNNING = 64
const MAX_PER_SESSION = 8
const MAX_SNAPSHOTS = 64
const MAX_SNAPSHOTS_PER_SESSION = 16
const MAX_JOBS_PER_SESSION = 32
const MAX_TUNNELS = 32
const MAX_AUDIT = 3000
const IDLE_SWEEP_MS = 5 * 60 * 1000
const ACTIVE_WINDOW_MS = 15 * 60 * 1000
const SHELL_LOG_LIMIT = 200
const DEFAULT_TIMEOUT_MS = 120000

// ---------- 状态持久化 ----------
// containers[sessionId] = [{name,image,createdAt,lastUsedAt,spec,createdWith}]
// snapshots[name] = {name,image,source,sessionId,createdAt,wasRunning,note,spec}
// shares[name] = [{sessionId,mode,sharedAt}]
// policies[sessionId] = {maxContainers,idleSleepMinutes,idleDeleteDays}
// network[name] = {publicAccess,internalAccess,isolated,isolateNetwork,updatedAt,appliedAt,savedNetworks}
// jobs[] / tunnels[] / audit[]
function normalizeContainers(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const sid of Object.keys(raw)) {
    const val = raw[sid]
    if (Array.isArray(val)) {
      const list = val.filter((r) => r && typeof r === 'object' && typeof r.name === 'string' && r.name)
      if (list.length > 0) out[sid] = list
    } else if (val && typeof val === 'object' && typeof val.name === 'string' && val.name) {
      out[sid] = [{ ...val }]
    }
  }
  return out
}

function loadStateFile() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.containers && typeof parsed.containers === 'object') {
      return {
        version: 2,
        containers: normalizeContainers(parsed.containers),
        snapshots: parsed.snapshots && typeof parsed.snapshots === 'object' ? parsed.snapshots : {},
        shares: parsed.shares && typeof parsed.shares === 'object' ? parsed.shares : {},
        policies: parsed.policies && typeof parsed.policies === 'object' ? parsed.policies : {},
        network: parsed.network && typeof parsed.network === 'object' ? parsed.network : {},
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
        tunnels: Array.isArray(parsed.tunnels) ? parsed.tunnels : [],
        audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      }
    }
  } catch (e) { /* 缺失或损坏时使用空状态 */ }
  return { version: 2, containers: {}, snapshots: {}, shares: {}, policies: {}, network: {}, jobs: [], tunnels: [], audit: [] }
}

let state = loadStateFile()
let knownArchived = new Set()
let sweeping = false
const inFlight = new Map()
const shellLogs = new Map()

function saveState() {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(STATE_FILE, JSON.stringify(state))
  } catch (e) {
    try { console.error('[dock] state save failed:', (e && e.message) || e) } catch (e2) { /* ignore */ }
  }
}

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
  while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) { num += s[i]; i++ }
  if (!num) return 0
  const n = parseFloat(num)
  if (!isFinite(n)) return 0
  const rest = s.slice(i).trim().toLowerCase()
  const mult = rest.indexOf('t') === 0 ? 1024 ** 4
    : rest.indexOf('g') === 0 ? 1024 ** 3
    : rest.indexOf('m') === 0 ? 1024 ** 2
    : rest.indexOf('k') === 0 ? 1024
    : 1
  return Math.round(n * mult)
}
function parseLines(text) {
  const out = []
  for (const line of String(text).split('\n')) {
    const t = line.trim()
    if (!t) continue
    try { out.push(JSON.parse(t)) } catch (e) { /* skip */ }
  }
  return out
}
function psName(o) {
  const n = o.Names
  if (Array.isArray(n)) return (n[0] || '').trim().replace(/^\//, '') || o.ID || ''
  if (typeof n === 'string') {
    const first = n.split(',').map((s) => s.trim().replace(/^\//, '')).filter(Boolean)[0]
    return first || o.ID || ''
  }
  return o.ID || ''
}
function statNum(v) {
  const f = parseFloat(String(v == null ? '' : v))
  return isFinite(f) ? f : 0
}
function parseLabels(labels) {
  const out = {}
  if (labels && typeof labels === 'object') {
    for (const [k, v] of Object.entries(labels)) out[k] = String(v)
  } else if (typeof labels === 'string' && labels) {
    for (const part of labels.split(',')) {
      const idx = part.indexOf('=')
      if (idx > 0) out[part.slice(0, idx)] = part.slice(idx + 1)
    }
  }
  return out
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const nowIso = () => new Date().toISOString()
const nowMs = () => Date.now()
const genId = (prefix) => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)

// ---------- docker 命令执行 ----------
async function dockerRun(argv, opts) {
  opts = opts || {}
  const timeout = opts.timeoutMs || DEFAULT_TIMEOUT_MS
  try {
    const { stdout, stderr } = await execFileP(DOCKER, argv, {
      timeout,
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
      ...(opts.signal != null ? { signal: opts.signal } : {}),
    })
    return { exitCode: 0, stdout: String(stdout || ''), stderr: String(stderr || '') }
  } catch (err) {
    return {
      exitCode: typeof err.code === 'number' ? err.code : -1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || fmtError(err)),
    }
  }
}

async function dockerOk(argv, opts, what) {
  const r = await dockerRun(argv, opts)
  if (r.exitCode !== 0) {
    throw new Error((what ? what + ': ' : 'docker 命令失败: ') + capText(r.stderr || r.stdout, 400))
  }
  return r
}

async function dockerJson(argv, opts) {
  const r = await dockerRun(argv, opts)
  if (r.exitCode !== 0) throw new Error('docker 命令失败: ' + capText(r.stderr || r.stdout, 400))
  try {
    return JSON.parse(r.stdout.trim() || 'null')
  } catch (e) {
    throw new Error('docker 输出解析失败: ' + capText(r.stdout, 200))
  }
}

async function inspectAll(idsOrNames) {
  if (!idsOrNames || idsOrNames.length === 0) return []
  const r = await dockerRun(['inspect', ...idsOrNames.map(String)], { timeoutMs: 60000 })
  if (r.exitCode !== 0) return []
  try {
    const arr = JSON.parse(r.stdout)
    return Array.isArray(arr) ? arr : []
  } catch (e) { return [] }
}

async function inspectContainer(name) {
  const r = await dockerRun(['inspect', String(name || '')])
  if (r.exitCode !== 0) return null
  try {
    const arr = JSON.parse(r.stdout)
    const o = Array.isArray(arr) ? arr[0] : arr
    return o || null
  } catch (e) { return null }
}

async function containerState(name) {
  const ins = await inspectContainer(name)
  if (!ins || !ins.State) return null
  return {
    status: String(ins.State.Status || ''),
    running: !!ins.State.Running,
    paused: !!ins.State.Paused,
    restarting: !!ins.State.Restarting,
    dead: !!ins.State.Dead,
    exitCode: ins.State.ExitCode,
    pid: ins.State.Pid,
    startedAt: ins.State.StartedAt,
    finishedAt: ins.State.FinishedAt,
  }
}

async function ensureRunning(name) {
  const st = await containerState(name)
  if (!st) throw new Error('未找到容器: ' + name)
  if (st.running && !st.paused) return
  if (st.paused) {
    const r = await dockerRun(['unpause', name], { timeoutMs: 120000 })
    if (r.exitCode !== 0) throw new Error('docker unpause 失败: ' + capText(r.stderr || r.stdout, 300))
    await ensureNetworkApplied(name)
    return
  }
  const r = await dockerRun(['start', name], { timeoutMs: 300000 })
  if (r.exitCode !== 0) throw new Error('docker start 失败: ' + capText(r.stderr || r.stdout, 300))
  await ensureNetworkApplied(name)
}

async function ensureImage(image) {
  const r = await dockerRun(['image', 'inspect', image])
  if (r.exitCode === 0) return
  const pull = await dockerRun(['pull', image], { timeoutMs: 900000 })
  if (pull.exitCode !== 0) throw new Error('docker pull ' + image + ' 失败: ' + capText(pull.stderr || pull.stdout, 500))
}

function containerNetworkInfo(ins) {
  const nets = (ins && ins.NetworkSettings && ins.NetworkSettings.Networks) || {}
  const entries = Object.entries(nets)
  const first = entries[0]
  return {
    networks: entries.map(([name, v]) => ({ name, ip: (v && v.IPAddress) || '', gateway: (v && v.Gateway) || '', aliases: (v && v.Aliases) || [] })),
    primaryNetwork: first ? first[0] : '',
    primaryIp: first && first[1] ? (first[1].IPAddress || '') : '',
  }
}

// ---------- Shell 执行记录 ----------
function pushShellLog(name, entry) {
  if (!shellLogs.has(name)) shellLogs.set(name, [])
  const list = shellLogs.get(name)
  list.push(entry)
  if (list.length > SHELL_LOG_LIMIT) list.splice(0, list.length - SHELL_LOG_LIMIT)
}

function shellLogView(name) {
  return { ok: true, name, entries: shellLogs.get(name) || [] }
}

// ---------- 会话信息与命名 ----------
async function sessionTitleOf(ctx, sessionId) {
  if (!sessionId) return null
  const sessionsSvc = ctx.get('sessions')
  const st = ctx.get('sessionTitle')
  if (sessionsSvc && st) {
    const session = sessionsSvc.get(sessionId)
    if (session) {
      const snap = st.get(session)
      if (snap && snap.title) return snap.title
    }
  }
  const sq = ctx.get('sessionQuery')
  if (sq && typeof sq.readTitle === 'function') {
    try {
      const snap = await sq.readTitle(sessionId)
      if (snap && snap.title) return snap.title
    } catch (err) { /* ignore */ }
  }
  return null
}

let pyTable = undefined
function loadPyTable() {
  if (pyTable !== undefined) return pyTable
  pyTable = null
  try {
    const parsed = JSON.parse(readFileSync(PY_TABLE_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object') pyTable = parsed
  } catch (e) { /* ignore */ }
  return pyTable
}
function codepointLetter(ch) {
  return String.fromCharCode(97 + ((ch.codePointAt(0) || 0) % 26))
}
function abbreviate(title, sessionId) {
  const text = String(title || '').trim()
  const ascii = text.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (ascii.length >= 3) return ascii.slice(0, 8)
  const table = loadPyTable()
  let initials = ''
  for (const ch of text) {
    if (initials.length >= 8) break
    if (/[a-z0-9]/i.test(ch)) initials += ch.toLowerCase()
    else {
      const code = ch.codePointAt(0)
      if (code && code >= 0x4E00 && code <= 0x9FFF) initials += (table && table[ch]) || codepointLetter(ch)
      else if (code) initials += codepointLetter(ch)
    }
  }
  const padSrc = text || String(sessionId || 'ctr')
  let i = 0
  while (initials.length < 3) {
    const ch = padSrc[i % padSrc.length] || 'c'
    initials += codepointLetter(ch)
    i++
  }
  return initials.slice(0, 8)
}
function sanitizeName(hint) {
  return String(hint || '').trim().toLowerCase().replace(/[^a-z0-9][^a-z0-9-]*/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}
function sanitizeContainerName(name) {
  let clean = String(name || '').trim().replace(/^\/+/, '').replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/^[^a-zA-Z0-9]+/, '')
  return clean.slice(0, 64)
}
async function uniqueContainerName(ctx, sessionId, hint) {
  const title = await sessionTitleOf(ctx, sessionId)
  let existing = new Set()
  try {
    const r = await dockerRun(['ps', '-a', '--format', '{{.Names}}'])
    if (r.exitCode === 0) existing = new Set(r.stdout.split('\n').map((s) => s.trim()).filter(Boolean))
  } catch (e) { /* ignore */ }
  const hintClean = sanitizeContainerName(hint)
  const stem = hintClean || 'c-' + abbreviate(title, sessionId)
  if (stem && !existing.has(stem)) return stem
  for (let n = 1; n < 1000; n++) {
    const cand = stem.slice(0, 56) + '-' + n
    if (!existing.has(cand)) return cand
  }
  return stem.slice(0, 52) + '-' + String(Date.now()).slice(-8)
}
async function uniqueSnapshotName() {
  const existing = new Set(Object.keys(state.snapshots || {}))
  for (let i = 0; i < 200; i++) {
    const cand = 'dsh-snap-' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '')
    if (!existing.has(cand)) return cand
  }
  return 'dsh-snap-' + String(Date.now()).slice(-8)
}

// ---------- 会话 / 容器记录 ----------
function sessionContainers(sessionId) {
  const list = state.containers[sessionId]
  return Array.isArray(list) ? list : []
}
function byRecent(a, b) {
  return (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0)
}
function defaultSessionContainer(sessionId) {
  const list = sessionContainers(sessionId)
  if (list.length === 0) return null
  return list.slice().sort(byRecent)[0]
}
function recordOfContainer(name) {
  for (const sid of Object.keys(state.containers)) {
    const list = state.containers[sid]
    if (!Array.isArray(list)) continue
    const found = list.find((r) => r.name === name || r.id === name)
    if (found) return { sessionId: sid, record: found, type: 'container' }
  }
  const snap = state.snapshots[name]
  if (snap && typeof snap === 'object') return { sessionId: snap.sessionId, record: snap, type: 'snapshot' }
  return null
}
function ownerOfContainer(name) {
  const found = recordOfContainer(name)
  return found ? found.sessionId : null
}
function touchContainer(sessionId, name) {
  const list = state.containers[sessionId]
  if (!Array.isArray(list) || list.length === 0) return
  const rec = name ? list.find((r) => r.name === name || r.id === name) : null
  const target = rec || list.slice().sort(byRecent)[0]
  if (!target) return
  target.lastUsedAt = Date.now()
  saveState()
}

// ---------- 权限模型 ----------
function sessionPolicy(sessionId) {
  return Object.assign(
    { maxContainers: MAX_PER_SESSION, idleSleepMinutes: 30, idleDeleteDays: 0 },
    (state.policies && state.policies[sessionId]) || {},
  )
}
function sharesOf(name) {
  return (state.shares && state.shares[name]) || []
}
function shareMode(name, sessionId) {
  if (!sessionId) return null
  const found = sharesOf(name).find((s) => s.sessionId === sessionId)
  return found ? found.mode : null
}
function canExec(sessionId, name) {
  const found = recordOfContainer(name)
  if (!found) return true
  if (found.sessionId === sessionId) return true
  const mode = shareMode(name, sessionId)
  return mode === 'exec' || mode === 'manage'
}
function canManage(sessionId, name) {
  const found = recordOfContainer(name)
  if (!found) return true
  if (found.sessionId === sessionId) return true
  return shareMode(name, sessionId) === 'manage'
}
function canOwner(sessionId, name) {
  const found = recordOfContainer(name)
  return !found || found.sessionId === sessionId
}
function assertExec(sessionId, name) {
  if (!canExec(sessionId, name)) throw new Error('没有权限操作该容器(' + name + '),请先 docker_share')
}
function assertManage(sessionId, name) {
  if (!canManage(sessionId, name)) throw new Error('没有权限管理该容器(' + name + '),请先 docker_share(mode=manage)')
}

// ---------- 审计 ----------
function pushAudit(sessionId, container, operation, params, ok, error, durationMs) {
  try {
    const entry = {
      id: genId('audit'),
      ts: nowMs(),
      iso: nowIso(),
      sessionId: sessionId || null,
      container: container || null,
      operation,
      params: params || {},
      ok: !!ok,
      error: error ? String(error).slice(0, 1000) : null,
      durationMs: typeof durationMs === 'number' ? durationMs : null,
    }
    state.audit.push(entry)
    if (state.audit.length > MAX_AUDIT) state.audit.splice(0, state.audit.length - MAX_AUDIT)
    saveState()
    return entry
  } catch (e) {
    return null
  }
}
function auditView(filter, limit) {
  const rows = state.audit.slice().reverse().filter((a) => {
    if (filter && filter.sessionId && a.sessionId !== filter.sessionId) return false
    if (filter && filter.container && a.container !== filter.container) return false
    if (filter && filter.operation && a.operation !== filter.operation) return false
    return true
  })
  return rows.slice(0, Math.max(1, Number(limit) || 100))
}

// ---------- Docker 清单 / 状态聚合 ----------
async function psAll() {
  const r = await dockerRun(['ps', '-a', '--no-trunc', '--format', '{{json .}}'], { timeoutMs: 60000 })
  if (r.exitCode !== 0) throw new Error('docker ps 失败: ' + capText(r.stderr || r.stdout, 300))
  return parseLines(r.stdout).map((o) => ({
    id: o.ID,
    name: psName(o),
    image: o.Image,
    command: o.Command,
    state: o.State,
    status: o.Status,
    ports: o.Ports,
    created: o.CreatedAt,
    size: o.Size,
    platform: o.Platform,
    networks: o.Networks,
  }))
}

async function ensureRecordFromInspect(name, ins) {
  const labels = parseLabels(ins && ins.Config && ins.Config.Labels)
  const owner = labels['dsh.session'] || null
  if (!owner) return
  if (recordOfContainer(name)) return
  const list = sessionContainers(owner)
  list.push({
    name,
    id: String(ins.Id || '').slice(0, 12),
    image: (ins.Config && ins.Config.Image) || '',
    createdAt: Number(labels['dsh.createdAt']) || Date.now(),
    lastUsedAt: Number(labels['dsh.createdAt']) || Date.now(),
    spec: {
      image: (ins.Config && ins.Config.Image) || '',
      env: (ins.Config && ins.Config.Env) || [],
      ports: [],
      volumes: (ins.HostConfig && ins.HostConfig.Binds) || [],
      network: ins.HostConfig ? (ins.HostConfig.NetworkMode || '') : '',
    },
    createdWith: { mode: 'docker_create', init: null, isolated: false, isolateNetwork: false },
  })
  state.containers[owner] = list
  saveState()
}

async function statusView(ctx, sessionId) {
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

  const psRows = await psAll()
  const names = psRows.map((c) => c.name).filter(Boolean)
  const [inspected, st, info] = await Promise.all([
    inspectAll(names),
    dockerRun(['stats', '--no-stream', '--format', '{{json .}}'], { timeoutMs: 60000 }),
    dockerRun(['info', '--format', 'json']),
  ])
  const byId = new Map()
  const byName = new Map()
  for (const ins of inspected) {
    byId.set(ins.Id || '', ins)
    byName.set((ins.Name || '').replace(/^\//, ''), ins)
    const c = psRows.find((x) => x.id === (ins.Id || '').slice(0, 12) || x.name === (ins.Name || '').replace(/^\//, ''))
    if (c) ensureRecordFromInspect(c.name, ins)
  }
  const statsByName = new Map()
  if (st.exitCode === 0) {
    for (const o of parseLines(st.stdout)) {
      if (o.Name) statsByName.set(o.Name, o)
      if (o.Container) statsByName.set(o.Container, o)
    }
  }
  let totalMem = 0
  let totalCpu = 0
  if (info.exitCode === 0) {
    try {
      const i = JSON.parse(info.stdout)
      totalMem = i.MemTotal || 0
      totalCpu = i.NCPU || 0
    } catch (e) { /* ignore */ }
  }
  const rows = []
  let running = 0
  for (const c of psRows) {
    if (c.state === 'running') running++
    const ins = byName.get(c.name) || byId.get(c.id)
    const labels = parseLabels(ins && ins.Config && ins.Config.Labels)
    const found = recordOfContainer(c.name)
    const owner = found ? found.sessionId : (labels['dsh.session'] || null)
    const s = statsByName.get(c.name) || statsByName.get(c.id)
    const net = containerNetworkInfo(ins)
    const memUsage = s ? String(s.MemUsage || '').split('/') : []
    rows.push({
      id: c.id,
      name: c.name,
      image: c.image,
      state: c.state,
      status: c.status,
      ports: c.ports,
      created: c.created,
      size: c.size,
      cpuPerc: s ? statNum(s.CPUPerc) : null,
      memPerc: s ? statNum(s.MemPerc) : null,
      memBytes: memUsage.length ? parseSize(memUsage[0]) : null,
      ip: net.primaryIp || null,
      network: net.primaryNetwork || null,
      owner: owner ? { sessionId: owner, title: await sessionTitleOf(ctx, owner) } : null,
      ownedByThis: !!sessionId && owner === sessionId,
      kind: found && found.type === 'snapshot' ? 'snapshot' : 'container',
      snapshot: null,
      sharedWith: sharesOf(c.name),
    })
  }
  const df = await dockerRun(['system', 'df', '--format', 'json'])
  let diskBytes = 0
  let imagesCount = 0
  if (df.exitCode === 0) {
    for (const line of df.stdout.split('\n')) {
      const t = line.trim()
      if (!t) continue
      try {
        const o = JSON.parse(t)
        diskBytes += parseSize(o.Size)
        if (o.Type === 'Images') imagesCount = Number(o.Count) || 0
      } catch (e) { /* ignore */ }
    }
  }
  if (!imagesCount) {
    const im = await dockerRun(['images', '-q'])
    if (im.exitCode === 0) imagesCount = im.stdout.trim().split('\n').filter(Boolean).length
  }
  let totalCpuPerc = 0
  let totalMemBytes = 0
  for (const c of rows) {
    totalCpuPerc += c.cpuPerc || 0
    totalMemBytes += c.memBytes || 0
  }
  const ownList = sessionContainers(sessionId).map((r) => ({ name: r.name, image: r.image }))
  return {
    ok: true,
    clientVersion,
    serverVersion,
    apiVersion,
    running,
    total: rows.length,
    images: imagesCount,
    diskBytes,
    totalCpu,
    totalMem,
    totalCpuPerc,
    totalMemBytes,
    containers: rows,
    own: ownList,
    snapshots: listSnapshots(sessionId),
    tunnels: tunnelView(),
    sessionId,
    cap: MAX_RUNNING,
    maxPerSession: MAX_PER_SESSION,
    maxSnapshots: MAX_SNAPSHOTS,
    maxSnapshotsPerSession: MAX_SNAPSHOTS_PER_SESSION,
  }
}

async function inspectView(ctx, name, sessionId) {
  const ins = await inspectContainer(name)
  if (!ins) return { ok: false, error: '未找到容器: ' + name }
  const labels = parseLabels(ins.Config && ins.Config.Labels)
  const found = recordOfContainer(name)
  const owner = found ? found.sessionId : (labels['dsh.session'] || null)
  const cfg = ins.Config || {}
  const host = ins.HostConfig || {}
  const ns = ins.NetworkSettings || {}
  const st = ins.State || {}
  const mounts = (ins.Mounts || []).map((m) => ({ type: m.Type, source: m.Source || null, dest: m.Destination, rw: !!m.RW }))
  let runtime = null
  if (st.Running) runtime = await probeRuntime(name).catch(() => null)
  const ownerInfo = owner ? { sessionId: owner, title: await sessionTitleOf(ctx, owner) } : null
  return {
    ok: true,
    data: {
      id: ins.Id,
      name: (ins.Name || '').replace(/^\//, ''),
      image: cfg.Image,
      created: ins.Created || '',
      state: pick(st, ['Status', 'Running', 'Paused', 'Restarting', 'ExitCode', 'Pid', 'StartedAt', 'FinishedAt']),
      cmd: cfg.Cmd || [],
      entrypoint: cfg.Entrypoint || [],
      workingDir: cfg.WorkingDir || '',
      user: cfg.User || '',
      envCount: (cfg.Env || []).length,
      env: cfg.Env || [],
      tty: !!cfg.Tty,
      restartPolicy: host.RestartPolicy ? host.RestartPolicy.Name : 'no',
      ports: ns.Ports || {},
      networks: Object.keys(ns.Networks || {}),
      ip: containerNetworkInfo(ins).primaryIp || null,
      mounts,
      labels,
      resources: {
        cpus: host.NanoCpus ? String(host.NanoCpus / 1e9) : null,
        memoryBytes: host.Memory || 0,
        memorySwapBytes: host.MemorySwap || 0,
        shmBytes: host.ShmSize || 0,
        pidsLimit: host.PidsLimit || null,
        diskQuota: host.StorageOpt && host.StorageOpt.size ? host.StorageOpt.size : null,
      },
      owner: ownerInfo,
      ownedByThis: !!sessionId && owner === sessionId,
      kind: found && found.type === 'snapshot' ? 'snapshot' : 'container',
      sharedWith: sharesOf(name),
      networkPolicy: networkPolicyOf(name),
      runtime,
      recentShell: (shellLogs.get(name) || []).slice(-10).reverse(),
      jobs: state.jobs.filter((j) => j.container === name || j.machine === name).reverse().slice(0, 20),
      tunnels: tunnelView().filter((t) => t.container === name),
    },
  }
}

async function probeRuntime(name) {
  const cmd = "echo uptime=$(uptime -p 2>/dev/null || true); echo load=$(cat /proc/loadavg 2>/dev/null || true); echo mem=$(free -b 2>/dev/null | awk 'NR==2{print $2, $3, $7}'); echo disk=$(df -B1 / 2>/dev/null | awk 'NR==2{print $2, $3, $4}')"
  const r = await dockerRun(['exec', name, 'sh', '-lc', cmd], { timeoutMs: 15000 })
  const out = {}
  for (const line of String(r.stdout || '').split('\n')) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const k = line.slice(0, idx).trim()
    const v = line.slice(idx + 1).trim()
    if (!v) continue
    if (k === 'uptime') out.uptime = v
    else if (k === 'load') out.load = v
    else if (k === 'mem') {
      const parts = v.split(/\s+/).map(Number)
      out.memory = { totalBytes: parts[0] || null, usedBytes: parts[1] || null, availableBytes: parts[2] || null }
    } else if (k === 'disk') {
      const parts = v.split(/\s+/).map(Number)
      out.rootFs = { totalBytes: parts[0] || null, usedBytes: parts[1] || null, availableBytes: parts[2] || null }
    }
  }
  if (r.exitCode !== 0) out.probeError = String(r.stderr || '')
  return out
}

async function logsView(name, tail) {
  const n = Math.min(Math.max(Number(tail) || 200, 1), 5000)
  const r = await dockerRun(['logs', '--tail', String(n), '--timestamps', String(name || '')])
  if (r.exitCode !== 0 && !r.stdout) return { ok: false, error: capText(r.stderr || r.stdout, 200) }
  return { ok: true, text: r.stdout + (r.stderr ? '[stderr]\n' + r.stderr : '') }
}

async function topView(name) {
  const r = await dockerRun(['top', String(name || '')])
  if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 200) }
  const lines = r.stdout.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { ok: true, titles: [], rows: [] }
  const head = lines[0].split(/\s+/)
  const titles = head.slice(0, 3).concat([head.slice(3).join(' ') || 'COMMAND'])
  const rows = lines.slice(1).map((l) => {
    const p = l.split(/\s+/)
    return [p[0] || '', p[1] || '', p[2] || '', p.slice(3).join(' ')]
  })
  return { ok: true, titles, rows }
}

// ---------- 只读实时日志观察 ----------
const watchers = new Map()
async function ensureWatcher(name) {
  const existing = watchers.get(name)
  if (existing) {
    existing.lastRead = Date.now()
    return existing
  }
  const st = await containerState(name)
  if (!st || !st.running) return { error: '容器未运行, 无法观察' }
  const proc = spawn(DOCKER, ['logs', '-f', '--tail', '200', '--timestamps', name], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const entry = {
    proc,
    mode: 'logs',
    outBuf: '',
    errBuf: '',
    lastRead: Date.now(),
    ended: false,
    endError: null,
  }
  proc.stdout.on('data', (d) => { entry.outBuf = (entry.outBuf + d.toString('utf8')).slice(-1024 * 1024) })
  proc.stderr.on('data', (d) => { entry.errBuf = (entry.errBuf + d.toString('utf8')).slice(-256 * 1024) })
  proc.on('close', (code) => {
    entry.ended = true
    if (code !== null && code !== 0) entry.endError = entry.errBuf || ('docker logs 进程退出, code=' + code)
  })
  proc.on('error', (err) => {
    entry.ended = true
    entry.endError = fmtError(err)
  })
  watchers.set(name, entry)
  return entry
}
function watchReadView(name, so, se) {
  return ensureWatcher(String(name || '')).then((entry) => {
    if (entry.error) return { ok: false, error: entry.error }
    entry.lastRead = Date.now()
    let delta = ''
    const soN = Number(so) || 0
    const seN = Number(se) || 0
    if (entry.outBuf.length > soN) delta += entry.outBuf.slice(soN)
    if (entry.errBuf.length > seN) delta += entry.errBuf.slice(seN)
    return { ok: true, delta, stdoutOffset: entry.outBuf.length, stderrOffset: entry.errBuf.length, mode: entry.mode, ended: entry.ended, endError: entry.endError }
  })
}
function watchStopView(name) {
  const entry = watchers.get(String(name || ''))
  if (entry) {
    try { entry.proc.kill() } catch (e) { /* ignore */ }
    watchers.delete(String(name || ''))
  }
  return Promise.resolve({ ok: true })
}

async function opView(ctx, sessionId, name, action, opts) {
  const c = String(name || '')
  if (!c) return { ok: false, error: '缺少容器名' }
  if (!canManage(sessionId, c)) return { ok: false, error: '没有权限管理该容器(' + c + ')' }
  let argv = null
  if (action === 'rm' && !canOwner(sessionId, c)) return { ok: false, error: '该容器属于其他会话,不能删除' }
  if (action === 'start') argv = ['start', c]
  else if (action === 'stop') argv = ['stop', c]
  else if (action === 'restart') argv = ['restart', c]
  else if (action === 'pause') argv = ['pause', c]
  else if (action === 'unpause') argv = ['unpause', c]
  else if (action === 'rm') argv = ['rm', '-f', c]
  else return { ok: false, error: '未知操作: ' + String(action) }
  const r = await dockerRun(argv, opts)
  if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 200) }
  if (action === 'rm') {
    shellLogs.delete(c)
    stopContainerTunnels(c)
    invalidateContainerJobs(c)
    removeContainerRecord(c)
  }
  if (action === 'start') await ensureNetworkApplied(c)
  return { ok: true, action, container: c, result: r.stdout.trim() || '成功' }
}

function removeContainerRecord(name) {
  let changed = false
  for (const sid of Object.keys(state.containers)) {
    const list = state.containers[sid]
    if (!Array.isArray(list)) continue
    const next = list.filter((r) => r.name !== name && r.id !== name)
    if (next.length === list.length) continue
    changed = true
    if (next.length === 0) delete state.containers[sid]
    else state.containers[sid] = next
  }
  if (changed) saveState()
}
async function removeContainerByName(ctx, name) {
  let ok = false
  try {
    const r = await dockerRun(['rm', '-f', String(name || '')], { timeoutMs: 180000 })
    ok = r.exitCode === 0 || /No such container/i.test(r.stderr)
  } catch (e) { /* ignore */ }
  shellLogs.delete(name)
  stopContainerTunnels(name)
  invalidateContainerJobs(name)
  removeContainerRecord(name)
  return ok
}
async function removeSessionContainers(sessionId) {
  const list = sessionContainers(sessionId)
  if (list.length === 0) return false
  for (const rec of list) {
    try { await removeContainerByName(null, rec.name) } catch (e) { /* ignore */ }
  }
  delete state.containers[sessionId]
  saveState()
  return true
}

// ---------- 创建容器 ----------
function strList(v) {
  if (Array.isArray(v)) return v.map(String).filter((s) => s.length > 0)
  if (v && typeof v === 'object') return Object.entries(v).map(([k, val]) => k + '=' + val)
  return []
}
function buildRunArgs(o) {
  const argv = [o.createOnly ? 'create' : 'run']
  if (!o.createOnly && o.detach !== false) argv.push('-d')
  if (o.rm) argv.push('--rm')
  if (o.tty) argv.push('-t')
  if (o.interactive) argv.push('-i')
  if (o.name) argv.push('--name', o.name)
  for (const p of strList(o.ports)) argv.push('-p', p)
  for (const v of strList(o.volumes)) argv.push('-v', v)
  for (const e of strList(o.env)) argv.push('-e', e)
  for (const l of strList(o.labels)) argv.push('--label', l)
  if (o.workdir) argv.push('-w', o.workdir)
  if (o.user) argv.push('-u', o.user)
  if (o.entrypoint) argv.push('--entrypoint', o.entrypoint)
  if (o.restart) argv.push('--restart', o.restart)
  if (o.cpus != null && String(o.cpus).trim() !== '') argv.push('--cpus', String(o.cpus))
  if (o.memory != null && String(o.memory).trim() !== '') argv.push('--memory', String(o.memory))
  if (o.memorySwap != null && String(o.memorySwap).trim() !== '') argv.push('--memory-swap', String(o.memorySwap))
  if (o.shmSize != null && String(o.shmSize).trim() !== '') argv.push('--shm-size', String(o.shmSize))
  if (o.pidsLimit != null) argv.push('--pids-limit', String(o.pidsLimit))
  if (o.diskQuota != null && String(o.diskQuota).trim() !== '') argv.push('--storage-opt', 'size=' + String(o.diskQuota))
  if (o.readOnly) argv.push('--read-only')
  for (const t of strList(o.tmpfs)) argv.push('--tmpfs', t)
  if (o.isolated) argv.push('--network', 'none')
  else if (o.isolateNetwork || o.network === INTERNAL_NETWORK) argv.push('--network', INTERNAL_NETWORK)
  else if (o.network) argv.push('--network', o.network)
  else argv.push('--network', PUBLIC_NETWORK)
  argv.push(o.image)
  if (o.command) argv.push('sh', '-lc', String(o.command))
  else if (o.initScript) argv.push('sh', '-lc', String(o.initScript))
  return argv
}

async function ensureNetworkExists(name, internal) {
  const ins = await dockerRun(['network', 'inspect', name])
  if (ins.exitCode === 0) return
  const argv = ['network', 'create']
  if (internal) argv.push('--internal')
  argv.push('--label', 'dsh.plugin=container', '--label', 'dsh.network=' + name, name)
  const r = await dockerRun(argv)
  if (r.exitCode !== 0) throw new Error('创建网络 ' + name + ' 失败: ' + capText(r.stderr || r.stdout, 300))
}

async function createContainerRaw(ctx, sessionId, opts, signal) {
  opts = opts || {}
  const policy = sessionPolicy(sessionId)
  if (sessionContainers(sessionId).length >= policy.maxContainers) {
    throw new Error('本会话容器已达上限(' + policy.maxContainers + ' 个),请先删除不再使用的容器或调整 docker_policy')
  }
  const image = String(opts.image || '').trim()
  if (!image) throw new Error('image 不能为空')
  const name = opts.name || await uniqueContainerName(ctx, sessionId, opts.nameHint || '')
  if (opts.isolateNetwork) opts.isolated = true
  if (!opts.isolated) await ensureNetworkExists(opts.network === INTERNAL_NETWORK ? INTERNAL_NETWORK : (opts.network || PUBLIC_NETWORK), opts.network === INTERNAL_NETWORK || !!opts.isolateNetwork)
  if (opts.isolateNetwork) await ensureNetworkExists(INTERNAL_NETWORK, true)
  const labels = [
    'dsh.plugin=container',
    'dsh.session=' + sessionId,
    'dsh.createdAt=' + Date.now(),
    'dsh.creator=' + (opts.mode || 'docker_create'),
  ]
  const args = buildRunArgs(Object.assign({}, opts, { name, labels: labels.concat(strList(opts.labels)) }))
  const key = 'create:' + name
  if (inFlight.has(key)) return inFlight.get(key)
  const task = (async () => {
    const r = await dockerRun(args, { timeoutMs: 900000, signal })
    if (r.exitCode !== 0) {
      throw new Error('docker run 失败: ' + capText(r.stderr || r.stdout, 800))
    }
    const id = r.stdout.trim().split('\n').pop() || ''
    const list = sessionContainers(sessionId)
    list.push({
      name,
      id: id ? id.slice(0, 12) : '',
      image,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      spec: {
        image,
        command: opts.command || opts.initScript || null,
        env: strList(opts.env),
        ports: strList(opts.ports),
        volumes: strList(opts.volumes),
        network: opts.isolated ? 'none' : (opts.isolateNetwork ? INTERNAL_NETWORK : (opts.network || PUBLIC_NETWORK)),
        restart: opts.restart || null,
        workdir: opts.workdir || null,
        user: opts.user || null,
        entrypoint: opts.entrypoint || null,
        cpus: opts.cpus != null ? String(opts.cpus) : null,
        memory: opts.memory != null ? String(opts.memory) : null,
        memorySwap: opts.memorySwap != null ? String(opts.memorySwap) : null,
        shmSize: opts.shmSize != null ? String(opts.shmSize) : null,
        pidsLimit: opts.pidsLimit != null ? String(opts.pidsLimit) : null,
        diskQuota: opts.diskQuota != null ? String(opts.diskQuota) : null,
        tty: !!opts.tty,
        rm: !!opts.rm,
        readOnly: !!opts.readOnly,
      },
      createdWith: {
        mode: opts.mode || 'docker_create',
        init: opts.initScript ? 'init_script' : (opts.command ? 'command' : null),
        isolated: !!opts.isolated,
        isolateNetwork: !!opts.isolateNetwork,
      },
    })
    state.containers[sessionId] = list
    saveState()
    await enforceRunningCap(name)
    await ensureNetworkApplied(name)
    return { ok: true, container: name, id, image, state: 'running', existing: false }
  })()
  inFlight.set(key, task)
  try {
    return await task
  } finally {
    inFlight.delete(key)
  }
}

async function resolveExistingContainer(ctx, sessionId, name) {
  const rec = recordOfContainer(name)
  if (!rec && name) {
    const ins = await inspectContainer(name)
    if (ins) return { name, image: (ins.Config && ins.Config.Image) || '', state: ins.State ? ins.State.Status : 'unknown', sessionId: null, existing: true, crossSession: false, type: 'container' }
  }
  if (!rec) throw new Error('未找到容器: ' + name)
  touchContainer(rec.sessionId, name)
  const st = await containerState(name)
  return { name, image: rec.record.image, state: st ? st.status : 'unknown', sessionId: rec.sessionId, existing: true, crossSession: rec.sessionId !== sessionId, type: rec.type || 'container' }
}
async function resolveDefaultContainer(ctx, sessionId) {
  const def = defaultSessionContainer(sessionId)
  if (!def) throw new Error('本会话没有容器，请先 docker_create 或通过 docker_run 创建')
  return resolveExistingContainer(ctx, sessionId, def.name)
}
async function resolveContainer(ctx, sessionId, name, opts, signal) {
  if (name) {
    const found = recordOfContainer(name)
    if (found) return resolveExistingContainer(ctx, sessionId, name)
    const ins = await inspectContainer(name)
    if (ins) return resolveExistingContainer(ctx, sessionId, name)
    if (opts && opts.image) return createContainerRaw(ctx, sessionId, Object.assign({}, opts, { name, nameHint: name }), signal)
    throw new Error('未找到容器: ' + name)
  }
  return resolveDefaultContainer(ctx, sessionId)
}

// ---------- 资源治理: 运行上限 + 闲置自动停止/回收 + 孤儿清理 ----------
async function enforceRunningCap(excludeName) {
  let rows = []
  try {
    rows = await psAll()
  } catch (err) {
    return
  }
  const running = rows.filter((c) => c.state === 'running')
  if (running.length <= MAX_RUNNING) return
  const now = Date.now()
  const ranked = running.map((c) => {
    const found = recordOfContainer(c.name)
    const rec = found ? found.record : null
    return {
      name: c.name,
      managed: !!rec,
      createdAt: rec ? (rec.createdAt || 0) : Number.MAX_SAFE_INTEGER,
      lastUsed: rec ? (rec.lastUsedAt || rec.createdAt || 0) : 0,
    }
  }).sort((a, b) => a.createdAt - b.createdAt)
  const toStop = []
  for (const item of ranked) {
    if (running.length - toStop.length <= MAX_RUNNING) break
    if (item.name === excludeName) continue
    if (!item.managed) continue
    if (item.lastUsed && now - item.lastUsed < ACTIVE_WINDOW_MS) continue
    toStop.push(item.name)
  }
  for (const name of toStop) {
    try {
      await dockerRun(['stop', name], { timeoutMs: 120000 })
    } catch (err) { /* ignore */ }
  }
}

async function idleSweep(ctx) {
  if (sweeping) return
  sweeping = true
  try {
    let rows = []
    try {
      rows = await psAll()
    } catch (err) {
      return
    }
    const live = new Set(rows.map((r) => r.name))
    let changed = false
    for (const sid of Object.keys(state.containers)) {
      const list = state.containers[sid]
      if (!Array.isArray(list)) continue
      const next = list.filter((r) => live.has(r.name))
      if (next.length !== list.length) {
        changed = true
        if (next.length === 0) delete state.containers[sid]
        else state.containers[sid] = next
      }
    }
    if (changed) saveState()
    const now = Date.now()
    const wr = ctx.get('workspaceRegistry')
    const archived = wr && Array.isArray(wr.archivedSessionIds) ? new Set(wr.archivedSessionIds) : new Set()
    for (const c of rows) {
      if (c.state !== 'running') continue
      const found = recordOfContainer(c.name)
      if (!found) continue
      const rec = found.record
      const lastUsed = rec.lastUsedAt || rec.createdAt || 0
      const idleMs = Math.max(0, now - lastUsed)
      const policy = sessionPolicy(found.sessionId)
      const sleepMs = (policy.idleSleepMinutes || 0) * 60 * 1000
      const deleteMs = (policy.idleDeleteDays || 0) * 24 * 60 * 60 * 1000
      if (deleteMs > 0 && idleMs >= deleteMs) {
        await removeContainerByName(ctx, c.name)
      } else if (sleepMs > 0 && idleMs >= sleepMs) {
        await dockerRun(['stop', c.name], { timeoutMs: 120000 })
      }
    }
    for (const sid of Object.keys(state.containers)) {
      if (archived.has(sid)) continue
      if (wr && typeof wr.sessionKnown === 'function') {
        const known = await wr.sessionKnown(sid).catch(() => true)
        if (!known) await removeSessionContainers(sid)
      }
    }
  } finally {
    sweeping = false
  }
}

function loadArchived(ctx) {
  const wr = ctx.get('workspaceRegistry')
  if (wr && Array.isArray(wr.archivedSessionIds)) knownArchived = new Set(wr.archivedSessionIds)
}
async function reconcile(ctx) {
  loadArchived(ctx)
  for (const id of Array.from(knownArchived)) await removeSessionContainers(id)
  try {
    const rows = await psAll()
    const names = new Set(rows.map((r) => r.name))
    for (const key of Array.from(shellLogs.keys())) if (!names.has(key)) shellLogs.delete(key)
    let changed = false
    for (const sid of Object.keys(state.containers)) {
      const list = state.containers[sid]
      if (!Array.isArray(list)) continue
      const next = list.filter((r) => names.has(r.name))
      if (next.length === list.length) continue
      changed = true
      if (next.length === 0) delete state.containers[sid]
      else state.containers[sid] = next
    }
    if (changed) saveState()
    reconcileSnapshots()
    reconcileTunnels()
    reconcileJobs()
  } catch (err) { /* docker 不可用时忽略 */ }
}
async function handleDisposed(ctx, sessionId) {
  if (!state.containers[sessionId]) return
  const wr = ctx.get('workspaceRegistry')
  if (wr && typeof wr.sessionKnown === 'function') {
    const known = await wr.sessionKnown(sessionId).catch(() => true)
    if (known) return
  }
  await removeSessionContainers(sessionId)
}

// ---------- 快照与回滚 (docker commit / docker run) ----------
function snapshotRecord(name) {
  return state.snapshots[name] || null
}
function countSessionSnapshots(sessionId) {
  return Object.values(state.snapshots).filter((s) => s.sessionId === sessionId).length
}
function listSnapshots(sessionId) {
  const all = Object.values(state.snapshots).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return all.map((s) => ({ ...s, ownedByThis: !sessionId || s.sessionId === sessionId }))
}
function reconcileSnapshots() {
  // 检查快照镜像是否仍然存在(限流: 每 5 分钟一次)
  const now = Date.now()
  if (state._snapshotReconcileAt && now - state._snapshotReconcileAt <= 300000) return
  state._snapshotReconcileAt = now
  Promise.all(Object.keys(state.snapshots).map(async (key) => {
    const s = state.snapshots[key]
    if (!s || !s.image) return key
    const r = await dockerRun(['image', 'inspect', s.image])
    return r.exitCode === 0 ? null : key
  })).then((missing) => {
    const gone = missing.filter(Boolean)
    if (!gone.length) return
    for (const key of gone) delete state.snapshots[key]
    saveState()
  }).catch(() => {})
}
async function snapshotSourceSpec(name) {
  const rec = recordOfContainer(name)
  if (rec && rec.type === 'container' && rec.record.spec) return rec.record.spec
  const ins = await inspectContainer(name)
  if (!ins) return null
  const cfg = ins.Config || {}
  const host = ins.HostConfig || {}
  const ports = []
  for (const [containerPort, binds] of Object.entries(host.PortBindings || {})) {
    if (!binds || binds.length === 0) continue
    for (const b of binds) {
      const ip = b.HostIp && b.HostIp !== '0.0.0.0' ? b.HostIp + ':' : ''
      ports.push(ip + (b.HostPort || '') + ':' + containerPort)
    }
  }
  return {
    image: cfg.Image,
    command: (cfg.Cmd || []).join(' '),
    env: cfg.Env || [],
    ports,
    volumes: host.Binds || [],
    network: host.NetworkMode || 'bridge',
    restart: host.RestartPolicy ? host.RestartPolicy.Name : null,
    workdir: cfg.WorkingDir || null,
    user: cfg.User || null,
    entrypoint: (cfg.Entrypoint || []).join(' '),
    cpus: host.NanoCpus ? String(host.NanoCpus / 1e9) : null,
    memory: host.Memory ? String(host.Memory) : null,
    memorySwap: host.MemorySwap ? String(host.MemorySwap) : null,
    shmSize: host.ShmSize ? String(host.ShmSize) : null,
    pidsLimit: host.PidsLimit != null ? String(host.PidsLimit) : null,
    diskQuota: host.StorageOpt && host.StorageOpt.size ? host.StorageOpt.size : null,
    tty: !!cfg.Tty,
    rm: false,
    readOnly: !!host.ReadonlyRootfs,
  }
}
async function createSnapshot(ctx, sessionId, name, note) {
  const target = await resolveExistingContainer(ctx, sessionId, name)
  if (target.type === 'snapshot') throw new Error('不能对快照再创建快照')
  assertManage(sessionId, name)
  if (countSessionSnapshots(sessionId) >= MAX_SNAPSHOTS_PER_SESSION) {
    throw new Error('本会话快照数量已达上限(' + MAX_SNAPSHOTS_PER_SESSION + ' 个),请先删除旧快照')
  }
  if (Object.keys(state.snapshots).length >= MAX_SNAPSHOTS) {
    throw new Error('全局快照数量已达上限(' + MAX_SNAPSHOTS + ' 个)')
  }
  const st = await containerState(name)
  const wasRunning = !!(st && st.running)
  const snapName = await uniqueSnapshotName()
  const labelNote = String(note || '').replace(/["\\\r\n]+/g, ' ').slice(0, 200)
  const r = await dockerRun([
    'commit',
    '--change', 'LABEL dsh.plugin=container',
    '--change', 'LABEL dsh.snapshot=1',
    '--change', 'LABEL dsh.snapshot.source=' + name,
    '--change', 'LABEL dsh.session=' + sessionId,
    '--change', 'LABEL dsh.note="' + labelNote + '"',
    name,
    snapName + ':latest',
  ], { timeoutMs: 900000 })
  if (r.exitCode !== 0) {
    throw new Error('docker commit 快照失败: ' + capText(r.stderr || r.stdout, 500))
  }
  const spec = await snapshotSourceSpec(name).catch(() => null)
  const rec = state.snapshots[snapName] = {
    name: snapName,
    image: snapName + ':latest',
    source: name,
    sessionId,
    createdAt: Date.now(),
    wasRunning,
    note: String(note || '').slice(0, 500),
    spec,
  }
  saveState()
  return { ok: true, snapshot: rec, state: wasRunning ? 'running' : 'stopped', note: '快照为 docker commit 镜像,可随时 docker_restore 回滚' }
}
async function restoreSnapshot(ctx, sessionId, snapshotName) {
  const snap = snapshotRecord(snapshotName)
  if (!snap) throw new Error('未找到快照: ' + snapshotName)
  if (!canManage(sessionId, snap.source)) {
    if (!canManage(sessionId, snapshotName)) throw new Error('没有权限恢复该快照')
  }
  const img = snap.image || snapshotName + ':latest'
  const imgIns = await dockerRun(['image', 'inspect', img])
  if (imgIns.exitCode !== 0) throw new Error('快照镜像不存在: ' + img)
  const st = await containerState(snap.source).catch(() => null)
  const wasRunning = snap.wasRunning !== false && (!st || st.running)
  if (st) {
    stopContainerTunnels(snap.source)
    invalidateContainerJobs(snap.source)
    await dockerOk(['rm', '-f', snap.source], { timeoutMs: 180000 }, '恢复前删除当前容器')
    shellLogs.delete(snap.source)
    removeContainerRecord(snap.source)
  }
  const spec = snap.spec || await snapshotSourceSpec(snap.source).catch(() => null) || {}
  const runSpec = Object.assign({}, spec, {
    image: img,
    name: snap.source,
    command: spec.command || null,
    detach: true,
    createOnly: !wasRunning,
    network: spec.isolated ? 'none' : (spec.isolateNetwork ? INTERNAL_NETWORK : (spec.network === 'none' ? 'none' : (spec.network === 'bridge' || !spec.network ? PUBLIC_NETWORK : spec.network))),
  })
  const r = await dockerRun(buildRunArgs(runSpec), { timeoutMs: 900000 })
  if (r.exitCode !== 0) throw new Error('从快照恢复容器失败: ' + capText(r.stderr || r.stdout, 800))
  const id = r.stdout.trim().split('\n').pop() || ''
  if (wasRunning) {
    await dockerOk(['start', snap.source], { timeoutMs: 300000 }, '恢复后启动容器')
    await ensureNetworkApplied(snap.source)
  }
  const list = sessionContainers(snap.sessionId)
  if (!list.find((x) => x.name === snap.source)) {
    list.push({
      name: snap.source,
      id: id ? id.slice(0, 12) : '',
      image: img,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      spec: Object.assign({}, spec, { image: img }),
      createdWith: { mode: 'docker_restore', init: null, isolated: false, isolateNetwork: false },
    })
    state.containers[snap.sessionId] = list
    saveState()
  }
  return { ok: true, container: snap.source, snapshot: snapshotName, state: wasRunning ? 'running' : 'created' }
}
async function deleteSnapshot(ctx, sessionId, snapshotName) {
  const snap = snapshotRecord(snapshotName)
  if (!snap) throw new Error('未找到快照: ' + snapshotName)
  if (!canOwner(sessionId, snapshotName)) throw new Error('只有快照归属会话可以删除')
  const r = await dockerRun(['rmi', '-f', snap.image || (snapshotName + ':latest')], { timeoutMs: 180000 })
  if (r.exitCode !== 0 && !/No such image/i.test(r.stderr)) {
    throw new Error('删除快照镜像失败: ' + capText(r.stderr || r.stdout, 300))
  }
  delete state.snapshots[snapshotName]
  saveState()
  return { ok: true, snapshot: snapshotName }
}

// ---------- 文件传输 (docker cp) ----------
function workspaceRootOf(ctx) {
  try {
    const sp = ctx.get('sandboxPolicy')
    if (sp && sp.workspaceRoot) return sp.workspaceRoot
  } catch (e) { /* ignore */ }
  return process.cwd()
}
function resolveLocalPath(ctx, p) {
  const root = workspaceRootOf(ctx)
  const full = resolve(root, String(p || '').replace(/^~/, HOME))
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error('本地路径必须位于工作区内: ' + root)
  }
  return full
}
async function uploadToContainer(ctx, sessionId, name, localPath, remotePath) {
  const target = name ? await resolveExistingContainer(ctx, sessionId, name) : await resolveDefaultContainer(ctx, sessionId)
  assertExec(sessionId, target.name)
  const local = resolveLocalPath(ctx, localPath)
  if (!existsSync(local)) throw new Error('本地文件不存在: ' + local)
  const remote = String(remotePath || '').trim()
  if (!remote) throw new Error('remote_path 不能为空')
  const r = await dockerRun(['cp', local, target.name + ':' + remote.replace(/^\/?/, '/')], { timeoutMs: 600000 })
  if (r.exitCode !== 0) throw new Error('docker cp 上传失败: ' + capText(r.stderr || r.stdout, 500))
  return { ok: true, container: target.name, localPath: local, remotePath: remote, operation: 'upload' }
}
async function downloadFromContainer(ctx, sessionId, name, remotePath, localPath) {
  const target = name ? await resolveExistingContainer(ctx, sessionId, name) : await resolveDefaultContainer(ctx, sessionId)
  assertExec(sessionId, target.name)
  const local = resolveLocalPath(ctx, localPath)
  const remote = String(remotePath || '').trim()
  if (!remote) throw new Error('remote_path 不能为空')
  const r = await dockerRun(['cp', target.name + ':' + remote, local], { timeoutMs: 600000 })
  if (r.exitCode !== 0) throw new Error('docker cp 下载失败: ' + capText(r.stderr || r.stdout, 500))
  return { ok: true, container: target.name, remotePath: remote, localPath: local, operation: 'download' }
}

// ---------- 后台任务管理 ----------
function jobById(id) {
  return state.jobs.find((j) => j.id === id) || null
}
function sessionJobs(sessionId) {
  return state.jobs.filter((j) => j.sessionId === sessionId)
}
function invalidateContainerJobs(container) {
  const now = Date.now()
  let changed = false
  for (const j of state.jobs) {
    if ((j.container === container || j.machine === container) && j.status !== 'done' && j.status !== 'error' && j.status !== 'stopped') {
      j.status = 'error'
      j.endTime = now
      j.error = '容器已删除或恢复，任务被终止'
      changed = true
    }
  }
  if (changed) saveState()
}
function reconcileJobs() {
  let changed = false
  for (const j of state.jobs) {
    if (j.status === 'done' || j.status === 'error' || j.status === 'stopped') continue
    if (!j.container && !j.machine) { j.status = 'error'; j.error = '任务容器不存在'; j.endTime = Date.now(); changed = true }
  }
  if (changed) saveState()
}
async function submitJob(ctx, sessionId, name, command) {
  const target = name ? await resolveExistingContainer(ctx, sessionId, name) : await resolveDefaultContainer(ctx, sessionId)
  assertExec(sessionId, target.name)
  await ensureRunning(target.name)
  if (sessionJobs(sessionId).filter((j) => j.status === 'running').length >= MAX_JOBS_PER_SESSION) {
    throw new Error('本会话后台任务数量已达上限(' + MAX_JOBS_PER_SESSION + ')')
  }
  const id = genId('job')
  const dir = '/tmp/.dsh-jobs/' + id
  const commandB64 = Buffer.from(command, 'utf8').toString('base64')
  const runScript = [
    '#!/bin/sh',
    'cd ' + dir + ' || exit 125',
    'sh ./cmd.sh',
    'code=$?',
    "printf '%s\\n' \"$code\" > ./status",
    "date +%s%3N > ./end",
  ].join('\n')
  const runB64 = Buffer.from(runScript, 'utf8').toString('base64')
  const setup = [
    'set -e',
    'mkdir -p ' + dir,
    "printf '%s' '" + commandB64 + "' | base64 -d > " + dir + '/cmd.sh',
    "printf '%s' '" + runB64 + "' | base64 -d > " + dir + '/run.sh',
    'chmod +x ' + dir + '/run.sh ' + dir + '/cmd.sh',
    'rm -f ' + dir + '/status ' + dir + '/end',
    'nohup sh ' + dir + '/run.sh > ' + dir + '/out.log 2>&1 & echo $!',
  ].join('; ')
  const r = await dockerRun(['exec', target.name, 'sh', '-lc', setup], { timeoutMs: 30000 })
  if (r.exitCode !== 0) throw new Error('提交后台任务失败: ' + capText(r.stderr || r.stdout, 500))
  const pid = String(r.stdout || '').trim().split('\n').pop()
  const job = {
    id,
    container: target.name,
    machine: target.name,
    sessionId,
    command,
    pid: pid ? Number(pid) : null,
    dir,
    startTime: Date.now(),
    endTime: null,
    status: 'running',
    exitCode: null,
    error: null,
  }
  state.jobs.push(job)
  saveState()
  const status = await readJobStatus(job)
  return { ok: true, job: { ...job, ...status } }
}
async function readJobStatus(job) {
  const container = job.container || job.machine
  const probe = [
    'D=' + job.dir + '; P=' + (job.pid || 0) + '; [ "$P" -gt 0 ] 2>/dev/null || P=0',
    'if [ -f "$D/status" ]; then echo "state=done"; echo "exit=$(cat "$D/status")"; echo "end=$(cat "$D/end" 2>/dev/null || true)"; else if [ "$P" -gt 0 ] 2>/dev/null && kill -0 "$P" 2>/dev/null; then echo "state=running"; else echo "state=dead"; fi; fi',
    'echo "tail="',
    'tail -c 8192 "$D/out.log" 2>/dev/null || true',
  ].join('; ')
  const r = await dockerRun(['exec', container, 'sh', '-lc', probe], { timeoutMs: 30000 })
  const text = String(r.stdout || '')
  let stateText = 'unknown'
  let exitCode = null
  let endTime = null
  let tail = ''
  for (const line of text.split('\n')) {
    if (line.startsWith('state=')) stateText = line.slice(6).trim()
    else if (line.startsWith('exit=')) exitCode = Number(line.slice(5).trim())
    else if (line.startsWith('end=')) endTime = Number(line.slice(4).trim()) || null
  }
  const idx = text.indexOf('tail=')
  if (idx >= 0) tail = text.slice(idx + 5).trim()
  if (stateText === 'done' && job.status === 'running') {
    job.status = 'done'
    job.exitCode = exitCode
    job.endTime = endTime || Date.now()
    saveState()
  } else if (stateText === 'dead' && job.status === 'running') {
    job.status = 'error'
    job.error = '进程不存在或已退出'
    job.endTime = Date.now()
    saveState()
  }
  return { status: stateText, exitCode: exitCode === null && job.status === 'done' ? job.exitCode : exitCode, endTime, tail, stdout: tail, stderr: '' }
}
async function stopJob(ctx, sessionId, jobId) {
  const job = jobById(jobId)
  if (!job) throw new Error('未找到后台任务: ' + jobId)
  if (job.sessionId !== sessionId && !canManage(sessionId, job.container || job.machine)) throw new Error('没有权限停止该任务')
  if (job.status !== 'running') return { ok: true, job: { ...job }, alreadyFinished: true }
  const container = job.container || job.machine
  const killCmd = 'D=' + job.dir + '; P=' + job.pid + '; [ "$P" -gt 0 ] 2>/dev/null || P=0; kill -TERM "$P" 2>/dev/null || true; for i in 1 2 3 4 5; do [ "$P" -gt 0 ] 2>/dev/null && kill -0 "$P" 2>/dev/null || exit 0; sleep 1; done; kill -KILL "$P" 2>/dev/null || true'
  const r = await dockerRun(['exec', container, 'sh', '-lc', killCmd], { timeoutMs: 30000 })
  if (r.exitCode !== 0 && !String(r.stderr || '').includes('No such process')) {
    throw new Error('停止任务失败: ' + capText(r.stderr || r.stdout, 300))
  }
  job.status = 'stopped'
  job.endTime = Date.now()
  saveState()
  return { ok: true, job: { ...job } }
}
async function jobFullOutput(jobId, maxBytes) {
  const job = jobById(jobId)
  if (!job) throw new Error('未找到后台任务: ' + jobId)
  const limit = Math.max(1024, Number(maxBytes) || 1024 * 1024)
  const container = job.container || job.machine
  const r = await dockerRun(['exec', container, 'sh', '-lc', 'tail -c ' + limit + ' ' + job.dir + '/out.log 2>/dev/null || true'], { timeoutMs: 30000 })
  return { ok: true, id: job.id, container, command: job.command, log: String(r.stdout || '') }
}

// ---------- 端口转发 (alpine/socat 代理容器) ----------
function isPortFree(port) {
  return new Promise((resolvePromise) => {
    const srv = createServer()
    srv.once('error', () => resolvePromise(false))
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolvePromise(true)))
  })
}
function findFreePort() {
  return new Promise((resolvePromise) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolvePromise(port))
    })
    srv.once('error', () => resolvePromise(0))
  })
}
async function startPortForward(ctx, sessionId, name, containerPort, hostPort, bindHost) {
  const target = name ? await resolveExistingContainer(ctx, sessionId, name) : await resolveDefaultContainer(ctx, sessionId)
  assertExec(sessionId, target.name)
  await ensureRunning(target.name)
  const cp = Number(containerPort)
  if (!Number.isInteger(cp) || cp < 1 || cp > 65535) throw new Error('container_port 必须是 1-65535 的整数')
  const bh = String(bindHost || '127.0.0.1').trim()
  if (bh !== 'localhost' && bh !== '127.0.0.1' && bh !== '::1') throw new Error('bind_host 仅支持 localhost / 127.0.0.1 / ::1')
  if (state.tunnels.filter((t) => t.container === target.name && t.status === 'running').length >= MAX_TUNNELS) {
    throw new Error('该容器端口转发数量已达上限(' + MAX_TUNNELS + ')')
  }
  const ins = await inspectContainer(target.name)
  const net = containerNetworkInfo(ins)
  if (!net.primaryIp) throw new Error('容器没有可路由的 IP(host/none 网络不支持端口转发),请先连接到 bridge 网络')
  if (net.primaryNetwork === 'host' || net.primaryNetwork === 'none') {
    throw new Error('host/none 网络模式不支持代理端口转发')
  }
  let hp = Number(hostPort)
  if (!hp) {
    hp = await findFreePort()
    if (!hp) throw new Error('找不到可用的本地端口')
  }
  if (!Number.isInteger(hp) || hp < 1 || hp > 65535) throw new Error('host_port 必须是 1-65535 的整数')
  if (!(await isPortFree(hp))) throw new Error('本地端口已被占用: ' + hp)
  await ensureImage(SOCAT_IMAGE)
  const id = genId('pf')
  const pfName = PF_PREFIX + id
  const bindSpec = bh === '::1' ? '[' + bh + ']' : bh
  const r = await dockerRun([
    'run', '-d', '--rm', '--name', pfName,
    '--label', 'dsh.plugin=container', '--label', 'dsh.tunnel=1', '--label', 'dsh.target=' + target.name,
    '--network', net.primaryNetwork,
    '-p', bindSpec + ':' + hp + ':' + hp,
    SOCAT_IMAGE,
    'tcp-listen:' + hp + ',fork,reuseaddr',
    'tcp-connect:' + net.primaryIp + ':' + cp,
  ], { timeoutMs: 180000 })
  if (r.exitCode !== 0) throw new Error('创建端口转发代理失败: ' + capText(r.stderr || r.stdout, 500))
  const tunnel = { id, container: target.name, machine: target.name, containerPort: cp, hostPort: hp, bindHost: bh, proxy: pfName, sessionId, createdAt: Date.now(), status: 'running' }
  state.tunnels.push(tunnel)
  saveState()
  return { ok: true, tunnel }
}
function stopTunnelByIdOrPort(idOrPort) {
  const tunnels = state.tunnels.filter((t) => t.id === idOrPort || String(t.hostPort) === String(idOrPort) || t.proxy === idOrPort)
  if (tunnels.length === 0) return { ok: false, reason: '未找到对应转发' }
  for (const t of tunnels) {
    try {
      if (t.proxy) dockerRun(['rm', '-f', t.proxy], { timeoutMs: 60000 }).catch(() => {})
      t.status = 'stopped'
      t.stoppedAt = Date.now()
    } catch (e) { /* ignore */ }
  }
  saveState()
  return { ok: true, stopped: tunnels.map((t) => t.id) }
}
function stopContainerTunnels(container) {
  let changed = false
  for (const t of state.tunnels) {
    if (t.container !== container || t.status !== 'running') continue
    try {
      if (t.proxy) dockerRun(['rm', '-f', t.proxy], { timeoutMs: 60000 }).catch(() => {})
      t.status = 'stopped'
      t.stoppedAt = Date.now()
      changed = true
    } catch (e) { /* ignore */ }
  }
  if (changed) saveState()
}
async function reconcileTunnels() {
  const r = await dockerRun(['ps', '-a', '--format', '{{.Names}}'])
  const live = new Set(r.stdout.split('\n').map((s) => s.trim()).filter(Boolean))
  let changed = false
  for (const t of state.tunnels) {
    if (t.status !== 'running') continue
    if (!t.proxy || !live.has(t.proxy)) {
      t.status = 'stopped'
      t.stoppedAt = Date.now()
      changed = true
    }
  }
  if (changed) saveState()
}
function tunnelView() {
  return state.tunnels.slice().reverse().map((t) => ({ ...t }))
}

// ---------- 网络策略 ----------
function networkPolicyOf(name) {
  const p = state.network[name]
  if (!p) return null
  return {
    publicAccess: p.publicAccess !== false,
    internalAccess: p.internalAccess !== false,
    isolated: !!p.isolated,
    isolateNetwork: !!p.isolateNetwork,
    updatedAt: p.updatedAt || 0,
    appliedAt: p.appliedAt || null,
    savedNetworks: Array.isArray(p.savedNetworks) ? p.savedNetworks : [],
  }
}
async function currentNetworks(name) {
  const ins = await inspectContainer(name)
  if (!ins) return []
  return Object.keys(ins.NetworkSettings ? ins.NetworkSettings.Networks || {} : {})
}
async function ensureNetworkApplied(name) {
  const p = state.network[name]
  if (!p) return
  const st = await containerState(name)
  if (!st || !st.running) return
  if (p.isolated) {
    for (const n of await currentNetworks(name)) {
      if (n === 'none' || n === 'host') continue
      await dockerRun(['network', 'disconnect', n, name], { timeoutMs: 120000 })
    }
    p.appliedAt = Date.now()
    saveState()
    return
  }
  if (p.publicAccess === false) {
    if (!p.savedNetworks || p.savedNetworks.length === 0) {
      p.savedNetworks = await currentNetworks(name)
    }
    const keep = p.internalAccess !== false ? INTERNAL_NETWORK : null
    if (keep) await ensureNetworkExists(keep, true)
    for (const n of await currentNetworks(name)) {
      if (n === 'none' || n === 'host' || n === keep) continue
      await dockerRun(['network', 'disconnect', n, name], { timeoutMs: 120000 })
    }
    if (keep && !(await currentNetworks(name)).includes(keep)) {
      await dockerRun(['network', 'connect', keep, name], { timeoutMs: 120000 })
    }
    p.appliedAt = Date.now()
    saveState()
    return
  }
  if (p.savedNetworks && p.savedNetworks.length > 0) {
    const current = await currentNetworks(name)
    for (const n of p.savedNetworks) {
      if (!current.includes(n)) await dockerRun(['network', 'connect', n, name], { timeoutMs: 120000 })
    }
    p.savedNetworks = []
  }
  p.appliedAt = Date.now()
  saveState()
}
async function setNetworkPolicy(ctx, sessionId, name, publicAccess, internalAccess, isolated, isolateNetwork) {
  const target = name ? await resolveExistingContainer(ctx, sessionId, name) : await resolveDefaultContainer(ctx, sessionId)
  assertManage(sessionId, target.name)
  const p = state.network[target.name] = Object.assign(
    { publicAccess: true, internalAccess: true, isolated: false, isolateNetwork: false, savedNetworks: [] },
    state.network[target.name] || {},
  )
  if (publicAccess !== undefined) p.publicAccess = !!publicAccess
  if (internalAccess !== undefined) p.internalAccess = !!internalAccess
  if (isolated !== undefined) p.isolated = !!isolated
  if (isolateNetwork !== undefined) p.isolateNetwork = !!isolateNetwork
  if (p.isolateNetwork) {
    p.isolated = false
    p.publicAccess = false
    p.internalAccess = true
  }
  p.updatedAt = Date.now()
  p.appliedAt = null
  saveState()
  await ensureRunning(target.name)
  await ensureNetworkApplied(target.name)
  return { ok: true, container: target.name, policy: networkPolicyOf(target.name) }
}
async function networkStatusOf(ctx, sessionId, name) {
  const target = name ? await resolveExistingContainer(ctx, sessionId, name) : await resolveDefaultContainer(ctx, sessionId)
  assertExec(sessionId, target.name)
  const ins = await inspectContainer(target.name)
  const net = containerNetworkInfo(ins)
  return {
    ok: true,
    container: target.name,
    networks: net.networks,
    primaryNetwork: net.primaryNetwork,
    primaryIp: net.primaryIp,
    policy: networkPolicyOf(target.name) || { publicAccess: true, internalAccess: true, isolated: false, isolateNetwork: false },
  }
}

// ---------- HTTP API ----------
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

// ---------- 模型工具 ----------
const render = (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
const sessionIdOf = (exec) => (exec && exec.agent ? exec.agent.id : null)
const OUT = { schema: { type: 'object', additionalProperties: true }, render }
const strArr = (label) => ({ type: 'array', items: { type: 'string' }, description: label })

function auditContainerArg(args) {
  if (!args || typeof args !== 'object') return null
  return args.container || args.name || args.machine || (Array.isArray(args.args) ? args.args.join(' ') : null)
}
function auditParamsOf(args) {
  try {
    const text = JSON.stringify(args || {})
    return text.length > 500 ? text.slice(0, 500) : text
  } catch (e) {
    return null
  }
}
function withAudit(tool) {
  if (!tool || tool.name === 'docker_audit') return tool
  const inner = tool.execute
  tool.execute = async (args, exec) => {
    const sessionId = sessionIdOf(exec)
    const t0 = Date.now()
    try {
      const value = await inner(args, exec)
      const ok = !value || typeof value !== 'object' || value.ok !== false
      pushAudit(sessionId, auditContainerArg(args), tool.name, auditParamsOf(args), ok, null, Date.now() - t0)
      return value
    } catch (err) {
      pushAudit(sessionId, auditContainerArg(args), tool.name, auditParamsOf(args), false, (err && err.message) || err, Date.now() - t0)
      throw err
    }
  }
  return tool
}

function apply(ctx) {
  const tools = ctx.get('tools')
  const webServer = ctx.get('webServer')
  try { console.log('[dock] apply: webServer=' + (webServer ? 'yes' : 'NO') + ', tools=' + (tools ? 'yes' : 'NO')) } catch (e) { /* ignore */ }

  ctx.on('domain/changed', (change) => {
    if (!change || change.domain !== 'workspace' || change.operation !== 'put') return
    const value = change.value
    if (!value || !Array.isArray(value.archivedSessionIds)) return
    const next = new Set(value.archivedSessionIds)
    for (const id of next) {
      if (!knownArchived.has(id)) {
        knownArchived.add(id)
        removeSessionContainers(id).catch((err) => { /* ignore */ })
      }
    }
    knownArchived = next
  })
  ctx.on('session/disposed', (session) => {
    const sid = session && session.id
    if (!sid) return
    handleDisposed(ctx, sid).catch((err) => { /* ignore */ })
  })

  reconcile(ctx).catch((err) => { /* ignore */ })
  idleSweep(ctx).catch((err) => { /* ignore */ })
  ctx.effect(() => {
    const timer = setInterval(() => idleSweep(ctx).catch(() => {}), IDLE_SWEEP_MS)
    return () => clearInterval(timer)
  }, 'dock: idle sweep')

  // watchers 清理 + 闲置回收
  ctx.effect(() => {
    return () => {
      for (const entry of watchers.values()) {
        try { entry.proc.kill() } catch (e) { /* ignore */ }
      }
      watchers.clear()
    }
  }, 'dock: watchers cleanup')
  ctx.effect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      for (const [name, entry] of watchers) {
        if (!entry.ended && now - entry.lastRead > 90000) {
          try { entry.proc.kill() } catch (e) { /* ignore */ }
          watchers.delete(name)
        }
      }
    }, 30000)
    return () => clearInterval(timer)
  }, 'dock: watcher idle sweep')

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
    const sessionOfReq = (req) => queryOf(req).get('session') || ''

    route('/dock-api/status', async (req, res) => {
      try { sendJson(res, 200, await statusView(ctx, sessionOfReq(req))) }
      catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
    route('/dock-api/inspect', async (req, res) => {
      try {
        const q = queryOf(req)
        const container = q.get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await inspectView(ctx, container, sessionOfReq(req)))
      } catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
    route('/dock-api/logs', async (req, res) => {
      try {
        const q = queryOf(req)
        const container = q.get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await logsView(container, q.get('tail') || 500))
      } catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
    route('/dock-api/top', async (req, res) => {
      try {
        const container = queryOf(req).get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await topView(container))
      } catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
    route('/dock-api/op', async (req, res) => {
      try {
        const q = queryOf(req)
        const container = q.get('container') || ''
        const action = q.get('action') || ''
        if (!container) throw new Error('缺少容器名')
        const out = await opView(ctx, sessionOfReq(req), container, action)
        pushAudit(sessionOfReq(req), container, 'docker_' + action, { via: 'panel' }, out.ok !== false, out.error || null)
        sendJson(res, 200, out)
      } catch (err) {
        pushAudit(sessionOfReq(req), queryOf(req).get('container') || '', 'docker_' + queryOf(req).get('action') || '', { via: 'panel' }, false, (err && err.message) || err)
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })
    route('/dock-api/watch', async (req, res) => {
      try {
        const q = queryOf(req)
        const container = q.get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await watchReadView(container, q.get('so') || 0, q.get('se') || 0))
      } catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
    route('/dock-api/watchstop', async (req, res) => {
      try {
        const container = queryOf(req).get('container') || ''
        if (!container) throw new Error('缺少容器名')
        sendJson(res, 200, await watchStopView(container))
      } catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
    route('/dock-api/create', async (req, res) => {
      try {
        const q = queryOf(req)
        const sessionId = q.get('session') || ''
        if (!sessionId) throw new Error('缺少会话标识')
        const opts = {
          image: q.get('image') || '',
          name: sanitizeContainerName(q.get('name') || ''),
          nameHint: sanitizeContainerName(q.get('name') || ''),
          command: q.get('command') || '',
          initScript: q.get('init_script') || '',
          env: q.get('env') ? String(q.get('env')).split('|||').filter(Boolean) : [],
          ports: q.get('ports') ? String(q.get('ports')).split('|||').filter(Boolean) : [],
          volumes: q.get('volumes') ? String(q.get('volumes')).split('|||').filter(Boolean) : [],
          network: q.get('network') || '',
          restart: q.get('restart') || '',
          cpus: q.get('cpus') || '',
          memory: q.get('memory') || '',
          memorySwap: q.get('memory_swap') || '',
          shmSize: q.get('shm_size') || '',
          pidsLimit: q.get('pids_limit') || '',
          diskQuota: q.get('disk_quota') || '',
          isolated: q.get('isolated') === '1' || q.get('isolated') === 'true',
          isolateNetwork: q.get('isolate_network') === '1' || q.get('isolate_network') === 'true',
          tty: q.get('tty') === '1' || q.get('tty') === 'true',
          mode: 'panel',
        }
        const out = await createContainerRaw(ctx, sessionId, opts, null)
        pushAudit(sessionId, out.container || '', 'docker_create', { image: opts.image, via: 'panel' }, true, null)
        sendJson(res, 200, out)
      } catch (err) {
        pushAudit(sessionId, sanitizeContainerName(queryOf(req).get('name') || ''), 'docker_create', { image: queryOf(req).get('image') || '', via: 'panel' }, false, (err && err.message) || err)
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 400) })
      }
    })
    route('/dock-api/shell', async (req, res) => {
      try {
        const name = queryOf(req).get('container') || ''
        if (!name) throw new Error('缺少容器名')
        sendJson(res, 200, shellLogView(name))
      } catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
    route('/dock-api/snapshot', async (req, res) => {
      try {
        const q = queryOf(req)
        const container = q.get('container') || ''
        if (!container) throw new Error('缺少容器名')
        const sid = sessionOfReq(req)
        const out = await createSnapshot(ctx, sid, container, q.get('note') || '')
        pushAudit(sid, container, 'docker_snapshot', { note: q.get('note') || '', via: 'panel' }, true, null)
        sendJson(res, 200, out)
      } catch (err) {
        pushAudit(sessionOfReq(req), queryOf(req).get('container') || '', 'docker_snapshot', { via: 'panel' }, false, (err && err.message) || err)
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })
    route('/dock-api/restore', async (req, res) => {
      try {
        const snapshot = queryOf(req).get('snapshot') || ''
        if (!snapshot) throw new Error('缺少快照名')
        const sid = sessionOfReq(req)
        const out = await restoreSnapshot(ctx, sid, snapshot)
        pushAudit(sid, out.container || snapshot, 'docker_restore', { snapshot, via: 'panel' }, true, null)
        sendJson(res, 200, out)
      } catch (err) {
        pushAudit(sessionOfReq(req), queryOf(req).get('snapshot') || '', 'docker_restore', { via: 'panel' }, false, (err && err.message) || err)
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })
    route('/dock-api/snapshot-delete', async (req, res) => {
      try {
        const snapshot = queryOf(req).get('snapshot') || ''
        if (!snapshot) throw new Error('缺少快照名')
        const sid = sessionOfReq(req)
        const out = await deleteSnapshot(ctx, sid, snapshot)
        pushAudit(sid, snapshot, 'docker_snapshot_delete', { via: 'panel' }, true, null)
        sendJson(res, 200, out)
      } catch (err) {
        pushAudit(sessionOfReq(req), queryOf(req).get('snapshot') || '', 'docker_snapshot_delete', { via: 'panel' }, false, (err && err.message) || err)
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) })
      }
    })
    route('/dock-api/jobs', async (req, res) => {
      try {
        const q = queryOf(req)
        const sessionId = q.get('session') || ''
        const container = q.get('container') || ''
        const limit = Math.min(500, Number(q.get('limit')) || 200)
        const jobs = state.jobs.slice().reverse().filter((j) => (!sessionId || j.sessionId === sessionId) && (!container || j.container === container || j.machine === container)).slice(0, limit)
        const out = []
        for (const j of jobs) out.push({ ...j, ...(await readJobStatus(j).catch(() => ({ status: j.status }))) })
        sendJson(res, 200, { ok: true, jobs: out })
      } catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
    route('/dock-api/tunnels', async (req, res) => {
      try {
        await reconcileTunnels()
        sendJson(res, 200, { ok: true, tunnels: tunnelView() })
      } catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
    route('/dock-api/audit', async (req, res) => {
      try {
        const q = queryOf(req)
        const sessionId = q.get('session') || undefined
        const container = q.get('container') || undefined
        const operation = q.get('operation') || undefined
        sendJson(res, 200, { ok: true, entries: auditView({ sessionId, container, operation }, q.get('limit') || 100) })
      } catch (err) { sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 300) }) }
    })
  }


  // ---------- 模型工具 ----------
  if (tools) {
    const registerTool = (raw) => {
      const tool = withAudit(raw)
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

    registerTool({
      name: 'docker_info',
      description: '查看本地 Docker 守护进程状态:版本、API、容器/镜像/卷/网络数量、磁盘占用、CPU/内存总量。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      async execute() {
        const [ver, info, df] = await Promise.all([
          dockerRun(['version', '--format', 'json']),
          dockerRun(['info', '--format', 'json']),
          dockerRun(['system', 'df', '--format', 'json']),
        ])
        if (ver.exitCode !== 0) return { ok: false, error: 'Docker 守护进程不可用: ' + capText(ver.stderr || ver.stdout, 300) }
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
          out.containers = i.Containers ? { running: i.Containers.Running || 0, paused: i.Containers.Paused || 0, stopped: i.Containers.Stopped || 0 } : null
          out.images = i.Images || 0
          out.volumes = i.Volumes || 0
          out.networks = i.Networks || 0
        } catch (e) { /* ignore */ }
        let disk = 0
        for (const line of df.stdout.split('\n')) {
          const t = line.trim()
          if (!t) continue
          try { disk += parseSize(JSON.parse(t).Size) } catch (e) { /* ignore */ }
        }
        out.diskBytes = disk
        return out
      },
    })

    registerTool({
      name: 'docker_ps',
      description: '列出本地容器(默认仅运行中;all=true 含已停止)。返回 ID/名称/镜像/状态/端口/资源占用/归属会话。',
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
        for (const f of String(args.filters || '').split(',')) {
          const f2 = f.trim()
          if (f2) argv.push('--filter', f2)
        }
        const r = await dockerRun(argv)
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        const items = parseLines(r.stdout).map((o) => {
          const found = recordOfContainer(psName(o))
          return {
            id: o.ID,
            name: psName(o),
            image: o.Image,
            command: o.Command,
            state: o.State,
            status: o.Status,
            ports: o.Ports,
            created: o.CreatedAt,
            size: o.Size,
            ownerSession: found ? found.sessionId : null,
          }
        })
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
      name: 'docker_create',
      description: '为当前会话创建并启动一个 Docker 沙箱容器(与 vm_create 对应)。image 必填;未指定 name 时自动根据会话标题生成。支持自定义 cpus/memory/memory_swap/shm_size/pids_limit/disk_quota、初始化脚本 init_script、网络隔离 isolated/isolate_network。每会话上限 8 个,全局运行上限 64 个。',
      parameters: {
        type: 'object',
        properties: {
          image: { type: 'string', description: '镜像名(可含 tag),如 debian:12、alpine:3.20、python:3.12-slim。' },
          name: { type: 'string', description: '可选:容器名提示;已存在且有权限时返回现有容器。' },
          command: { type: 'string', description: '可选:容器内要执行的命令(经 sh -lc 执行)。' },
          init_script: { type: 'string', description: '可选:初始化 Shell 脚本(等价于 command,首次启动即执行)。' },
          env: { type: 'array', items: { type: 'string' }, description: '环境变量,如 ["K=V"]。' },
          ports: { type: 'array', items: { type: 'string' }, description: '端口映射,如 ["8080:80"]。' },
          volumes: { type: 'array', items: { type: 'string' }, description: '卷挂载,如 ["/host:/data"]。' },
          network: { type: 'string', description: '网络名,默认 dsh-sandbox。' },
          restart: { type: 'string', description: '重启策略,如 unless-stopped。' },
          cpus: { type: 'string', description: 'CPU 配额,如 2。' },
          memory: { type: 'string', description: '内存上限,如 512m、2g。' },
          memory_swap: { type: 'string', description: '内存+交换上限。' },
          shm_size: { type: 'string', description: '/dev/shm 大小,如 64m。' },
          pids_limit: { type: 'integer', description: 'PID 数上限。' },
          disk_quota: { type: 'string', description: '存储配额,如 10G(需要 daemon storage driver 支持)。' },
          isolated: { type: 'boolean', description: '创建为无网络容器(--network none)。' },
          isolate_network: { type: 'boolean', description: '仅连接内部隔离网络 dsh-sandbox-internal(自动切断公网)。' },
          tty: { type: 'boolean', description: '分配 TTY。' },
          read_only: { type: 'boolean', description: '根文件系统只读。' },
        },
        required: ['image'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const opts = {
          image: args.image,
          name: sanitizeContainerName(args.name),
          nameHint: sanitizeContainerName(args.name),
          command: args.command,
          initScript: args.init_script,
          env: strList(args.env),
          ports: strList(args.ports),
          volumes: strList(args.volumes),
          network: args.network,
          restart: args.restart,
          cpus: args.cpus,
          memory: args.memory,
          memorySwap: args.memory_swap,
          shmSize: args.shm_size,
          pidsLimit: args.pids_limit,
          diskQuota: args.disk_quota,
          isolated: !!args.isolated,
          isolateNetwork: !!args.isolate_network,
          tty: !!args.tty,
          readOnly: !!args.read_only,
          mode: 'docker_create',
        }
        if (opts.name) {
          const owner = ownerOfContainer(opts.name)
          if (owner && !canExec(sessionId, opts.name)) throw new Error('该容器属于其他会话且未共享,不能使用')
          if (owner) return { container: opts.name, state: (await containerState(opts.name) || {}).status || 'unknown', existing: true, ownerSession: owner }
          const ins = await inspectContainer(opts.name)
          if (ins) return { container: opts.name, image: (ins.Config && ins.Config.Image) || '', state: ins.State ? ins.State.Status : 'unknown', existing: true, ownerSession: null }
        }
        return createContainerRaw(ctx, sessionId, opts, exec.signal)
      },
    })

    registerTool({
      name: 'docker_run',
      description: '创建并启动容器(与 docker_create 等价,提供更细的运行参数)。ports 如 ["8080:80"],volumes 如 ["/host:/data"],env 如 ["K=V"]。detach 默认 true;command 在容器内以 sh -lc 执行。创建的容器自动登记到当前会话。',
      parameters: {
        type: 'object',
        properties: {
          image: { type: 'string', description: '镜像名' },
          name: { type: 'string', description: '容器名' },
          detach: { type: 'boolean', description: '后台运行, 默认 true' },
          rm: { type: 'boolean', description: '退出后自动删除' },
          tty: { type: 'boolean', description: '分配 TTY' },
          interactive: { type: 'boolean', description: '保持 stdin 打开' },
          ports: { type: 'array', items: { type: 'string' }, description: '端口映射, 如 8080:80' },
          volumes: { type: 'array', items: { type: 'string' }, description: '卷挂载, 如 /host:/data' },
          env: { type: 'array', items: { type: 'string' }, description: '环境变量, 如 KEY=VALUE' },
          network: { type: 'string', description: '网络名' },
          restart: { type: 'string', description: '重启策略, 如 unless-stopped' },
          user: { type: 'string', description: '运行用户' },
          workdir: { type: 'string', description: '工作目录' },
          entrypoint: { type: 'string', description: '覆盖入口点' },
          labels: { type: 'array', items: { type: 'string' }, description: '标签, 如 app=web' },
          cpus: { type: 'string', description: 'CPU 配额' },
          memory: { type: 'string', description: '内存上限' },
          memory_swap: { type: 'string', description: '内存+交换上限' },
          shm_size: { type: 'string', description: '/dev/shm 大小' },
          pids_limit: { type: 'integer', description: 'PID 数上限' },
          disk_quota: { type: 'string', description: '存储配额(需 daemon 支持)' },
          isolated: { type: 'boolean', description: '无网络隔离容器' },
          isolate_network: { type: 'boolean', description: '仅内部网络' },
          read_only: { type: 'boolean', description: '根文件系统只读' },
          command: { type: 'string', description: '容器内要执行的命令(经 sh -lc)' },
        },
        required: ['image'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const opts = {
          image: args.image,
          name: sanitizeContainerName(args.name),
          nameHint: sanitizeContainerName(args.name),
          detach: args.detach !== false,
          rm: !!args.rm,
          tty: !!args.tty,
          interactive: !!args.interactive,
          command: args.command,
          initScript: null,
          ports: strList(args.ports),
          volumes: strList(args.volumes),
          env: strList(args.env),
          labels: strList(args.labels),
          network: args.network,
          restart: args.restart,
          user: args.user,
          workdir: args.workdir,
          entrypoint: args.entrypoint,
          cpus: args.cpus,
          memory: args.memory,
          memorySwap: args.memory_swap,
          shmSize: args.shm_size,
          pidsLimit: args.pids_limit,
          diskQuota: args.disk_quota,
          isolated: !!args.isolated,
          isolateNetwork: !!args.isolate_network,
          readOnly: !!args.read_only,
          mode: 'docker_run',
        }
        return createContainerRaw(ctx, sessionId, opts, exec.signal)
      },
    })

    registerTool({
      name: 'docker_status',
      description: '查询容器状态详情:状态、镜像、IP、网络、端口、挂载、CPU/内存/磁盘/swap 限额与实时用量、uptime、最近 Shell 记录、归属、共享权限、快照来源、后台任务与端口转发。省略 container 时使用当前会话默认容器。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '可选:目标容器名。省略时使用当前会话默认容器。' },
        },
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const name = sanitizeContainerName(args.container)
        if (name && !canExec(sessionId, name)) throw new Error('没有权限查看该容器状态')
        const target = name || (await resolveDefaultContainer(ctx, sessionId)).name
        return { ok: true, ...(await inspectView(ctx, target, sessionId)) }
      },
    })

    registerTool({
      name: 'docker_start',
      description: '启动已停止的容器。省略 container 时使用当前会话默认容器;需要 owner 或 manage 共享权限。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID。省略时启动当前会话默认容器。' },
        },
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const target = args.container ? await resolveExistingContainer(ctx, sessionId, sanitizeContainerName(args.container)) : await resolveDefaultContainer(ctx, sessionId)
        assertManage(sessionId, target.name)
        const r = await dockerRun(['start', target.name], { timeoutMs: 300000 })
        if (r.exitCode !== 0) throw new Error('docker start 失败: ' + capText(r.stderr || r.stdout, 300))
        touchContainer(target.sessionId || sessionId, target.name)
        await enforceRunningCap(target.name)
        await ensureNetworkApplied(target.name)
        return { ok: true, container: target.name, state: 'running' }
      },
    })

    registerTool({
      name: 'docker_stop',
      description: '停止运行中的容器。省略 container 时停止当前会话默认容器;需要 owner 或 manage 共享权限。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID' },
          timeout: { type: 'integer', description: '优雅停止等待秒数' },
        },
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const target = args.container ? await resolveExistingContainer(ctx, sessionId, sanitizeContainerName(args.container)) : await resolveDefaultContainer(ctx, sessionId)
        assertManage(sessionId, target.name)
        const argv = ['stop']
        if (args.timeout) argv.push('-t', String(args.timeout))
        argv.push(target.name)
        const r = await dockerRun(argv, { timeoutMs: 120000 })
        if (r.exitCode !== 0) throw new Error('docker stop 失败: ' + capText(r.stderr || r.stdout, 300))
        stopContainerTunnels(target.name)
        return { ok: true, container: target.name, state: 'exited' }
      },
    })

    registerTool({
      name: 'docker_restart',
      description: '重启容器。省略 container 时重启当前会话默认容器;需要 owner 或 manage 共享权限。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID' },
          timeout: { type: 'integer', description: '停止等待秒数' },
        },
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const target = args.container ? await resolveExistingContainer(ctx, sessionId, sanitizeContainerName(args.container)) : await resolveDefaultContainer(ctx, sessionId)
        assertManage(sessionId, target.name)
        const argv = ['restart']
        if (args.timeout) argv.push('-t', String(args.timeout))
        argv.push(target.name)
        const r = await dockerRun(argv, { timeoutMs: 120000 })
        if (r.exitCode !== 0) throw new Error('docker restart 失败: ' + capText(r.stderr || r.stdout, 300))
        await ensureNetworkApplied(target.name)
        return { ok: true, container: target.name, state: 'running' }
      },
    })

    registerTool({
      name: 'docker_rm',
      description: '删除容器(默认仅停止的容器;force=true 强制删除运行中容器)。只允许删除当前会话拥有或未登记的容器;其他会话共享的容器即使 manage 也不能删除。',
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
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const name = sanitizeContainerName(args.container)
        if (!canOwner(sessionId, name)) throw new Error('该容器属于其他会话,不能删除')
        const argv = ['rm']
        if (args.force) argv.push('-f')
        if (args.volumes) argv.push('-v')
        argv.push(name)
        const r = await dockerRun(argv)
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 300) }
        shellLogs.delete(name)
        stopContainerTunnels(name)
        invalidateContainerJobs(name)
        removeContainerRecord(name)
        return { ok: true, container: name, result: '已删除' }
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
        const text = r.stdout + (r.stderr ? '[stderr]\n' + r.stderr : '')
        return { ok: true, text: capText(text, 50000) }
      },
    })

    registerTool({
      name: 'docker_exec',
      description: '在运行中的容器内执行命令(容器内以 sh -lc 执行,支持管道/变量)。省略 container 时使用当前会话默认容器;传 containers 数组可并行执行同一命令。需要 exec 或 manage 权限。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名或 ID' },
          containers: { type: 'array', items: { type: 'string' }, description: '可选:多容器名称,并行执行同一命令。' },
          command: { type: 'string', description: '要执行的命令, 如 ls -la /app' },
          user: { type: 'string', description: '以指定用户执行' },
          workdir: { type: 'string', description: '工作目录' },
          env: { type: 'array', items: { type: 'string' }, description: '附加环境变量' },
          timeout_ms: { type: 'integer', description: '超时毫秒数,默认 120000。' },
        },
        required: ['command'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const command = String(args.command || '')
        if (!command.trim()) throw new Error('command 不能为空')
        const timeoutMs = Number(args.timeout_ms) > 0 ? Number(args.timeout_ms) : 120000
        const list = Array.isArray(args.containers) ? args.containers.map((x) => sanitizeContainerName(x)).filter(Boolean) : []
        const single = sanitizeContainerName(args.container)
        const names = single || (list.length ? list : null)
        const runOne = async (name) => {
          const target = names ? await resolveExistingContainer(ctx, sessionId, name) : await resolveDefaultContainer(ctx, sessionId)
          assertExec(sessionId, target.name)
          await ensureRunning(target.name)
          const argv = ['exec']
          if (args.user) argv.push('-u', args.user)
          if (args.workdir) argv.push('-w', args.workdir)
          for (const e of strList(args.env)) argv.push('-e', e)
          argv.push(target.name, 'sh', '-lc', command)
          const entry = {
            id: genId('shell'),
            container: target.name,
            machine: target.name,
            command,
            startTime: Date.now(),
            endTime: null,
            durationMs: null,
            exitCode: null,
            stdout: '',
            stderr: '',
            status: 'running',
          }
          pushShellLog(target.name, entry)
          const r = await dockerRun(argv, { timeoutMs, signal: exec.signal })
          entry.endTime = Date.now()
          entry.durationMs = entry.endTime - entry.startTime
          entry.exitCode = r.exitCode
          entry.stdout = r.stdout
          entry.stderr = r.stderr
          entry.status = r.exitCode === 0 ? 'ok' : 'bad'
          return { container: target.name, exitCode: r.exitCode, stdout: capText(r.stdout, 50000), stderr: capText(r.stderr, 20000) || null, ok: r.exitCode === 0 }
        }
        const namesArr = Array.isArray(names) ? names : [names]
        const results = await Promise.allSettled(namesArr.map(runOne))
        const out = results.map((r) => r.status === 'fulfilled' ? r.value : { container: null, error: String((r.reason && r.reason.message) || r.reason), exitCode: -1, ok: false })
        if (out.length > 1) {
          return { ok: true, parallel: true, summary: out.filter((o) => o.exitCode === 0).length + '/' + out.length + ' 成功', results: out }
        }
        return out[0]
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
        } catch (e) { return { ok: false, error: 'inspect 输出解析失败' } }
        const json = JSON.stringify(data)
        if (json.length > 60000 && data && data.State) {
          data = {
            id: data.Id,
            name: data.Name,
            image: data.Config ? data.Config.Image : null,
            state: data.State ? pick(data.State, ['Status', 'Running', 'Paused', 'ExitCode', 'StartedAt', 'FinishedAt', 'Pid']) : null,
            created: data.Created,
            config: pick(data.Config || {}, ['Image', 'Cmd', 'Entrypoint', 'Env', 'Labels', 'Tty', 'OpenStdin', 'WorkingDir', 'User', 'Hostname']),
            host: pick(data.HostConfig || {}, ['RestartPolicy', 'NetworkMode', 'PortBindings', 'Binds', 'Privileged', 'NanoCpus', 'Memory', 'MemorySwap', 'ShmSize', 'PidsLimit', 'StorageOpt']),
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
          internal: { type: 'boolean', description: 'create 时创建内部网络' },
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
        const argv = ['network', a]
        if (a === 'create') {
          if (args.driver) argv.push('-d', args.driver)
          if (args.subnet) argv.push('--subnet', args.subnet)
          if (args.internal) argv.push('--internal')
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
          try { return { ok: true, data: JSON.parse(r.stdout) } } catch (e) { return { ok: true, text: capText(r.stdout, 20000) } }
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
        const argv = ['volume', a]
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
          try { return { ok: true, data: JSON.parse(r.stdout) } } catch (e) { return { ok: true, text: capText(r.stdout, 20000) } }
        }
        return { ok: true, result: capText(r.stdout || r.stderr, 1000).trim() || '成功' }
      },
    })

    registerTool({
      name: 'docker_build',
      description: '从上下文目录构建镜像(上下文必须位于工作区内,相对路径基于工作区)。',
      parameters: {
        type: 'object',
        properties: {
          context: { type: 'string', description: '构建上下文路径' },
          tag: { type: 'string', description: '镜像标签, 如 myapp:latest' },
          dockerfile: { type: 'string', description: 'Dockerfile 路径(相对 context)' },
          buildArgs: { type: 'array', items: { type: 'string' }, description: '构建参数, 如 VERSION=1.0' },
          noCache: { type: 'boolean', description: '不使用缓存' },
          target: { type: 'string', description: '多阶段构建目标阶段' },
          platform: { type: 'string', description: '平台, 如 linux/amd64' },
        },
        required: ['context'],
      },
      output: OUT,
      async execute(args, exec) {
        const context = resolveLocalPath(ctx, args.context)
        const argv = ['build']
        if (args.tag) argv.push('-t', args.tag)
        if (args.dockerfile) argv.push('-f', args.dockerfile)
        for (const b of strList(args.buildArgs)) argv.push('--build-arg', b)
        if (args.noCache) argv.push('--no-cache')
        if (args.target) argv.push('--target', args.target)
        if (args.platform) argv.push('--platform', args.platform)
        argv.push(context)
        const r = await dockerRun(argv, { timeoutMs: 900000, signal: exec.signal })
        if (r.exitCode !== 0) return { ok: false, error: capText(r.stderr || r.stdout, 1500) }
        return { ok: true, output: capText((r.stdout + '\n' + r.stderr).trim(), 3000) }
      },
    })

    registerTool({
      name: 'docker_cli',
      description: '通用 docker 命令直通:覆盖全部子命令(compose/push/tag/save/load/cp/commit/exec/port/events 等)。args 为完整参数列表, 如 ["compose","up","-d"] 或 ["images"]。所有调用都会写入 docker_audit。',
      parameters: {
        type: 'object',
        properties: {
          args: { type: 'array', items: { type: 'string' }, description: 'docker 子命令及参数, 如 ["run","-d","nginx"]' },
          note: { type: 'string', description: '本次操作意图说明(可选)' },
        },
        required: ['args'],
      },
      output: OUT,
      async execute(args, exec) {
        const argv = (args.args || []).map(String)
        if (!argv.length || argv.some((x) => x.length === 0)) return { ok: false, error: 'args 不能为空' }
        const r = await dockerRun(argv, { timeoutMs: 300000, signal: exec.signal })
        const out = capText(r.stdout, 100000)
        const err = capText(r.stderr, 40000)
        if (r.exitCode !== 0) return { ok: false, exitCode: r.exitCode, output: out, error: err || 'docker 命令失败' }
        return { ok: true, exitCode: 0, output: out, stderr: err || null }
      },
    })

    registerTool({
      name: 'docker_snapshot',
      description: '为容器创建快照(基于 docker commit 创建可回滚镜像,按需共享底层存储)。创建后可随时 docker_restore 回滚;需要 owner 或 manage 权限。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '目标容器名称。省略时使用当前会话默认容器。' },
          note: { type: 'string', description: '可选快照备注。' },
        },
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const name = sanitizeContainerName(args.container) || (await resolveDefaultContainer(ctx, sessionId)).name
        return createSnapshot(ctx, sessionId, name, args.note)
      },
    })

    registerTool({
      name: 'docker_snapshot_list',
      description: '列出当前会话全部容器快照(含来源容器、创建时间、备注、镜像)。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const all = listSnapshots(sessionId)
        return { ok: true, snapshots: all, own: all.filter((s) => s.sessionId === sessionId) }
      },
    })

    registerTool({
      name: 'docker_restore',
      description: '从快照恢复容器:删除当前容器并使用快照镜像按原配置重建(快照本身保留)。需要 owner 或 manage 权限。',
      parameters: {
        type: 'object',
        properties: {
          snapshot: { type: 'string', description: '快照名称(见 docker_list 或 docker_snapshot_list)。' },
        },
        required: ['snapshot'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        return restoreSnapshot(ctx, sessionId, String(args.snapshot || '').trim())
      },
    })

    registerTool({
      name: 'docker_snapshot_delete',
      description: '删除一个容器快照镜像(永久删除,不可恢复)。只有快照归属会话可删除。',
      parameters: {
        type: 'object',
        properties: {
          snapshot: { type: 'string', description: '要删除的快照名称。' },
        },
        required: ['snapshot'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        return deleteSnapshot(ctx, sessionId, String(args.snapshot || '').trim())
      },
    })

    registerTool({
      name: 'docker_upload',
      description: '上传文件/目录到容器(docker cp)。local_path 为工作区相对/绝对路径,remote_path 为容器内绝对路径。目标容器需归属当前会话或被共享 exec/manage 权限。',
      parameters: {
        type: 'object',
        properties: {
          local_path: { type: 'string', description: '本地文件/目录路径(需在工作区内)。' },
          remote_path: { type: 'string', description: '容器内目标路径。' },
          container: { type: 'string', description: '可选目标容器名称;省略使用当前会话默认容器。' },
        },
        required: ['local_path', 'remote_path'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        return uploadToContainer(ctx, sessionId, sanitizeContainerName(args.container), args.local_path, args.remote_path)
      },
    })

    registerTool({
      name: 'docker_download',
      description: '从容器下载文件/目录到本地(docker cp)。remote_path 为容器内路径,local_path 为工作区相对/绝对路径。目标容器需归属当前会话或被共享 exec/manage 权限。',
      parameters: {
        type: 'object',
        properties: {
          remote_path: { type: 'string', description: '容器内源路径。' },
          local_path: { type: 'string', description: '本地目标路径。' },
          container: { type: 'string', description: '可选目标容器名称;省略使用当前会话默认容器。' },
        },
        required: ['remote_path', 'local_path'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        return downloadFromContainer(ctx, sessionId, sanitizeContainerName(args.container), args.remote_path, args.local_path)
      },
    })

    registerTool({
      name: 'docker_port_forward',
      description: '把容器内端口映射到本地回环地址(通过 alpine/socat 代理容器实现,无需修改原容器)。默认自动选择空闲本地端口;可指定 host_port。需要 exec 或 manage 权限。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '目标容器名称;省略使用当前会话默认容器。' },
          container_port: { type: 'integer', description: '容器内要暴露的端口(1-65535)。' },
          host_port: { type: 'integer', description: '可选本地端口;缺省自动分配空闲端口。' },
          bind_host: { type: 'string', description: '可选本地绑定地址,默认 127.0.0.1;仅支持 localhost/127.0.0.1/::1。' },
        },
        required: ['container_port'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        return startPortForward(ctx, sessionId, sanitizeContainerName(args.container), args.container_port, args.host_port, args.bind_host)
      },
    })

    registerTool({
      name: 'docker_port_forward_list',
      description: '列出当前所有端口转发(含 container、container_port、host_port、代理容器、状态)。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      async execute() {
        await reconcileTunnels()
        return { ok: true, tunnels: tunnelView() }
      },
    })

    registerTool({
      name: 'docker_port_forward_stop',
      description: '停止一个端口转发。可传 tunnel_id 或 host_port 停止对应转发。',
      parameters: {
        type: 'object',
        properties: {
          tunnel_id: { type: 'string', description: '转发 ID。' },
          host_port: { type: 'integer', description: '或按本地端口停止。' },
        },
      },
      output: OUT,
      async execute(args) {
        const idOrPort = (args && args.tunnel_id) || (args && args.host_port)
        if (!idOrPort) throw new Error('需要 tunnel_id 或 host_port')
        const out = stopTunnelByIdOrPort(String(idOrPort))
        return { ok: true, ...out }
      },
    })

    registerTool({
      name: 'docker_job_submit',
      description: '提交一个后台长任务到容器内执行(避免依赖单次 docker_exec 超时)。任务在容器内后台运行,返回 job id/pid;用 docker_job_list / docker_job_status / docker_job_stop 管理。需要 exec 或 manage 权限。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要在容器内以后台方式运行的 shell 命令。' },
          container: { type: 'string', description: '目标容器名称;省略使用当前会话默认容器。' },
        },
        required: ['command'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const command = String(args.command || '')
        if (!command.trim()) throw new Error('command 不能为空')
        return submitJob(ctx, sessionId, sanitizeContainerName(args.container), command)
      },
    })

    registerTool({
      name: 'docker_job_list',
      description: '列出后台任务(当前会话或全部),包含状态、PID、命令、运行时长、最近日志尾部。可选 container/limit 过滤。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '可选按容器过滤。' },
          limit: { type: 'integer', description: '可选返回条数,默认 100。' },
        },
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        const container = sanitizeContainerName(args.container)
        const limit = Math.min(500, Number(args.limit) || 100)
        let jobs = state.jobs.slice().reverse()
        if (container) jobs = jobs.filter((j) => j.container === container || j.machine === container)
        else if (sessionId) jobs = jobs.filter((j) => j.sessionId === sessionId)
        const out = []
        for (const j of jobs.slice(0, limit)) out.push({ ...j, ...(await readJobStatus(j).catch(() => ({ status: j.status }))) })
        return { ok: true, jobs: out }
      },
    })

    registerTool({
      name: 'docker_job_status',
      description: '查询单个后台任务最新状态(运行中、成功、失败、已停止)和日志尾部。',
      parameters: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: '任务 ID。' },
        },
        required: ['job_id'],
      },
      output: OUT,
      async execute(args) {
        const job = jobById(String(args.job_id || ''))
        if (!job) throw new Error('未找到后台任务')
        return { ok: true, job: { ...job, ...(await readJobStatus(job)) } }
      },
    })

    registerTool({
      name: 'docker_job_stop',
      description: '停止一个运行中的后台任务。需要任务归属会话或对目标容器有 manage 权限。',
      parameters: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: '任务 ID。' },
        },
        required: ['job_id'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        return stopJob(ctx, sessionId, String(args.job_id || ''))
      },
    })

    registerTool({
      name: 'docker_job_output',
      description: '获取后台任务的完整日志输出(默认最多 1MB,可选 max_bytes)。',
      parameters: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: '任务 ID。' },
          max_bytes: { type: 'integer', description: '可选最大字节数,默认 1048576。' },
        },
        required: ['job_id'],
      },
      output: OUT,
      async execute(args) {
        return jobFullOutput(String(args.job_id || ''), args.max_bytes)
      },
    })

    registerTool({
      name: 'docker_audit',
      description: '查询容器操作审计日志:谁(sessionId)/什么容器/什么操作/何时/是否成功/错误。可按 session/container/operation 过滤。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '可选按容器过滤。' },
          operation: { type: 'string', description: '可选按操作名过滤,如 docker_create、docker_exec、docker_snapshot。' },
          limit: { type: 'integer', description: '可选返回条数,默认 100。' },
        },
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        const filter = { sessionId: sessionId || undefined, container: sanitizeContainerName(args.container) || undefined, operation: args.operation || undefined }
        return { ok: true, entries: auditView(filter, args.limit || 100) }
      },
    })

    registerTool({
      name: 'docker_share',
      description: '把当前会话拥有的容器共享给另一个会话。mode=exec 允许执行/传输/端口转发/任务,mode=manage 额外允许生命周期/网络/快照。只有 owner 可共享。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '要共享的容器名称。' },
          session: { type: 'string', description: '目标会话 ID。' },
          mode: { type: 'string', enum: ['exec', 'manage'], description: '可选权限模式,默认 exec。' },
        },
        required: ['container', 'session'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const name = sanitizeContainerName(args.container)
        const targetSession = String(args.session || '').trim()
        const mode = args.mode === 'manage' ? 'manage' : 'exec'
        if (!canOwner(sessionId, name)) throw new Error('只有归属会话可以共享该容器')
        if (!targetSession || targetSession === sessionId) throw new Error('session 必须是其他会话 ID')
        const grants = state.shares[name] = state.shares[name] || []
        const idx = grants.findIndex((g) => g.sessionId === targetSession)
        if (idx >= 0) grants[idx] = { sessionId: targetSession, mode, sharedAt: Date.now() }
        else grants.push({ sessionId: targetSession, mode, sharedAt: Date.now() })
        saveState()
        return { ok: true, container: name, sharedWith: grants }
      },
    })

    registerTool({
      name: 'docker_unshare',
      description: '取消当前会话容器对其他会话的共享。只有 owner 可操作。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '容器名称。' },
          session: { type: 'string', description: '目标会话 ID。' },
        },
        required: ['container', 'session'],
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const name = sanitizeContainerName(args.container)
        const targetSession = String(args.session || '').trim()
        if (!canOwner(sessionId, name)) throw new Error('只有归属会话可以取消共享')
        const grants = state.shares[name] = (state.shares[name] || []).filter((g) => g.sessionId !== targetSession)
        if (grants.length === 0) delete state.shares[name]
        saveState()
        return { ok: true, container: name, sharedWith: grants }
      },
    })

    registerTool({
      name: 'docker_policy',
      description: '查看/调整当前会话的容器配额与回收策略:max_containers、idle_sleep_minutes、idle_delete_days。只影响当前会话自己的容器。',
      parameters: {
        type: 'object',
        properties: {
          max_containers: { type: 'integer', description: '可选设置本会话最大容器数(1-8)。' },
          idle_sleep_minutes: { type: 'integer', description: '可选设置闲置停止分钟数(0 表示不自动停止)。' },
          idle_delete_days: { type: 'integer', description: '可选设置闲置自动删除天数(0 表示不自动删除)。' },
        },
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const cur = sessionPolicy(sessionId)
        const next = { ...cur }
        if (args && args.max_containers !== undefined) next.maxContainers = Math.max(1, Math.min(MAX_PER_SESSION, Number(args.max_containers)))
        if (args && args.idle_sleep_minutes !== undefined) next.idleSleepMinutes = Math.max(0, Number(args.idle_sleep_minutes))
        if (args && args.idle_delete_days !== undefined) next.idleDeleteDays = Math.max(0, Number(args.idle_delete_days))
        state.policies[sessionId] = next
        saveState()
        return { ok: true, sessionId, policy: next }
      },
    })

    registerTool({
      name: 'docker_network_policy',
      description: '查看/设置容器网络策略。public_access 是否允许访问公网;internal_access 是否允许与其他沙箱容器内网互通;isolated 是否断开全部网络;isolate_network 仅保留内部隔离网络 dsh-sandbox-internal。策略持久化并在每次启动时重新应用。',
      parameters: {
        type: 'object',
        properties: {
          container: { type: 'string', description: '目标容器名称;省略使用当前会话默认容器。' },
          public_access: { type: 'boolean', description: '可选:是否允许访问公网。' },
          internal_access: { type: 'boolean', description: '可选:是否允许与其他沙箱容器内网互通。' },
          isolated: { type: 'boolean', description: '可选:是否断开全部网络(等价 --network none)。' },
          isolate_network: { type: 'boolean', description: '可选:是否仅保留内部隔离网络。' },
        },
      },
      output: OUT,
      async execute(args, exec) {
        const sessionId = sessionIdOf(exec)
        if (!sessionId) throw new Error('无法确定当前会话')
        const name = sanitizeContainerName(args.container)
        if (args && (args.public_access !== undefined || args.internal_access !== undefined || args.isolated !== undefined || args.isolate_network !== undefined)) {
          return setNetworkPolicy(ctx, sessionId, name, args.public_access, args.internal_access, args.isolated, args.isolate_network)
        }
        return networkStatusOf(ctx, sessionId, name)
      },
    })
  }

  try { console.log('[dock] Docker sandbox deployment plugin ready (v1.0.0, cap ' + MAX_RUNNING + ', max-per-session ' + MAX_PER_SESSION + ')') } catch (e) { /* ignore */ }
}

export { apply }
export const inject = ['webServer', 'tools']
