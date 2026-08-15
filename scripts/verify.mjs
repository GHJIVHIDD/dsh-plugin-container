/**
 * Offline verification for @dsh-community/dsh-plugin-container (no dsh server needed).
 *
 * Per the DSH plugin development guide (section 4.4):
 *   1. syntax-check both halves
 *   2. load the host ESM module and check exports
 *   3. run apply() with a mocked ctx, execute every effect, and assert the
 *      18 tools + 7 routes are registered
 *   4. execute a real docker command through the docker_info tool (best-effort;
 *      only warns when the docker daemon is unavailable)
 *   5. simulate the browser: run the client bundle factory inside a vm sandbox
 *      and assert apply/inject exports
 *
 * Usage: node scripts/verify.mjs   (from the package root)
 * Exit code 0 = pass, 1 = fail.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fail = (msg) => { console.error('✗ ' + msg); process.exitCode = 1 }
const pass = (msg) => console.log('✓ ' + msg)

// 1. syntax check
for (const f of ['lib/index.js', 'lib/client.js', 'scripts/verify.mjs']) {
  const r = spawnSync(process.execPath, ['--check', join(root, f)], { encoding: 'utf8' })
  if (r.status !== 0) fail('syntax ' + f + ': ' + (r.stderr || r.stdout).slice(0, 400))
  else pass('syntax OK: ' + f)
}

// 2. host ESM exports
try {
  const m = await import(join(root, 'lib/index.js'))
  if (typeof m.apply !== 'function') fail('lib/index.js must export apply()')
  if (!Array.isArray(m.inject) || !m.inject.includes('webServer') || !m.inject.includes('tools')) {
    fail('lib/index.js inject must include webServer and tools')
  }
  pass('host exports: apply() + inject ' + JSON.stringify(m.inject))
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
  const m = await import(join(root, 'lib/index.js'))
  m.apply(ctx)
  for (const e of effects) { const d = e.fn(); if (typeof d === 'function') d() }
  const toolNames = registeredTools.map((t) => t.name).sort()
  const routePaths = registeredRoutes.map((r) => r.path).sort()
  const EXPECT_TOOLS = 18
  const EXPECT_ROUTES = ['/dock-api/inspect', '/dock-api/logs', '/dock-api/op', '/dock-api/status', '/dock-api/top', '/dock-api/watch', '/dock-api/watchstop']
  if (registeredTools.length !== EXPECT_TOOLS) fail('expected ' + EXPECT_TOOLS + ' tools, got ' + registeredTools.length)
  else pass('host registers ' + EXPECT_TOOLS + ' tools')
  const missingRoutes = EXPECT_ROUTES.filter((p) => !routePaths.includes(p))
  if (missingRoutes.length) fail('missing routes: ' + missingRoutes.join(', '))
  else pass('host registers 7 /dock-api/* routes')
} catch (e) {
  fail('apply() smoke: ' + String((e && e.message) || e))
}

// 4. best-effort real docker call through the docker_info tool
try {
  const m = await import(join(root, 'lib/index.js'))
  m.apply({ get: () => undefined, effect: () => {}, on() {} })
  // tools were registered through effects above; re-run apply with a tools mock
  const tools2 = []
  const ctx2 = {
    get(name) {
      if (name === 'tools') return { register: (t) => { tools2.push(t); return () => {} } }
      if (name === 'webServer') return { register: () => () => {} }
      return undefined
    },
    effect(fn) {
      // 执行 effect 并立即调用其 disposer,避免 idle sweep 的 setInterval 让进程挂起
      const d = fn()
      if (typeof d === 'function') d()
    },
    on() {},
  }
  m.apply(ctx2)
  const infoTool = tools2.find((t) => t.name === 'docker_info')
  if (infoTool) {
    const out = await infoTool.execute({}, {})
    if (out && out.ok && out.serverVersion) pass('docker_info tool works against live daemon (' + out.serverVersion + ')')
    else fail('docker_info tool failed: ' + ((out && out.error) || 'unknown'))
  }
} catch (e) {
  fail('docker_info execution: ' + String((e && e.message) || e))
}

// 5. client bundle in a vm sandbox
try {
  const src = readFileSync(join(root, 'lib/client.js'), 'utf8')
  let loaded = null
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
    require: (name) => {
      if (name === 'react') {
        const noop = () => {}
        return {
          createElement: () => ({}),
          useState: () => [null, noop],
          useEffect: () => {},
          useCallback: (fn) => fn,
          useRef: () => ({ current: {} }),
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
  pass('client bundle executes in browser sandbox (id + apply/inject OK)')
} catch (e) {
  fail('client bundle: ' + String((e && e.message) || e))
}

if (!process.exitCode) console.log('\nAll checks passed ✔')
