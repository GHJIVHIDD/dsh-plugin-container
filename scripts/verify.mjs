/**
 * Strict verification for @dsh-community/dsh-plugin-container v1.0.0.
 *
 * Covers:
 *   1. syntax check of host/client sources and packaging scripts
 *   2. host ESM exports (apply + inject)
 *   3. mocked Cordis context: 39 docker_* tools + 15 /dock-api/* routes
 *      registered through the same plugin entry point
 *   4. complete tool schema surface parity with dsh-plugin-vm-sandbox:
 *      snapshot / transfer / port-forward / jobs / audit / share / policy /
 *      network-policy / parallel-exec / custom resources
 *   5. live Docker Engine probe through docker_info (hard fail when daemon
 *      is unavailable — this is a Docker plugin)
 *   6. client bundle browser-sandbox execution: id + apply/inject + slot
 *      registration + style mount/unmount disposer
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'dsh-plugin-container', 'src')
const fail = (msg) => { console.error('✗ ' + msg); process.exitCode = 1 }
const pass = (msg) => console.log('✓ ' + msg)

// 1. syntax check
for (const f of [
  'dsh-plugin-container/src/index.js',
  'dsh-plugin-container/src/client.js',
  'scripts/prepare.mjs',
  'scripts/verify.mjs',
  'scripts/smoke.mjs',
  'scripts/package.mjs',
  'dsh-plugin-container/scripts/prepare.mjs',
]) {
  const r = spawnSync(process.execPath, ['--check', join(root, f)], { encoding: 'utf8' })
  if (r.status !== 0) fail('syntax ' + f + ': ' + (r.stderr || r.stdout).slice(0, 400))
  else pass('syntax OK: ' + f)
}

// 2. host ESM exports
let host = null
try {
  host = await import(join(srcDir, 'index.js'))
  if (typeof host.apply !== 'function') fail('host must export apply()')
  if (!Array.isArray(host.inject) || !host.inject.includes('webServer') || !host.inject.includes('tools')) {
    fail('host inject must include webServer and tools')
  }
  pass('host exports: apply() + inject ' + JSON.stringify(host.inject))
} catch (e) {
  fail('host load: ' + String((e && e.message) || e))
}

// 3. apply() with mocked ctx
const registeredTools = []
const registeredRoutes = []
const effects = []
const ctx = {
  get(name) {
    if (name === 'tools') return { register: (t) => { registeredTools.push(t); return () => {} } }
    if (name === 'webServer') return { register: (r) => { registeredRoutes.push(r); return () => {} } }
    return undefined
  },
  effect(fn, label) { effects.push({ fn, label }) },
  on() {},
}
try {
  host.apply(ctx)
  const disposers = []
  for (const e of effects) {
    const d = e.fn()
    if (typeof d === 'function') disposers.push(d)
  }
  for (const d of disposers) d()
  const toolNames = registeredTools.map((t) => t.name).sort()
  const routePaths = registeredRoutes.map((r) => r.path).sort()
  const EXPECT_TOOLS = [
    'docker_audit', 'docker_build', 'docker_cli', 'docker_create', 'docker_download',
    'docker_exec', 'docker_images', 'docker_info', 'docker_inspect', 'docker_job_list',
    'docker_job_output', 'docker_job_status', 'docker_job_stop', 'docker_job_submit',
    'docker_logs', 'docker_network', 'docker_network_policy', 'docker_policy',
    'docker_port_forward', 'docker_port_forward_list', 'docker_port_forward_stop',
    'docker_ps', 'docker_pull', 'docker_restart', 'docker_restore', 'docker_rm',
    'docker_rmi', 'docker_run', 'docker_share', 'docker_snapshot', 'docker_snapshot_delete',
    'docker_snapshot_list', 'docker_start', 'docker_stats', 'docker_status', 'docker_stop',
    'docker_unshare', 'docker_upload', 'docker_volume',
  ].sort()
  const EXPECT_ROUTES = [
    '/dock-api/audit', '/dock-api/create', '/dock-api/inspect', '/dock-api/jobs',
    '/dock-api/logs', '/dock-api/op', '/dock-api/restore', '/dock-api/shell',
    '/dock-api/snapshot', '/dock-api/snapshot-delete', '/dock-api/status', '/dock-api/top',
    '/dock-api/tunnels', '/dock-api/watch', '/dock-api/watchstop',
  ].sort()
  const missingTools = EXPECT_TOOLS.filter((n) => !toolNames.includes(n))
  if (registeredTools.length !== EXPECT_TOOLS.length || missingTools.length) {
    fail('expected ' + EXPECT_TOOLS.length + ' tools, got ' + registeredTools.length + (missingTools.length ? '; missing ' + missingTools.join(', ') : ''))
  } else pass('host registers ' + EXPECT_TOOLS.length + ' docker_* tools')
  const missingRoutes = EXPECT_ROUTES.filter((p) => !routePaths.includes(p))
  if (registeredRoutes.length !== EXPECT_ROUTES.length || missingRoutes.length) {
    fail('expected ' + EXPECT_ROUTES.length + ' routes, got ' + registeredRoutes.length + (missingRoutes.length ? '; missing ' + missingRoutes.join(', ') : ''))
  } else pass('host registers ' + EXPECT_ROUTES.length + ' /dock-api/* routes')
  // Regression: route catch blocks must never throw. A missing-session
  // /dock-api/create request must answer JSON 500, not reject the handler.
  try {
    const createRoute = registeredRoutes.find((r) => r.path === '/dock-api/create')
    if (!createRoute) throw new Error('create route not registered')
    let statusCode = 0
    let body = ''
    const fakeRes = { statusCode: 0, setHeader() {}, end(text) { body = String(text || '') } }
    await createRoute.handler({ url: '/dock-api/create?image=alpine' }, fakeRes)
    const parsed = JSON.parse(body)
    if (fakeRes.statusCode !== 500 || parsed.ok !== false || !parsed.error) throw new Error('unexpected create-route error response: ' + body)
    pass('route error path regression OK (/dock-api/create -> JSON 500)')
  } catch (e) {
    fail('route error path regression: ' + String((e && e.message) || e))
  }
} catch (e) {
  fail('apply() smoke: ' + String((e && e.message) || e))
}

// 4. tool schema surface (vm-sandbox parity)
const requiredParams = {
  docker_create: ['cpus', 'memory', 'memory_swap', 'shm_size', 'pids_limit', 'disk_quota', 'init_script', 'isolated', 'isolate_network'],
  docker_exec: ['containers', 'timeout_ms'],
  docker_snapshot: ['container', 'note'],
  docker_restore: ['snapshot'],
  docker_snapshot_delete: ['snapshot'],
  docker_upload: ['local_path', 'remote_path', 'container'],
  docker_download: ['remote_path', 'local_path', 'container'],
  docker_port_forward: ['container', 'container_port', 'host_port', 'bind_host'],
  docker_port_forward_stop: ['tunnel_id', 'host_port'],
  docker_job_submit: ['command', 'container'],
  docker_job_list: ['container', 'limit'],
  docker_job_status: ['job_id'],
  docker_job_stop: ['job_id'],
  docker_job_output: ['job_id', 'max_bytes'],
  docker_audit: ['container', 'operation', 'limit'],
  docker_share: ['container', 'session', 'mode'],
  docker_unshare: ['container', 'session'],
  docker_policy: ['max_containers', 'idle_sleep_minutes', 'idle_delete_days'],
  docker_network_policy: ['public_access', 'internal_access', 'isolated', 'isolate_network'],
}
const failures = []
for (const [toolName, params] of Object.entries(requiredParams)) {
  const tool = registeredTools.find((t) => t.name === toolName)
  const props = tool && tool.parameters && tool.parameters.properties ? Object.keys(tool.parameters.properties) : []
  for (const p of params) if (!props.includes(p)) failures.push(toolName + '.' + p)
}
if (failures.length) fail('missing tool parameters: ' + failures.join(', '))
else pass('tool schema surface parity OK (' + Object.keys(requiredParams).length + ' tools inspected)')

// 5. live docker_info probe (strict — daemon must be reachable)
try {
  const tools2 = []
  const ctx2 = {
    get(name) {
      if (name === 'tools') return { register: (t) => { tools2.push(t); return () => {} } }
      if (name === 'webServer') return { register: () => () => {} }
      return undefined
    },
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') d()
    },
    on() {},
  }
  host.apply(ctx2)
  const infoTool = tools2.find((t) => t.name === 'docker_info')
  const out = await infoTool.execute({}, {})
  if (!out || out.ok === false) fail('docker_info live probe failed: ' + ((out && out.error) || 'unknown'))
  else if (!out.serverVersion) fail('docker_info returned no serverVersion')
  else pass('docker_info live probe OK (server ' + out.serverVersion + ', context ' + out.context + ')')
} catch (e) {
  fail('docker_info execution: ' + String((e && e.message) || e))
}

// 6. client bundle in a vm sandbox
try {
  const src = readFileSync(join(srcDir, 'client.js'), 'utf8')
  let loaded = null
  const registeredSlot = []
  const noop = () => {}
  const sandbox = {
    window: { __ModuleLoader__: { load: (o) => { loaded = o } } },
    console,
    URLSearchParams,
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: true }) }),
    document: {
      createElement: () => ({ dataset: {}, set textContent(_v) {}, remove() {} }),
      head: { appendChild() {} },
    },
    encodeURIComponent,
    Object,
    Symbol,
    String,
    Error,
    Array,
    JSON,
    Math,
    Number,
    RegExp,
    isFinite,
    parseFloat,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    require: (name) => {
      if (name === 'react') {
        return {
          createElement: (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat() }),
          useState: (initial) => [initial, noop],
          useEffect: () => {},
          useCallback: (fn) => fn,
          useRef: (initial) => ({ current: initial }),
        }
      }
      throw new Error('unknown require: ' + name)
    },
  }
  vm.createContext(sandbox)
  new vm.Script(src).runInContext(sandbox)
  if (!loaded || loaded.id !== '@dsh-community/dsh-plugin-container') fail('client bundle must register id @dsh-community/dsh-plugin-container')
  const mod = loaded.factory((n) => sandbox.require(n))
  if (typeof mod.apply !== 'function' || !Array.isArray(mod.inject) || !mod.inject.includes('slots')) {
    fail('client bundle must export apply() + inject ["slots"]')
  }
  mod.apply({
    get: (n) => (n === 'slots' ? {
      register: (def) => { registeredSlot.push(def); return () => {} },
      inject: (slot, factory) => {
        if (slot !== 'conversation.view') throw new Error('unexpected slot: ' + slot)
        factory()
      },
    } : undefined),
    effect: (fn) => {
      const d = fn()
      if (typeof d === 'function') d()
    },
  })
  if (registeredSlot.length !== 1 || !registeredSlot[0] || registeredSlot[0].name !== 'conversation.view' || registeredSlot[0].id !== 'docker') fail('client must inject one conversation.view slot with id docker')
  else pass('client bundle executes in browser sandbox (id + apply/inject + slot OK)')
} catch (e) {
  fail('client bundle: ' + String((e && e.stack) || e))
}

if (!process.exitCode) console.log('\nAll checks passed ✔')
else console.error('\nVerification failed ✗')
process.exit(process.exitCode || 0)
