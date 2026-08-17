/**
 * Full Docker integration smoke test for dsh-plugin-container v1.0.0.
 *
 * This is a REAL Docker test: it creates/deletes sandbox containers and a
 * socat echo container, uses docker cp, docker commit snapshots, background
 * jobs, network policy changes and a real localhost port-forward proxy.
 * Everything is namespaced with dsh-smoke-* and cleaned in a finally block.
 *
 * Usage: node scripts/smoke.mjs
 * Requires: docker CLI + reachable Docker Engine, and a local `nc` binary.
 */
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const hostEntry = join(root, 'dsh-plugin-container', 'lib', 'index.js')

const suite = []
const pass = (msg) => { console.log('✓ ' + msg); suite.push(msg) }
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 1. build lib/ from src/ before testing
execFileSync(process.execPath, [join(root, 'scripts', 'prepare.mjs')], { stdio: 'inherit' })

// 2. register the real plugin host
const { apply } = await import(hostEntry)
const tools = []
const effects = []
const ctx = {
  get(name) {
    if (name === 'tools') return { register: (t) => { tools.push(t); return () => {} } }
    if (name === 'webServer') return { register: () => () => {} }
    return undefined
  },
  effect(fn) { effects.push(fn) },
  on() {},
}
apply(ctx)
for (const fn of effects) {
  const d = fn()
  if (typeof d === 'function') d()
}
const tool = (name) => tools.find((t) => t.name === name)
assert(tools.length === 39, '39 tools registered, got ' + tools.length)
const SESSION = 'smoke-' + Date.now().toString(36)
const exec = { agent: { id: SESSION }, signal: undefined }
const run = (name, args) => tool(name).execute(args || {}, exec)

const stamp = Date.now().toString(36)
const mainName = 'dsh-smoke-main-' + stamp
const parallelName = 'dsh-smoke-para-' + stamp
const echoName = 'dsh-smoke-echo-' + stamp
const smokeDir = join(root, 'scripts', '.smoke-tmp')
const upFile = join(smokeDir, 'up.txt')
const downFile = join(smokeDir, 'down.txt')
let snapshotName = null
let tunnelId = null

async function cleanup() {
  const names = [mainName, parallelName, echoName]
  for (const n of names) {
    try { await execFileP('docker', ['rm', '-f', n], { timeout: 60000 }) } catch (e) { /* ignore */ }
  }
  if (tunnelId) {
    try { await run('docker_port_forward_stop', { tunnel_id: tunnelId }) } catch (e) { /* ignore */ }
  }
  const pf = await execFileP('docker', ['ps', '-a', '--format', '{{.Names}}'], { timeout: 60000 }).catch(() => ({ stdout: '' }))
  for (const line of String(pf.stdout || '').split('\n')) {
    const n = line.trim()
    if (n && n.startsWith('dsh-pf-')) {
      try { await execFileP('docker', ['rm', '-f', n], { timeout: 60000 }) } catch (e) { /* ignore */ }
    }
  }
  if (snapshotName) {
    try { await run('docker_snapshot_delete', { snapshot: snapshotName }) } catch (e) { /* ignore */ }
  }
  const images = await execFileP('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}'], { timeout: 60000 }).catch(() => ({ stdout: '' }))
  for (const line of String(images.stdout || '').split('\n')) {
    const n = line.trim()
    if (n && n.startsWith('dsh-snap-')) {
      try { await execFileP('docker', ['rmi', '-f', n], { timeout: 60000 }) } catch (e) { /* ignore */ }
    }
  }
  rmSync(smokeDir, { recursive: true, force: true })
}

try {
  mkdirSync(smokeDir, { recursive: true })
  writeFileSync(upFile, 'dsh-upload-' + stamp + '\n')

  // ---- daemon / info / list ----
  const info = await run('docker_info')
  assert(info && info.ok && info.serverVersion, 'docker_info returns serverVersion')
  pass('docker_info live OK (server ' + info.serverVersion + ')')
  const ps = await run('docker_ps', { all: true })
  assert(ps.ok && Array.isArray(ps.items), 'docker_ps returns items')
  pass('docker_ps OK (' + ps.count + ' containers before smoke)')

  // ---- create / status / custom resources ----
  const created = await run('docker_create', {
    image: 'alpine',
    name: mainName,
    command: 'sleep 3600',
    cpus: '1',
    memory: '256m',
    shm_size: '64m',
    init_script: null,
  })
  assert(created.ok && created.container === mainName, 'docker_create failed: ' + JSON.stringify(created))
  pass('docker_create OK (' + mainName + ', cpus/memory/shm_size)')
  await sleep(1200)
  const st = await run('docker_status', { container: mainName })
  assert(st.ok && st.data && st.data.state && st.data.state.Status === 'running', 'docker_status expects running')
  assert(st.data.owner && st.data.owner.sessionId === SESSION, 'owner session mismatch')
  pass('docker_status OK (owner + runtime + config)')

  // ---- parallel docker_exec ----
  const p2 = await run('docker_create', { image: 'alpine', name: parallelName, command: 'sleep 3600' })
  assert(p2.ok, 'second container create failed')
  await sleep(1000)
  const para = await run('docker_exec', { containers: [mainName, parallelName], command: 'echo para-$HOSTNAME' })
  assert(para.ok && para.parallel && para.results.length === 2 && para.results.every((r) => r.exitCode === 0), 'parallel exec failed: ' + JSON.stringify(para))
  pass('docker_exec parallel OK (2 containers)')

  // ---- lifecycle ----
  assert((await run('docker_stop', { container: mainName })).ok, 'docker_stop failed')
  assert((await run('docker_start', { container: mainName })).ok, 'docker_start failed')
  assert((await run('docker_restart', { container: mainName })).ok, 'docker_restart failed')
  await sleep(1000)
  pass('docker_stop / start / restart OK')

  // ---- upload / download ----
  const up = await run('docker_upload', { container: mainName, local_path: join('scripts', '.smoke-tmp', 'up.txt'), remote_path: '/tmp/dsh-smoke-up.txt' })
  assert(up.ok, 'docker_upload failed: ' + JSON.stringify(up))
  const down = await run('docker_download', { container: mainName, remote_path: '/tmp/dsh-smoke-up.txt', local_path: join('scripts', '.smoke-tmp', 'down.txt') })
  assert(down.ok, 'docker_download failed: ' + JSON.stringify(down))
  assert(readFileSync(downFile, 'utf8').includes('dsh-upload-' + stamp), 'downloaded content mismatch')
  pass('docker_upload / docker_download OK')

  // ---- background jobs ----
  const job = await run('docker_job_submit', { container: mainName, command: 'for i in 1 2 3; do echo job-$i; sleep 1; done' })
  assert(job.ok && job.job && job.job.id, 'docker_job_submit failed: ' + JSON.stringify(job))
  let jobStatus = null
  for (let i = 0; i < 15; i++) {
    await sleep(1000)
    jobStatus = await run('docker_job_status', { job_id: job.job.id })
    if (jobStatus.job.status === 'done') break
  }
  assert(jobStatus.job.status === 'done', 'background job did not finish: ' + JSON.stringify(jobStatus))
  const jobList = await run('docker_job_list', { container: mainName, limit: 10 })
  assert(jobList.ok && jobList.jobs.length >= 1, 'docker_job_list missing job')
  const jobOut = await run('docker_job_output', { job_id: job.job.id })
  assert(jobOut.log.includes('job-3'), 'docker_job_output missing tail: ' + jobOut.log)
  const longJob = await run('docker_job_submit', { container: mainName, command: 'sleep 300; echo long-done' })
  assert(longJob.ok && longJob.job.status === 'running', 'long job should start running')
  const stoppedJob = await run('docker_job_stop', { job_id: longJob.job.id })
  assert(stoppedJob.ok && stoppedJob.job.status === 'stopped', 'docker_job_stop failed')
  const listAfterStop = await run('docker_job_list', { container: mainName, limit: 20 })
  const listedStopped = listAfterStop.jobs.find((j) => j.id === longJob.job.id)
  assert(listedStopped && listedStopped.status === 'stopped' && listedStopped.endTime != null, 'stopped job must remain stopped in job list: ' + JSON.stringify(listedStopped))
  pass('docker_job_submit / list / status / output / stop OK')

  // ---- real port forwarding (socat echo) ----
  const echoRun = await run('docker_cli', { args: ['run', '-d', '--name', echoName, 'alpine/socat', 'tcp-listen:23456,fork,reuseaddr', 'exec:cat'] })
  assert(echoRun.ok, 'docker_cli echo container failed: ' + JSON.stringify(echoRun))
  await sleep(1200)
  const pf = await run('docker_port_forward', { container: echoName, container_port: 23456 })
  assert(pf.ok && pf.tunnel && pf.tunnel.hostPort, 'docker_port_forward failed: ' + JSON.stringify(pf))
  tunnelId = pf.tunnel.id
  await sleep(1200)
  const echoBack = await execFileP('sh', ['-lc', `printf 'ping-${stamp}\\n' | nc -w 4 127.0.0.1 ${pf.tunnel.hostPort}`], { timeout: 10000 })
  assert(String(echoBack.stdout || '').includes('ping-' + stamp), 'port-forward echo mismatch: ' + String(echoBack.stdout))
  const pfList = await run('docker_port_forward_list')
  assert(pfList.ok && pfList.tunnels.some((t) => t.id === tunnelId), 'docker_port_forward_list missing tunnel')
  pass('docker_port_forward / list / live echo OK')
  assert((await run('docker_port_forward_stop', { tunnel_id: tunnelId })).ok, 'docker_port_forward_stop failed')
  tunnelId = null
  pass('docker_port_forward_stop OK')

  // ---- snapshots / restore ----
  await run('docker_exec', { container: mainName, command: 'echo before > /tmp/snapshot-marker' })
  const snap = await run('docker_snapshot', { container: mainName, note: 'smoke snapshot ' + stamp })
  assert(snap.ok && snap.snapshot && snap.snapshot.name, 'docker_snapshot failed: ' + JSON.stringify(snap))
  snapshotName = snap.snapshot.name
  await run('docker_exec', { container: mainName, command: 'rm -f /tmp/snapshot-marker && echo after > /tmp/after-marker' })
  const snapList = await run('docker_snapshot_list')
  assert(snapList.ok && snapList.own.some((s) => s.name === snapshotName), 'docker_snapshot_list missing snapshot')
  const restored = await run('docker_restore', { snapshot: snapshotName })
  assert(restored.ok && restored.state === 'running', 'docker_restore failed: ' + JSON.stringify(restored))
  await sleep(1500)
  const afterRestore = await run('docker_exec', { container: mainName, command: 'test -f /tmp/snapshot-marker && echo restored-ok' })
  assert(String(afterRestore.stdout || '').includes('restored-ok'), 'restored snapshot marker missing: ' + JSON.stringify(afterRestore))
  pass('docker_snapshot / snapshot_list / restore OK')
  assert((await run('docker_snapshot_delete', { snapshot: snapshotName })).ok, 'docker_snapshot_delete failed')
  snapshotName = null
  pass('docker_snapshot_delete OK')

  // ---- sharing / unshare / policy ----
  const other = 'smoke-other-' + stamp
  const share = await run('docker_share', { container: mainName, session: other, mode: 'exec' })
  assert(share.ok && share.sharedWith.some((s) => s.sessionId === other), 'docker_share failed')
  const sharedExec = await tool('docker_exec').execute({ container: mainName, command: 'echo shared-ok' }, { agent: { id: other }, signal: undefined })
  assert(sharedExec.exitCode === 0, 'shared session cannot exec: ' + JSON.stringify(sharedExec))
  pass('docker_share + shared exec OK')
  assert((await run('docker_unshare', { container: mainName, session: other })).ok, 'docker_unshare failed')
  pass('docker_unshare OK')
  const policy = await run('docker_policy', { max_containers: 6, idle_sleep_minutes: 60, idle_delete_days: 0 })
  assert(policy.ok && policy.policy.maxContainers === 6, 'docker_policy set failed')
  pass('docker_policy get/set OK')

  // ---- network policy ----
  const net0 = await run('docker_network_policy', { container: mainName })
  assert(net0.ok && net0.networks.length >= 1, 'docker_network_policy status failed')
  const netOff = await run('docker_network_policy', { container: mainName, public_access: false, internal_access: true })
  assert(netOff.ok && netOff.policy.publicAccess === false, 'docker_network_policy set failed')
  await sleep(500)
  const net1 = await run('docker_network_policy', { container: mainName })
  assert(net1.networks.some((n) => n.name === 'dsh-sandbox-internal'), 'internal network not applied')
  pass('docker_network_policy public_access=false OK')
  const netOn = await run('docker_network_policy', { container: mainName, public_access: true, internal_access: true })
  assert(netOn.ok && netOn.policy.publicAccess === true, 'docker_network_policy restore failed')
  pass('docker_network_policy restore OK')

  // ---- audit ----
  const audit = await run('docker_audit', { operation: 'docker_create', limit: 50 })
  assert(audit.ok && audit.entries.length >= 2 && audit.entries.every((e) => e.sessionId === SESSION), 'docker_audit missing docker_create entries')
  pass('docker_audit OK (' + audit.entries.length + ' docker_create records)')

  console.log('\nSmoke test passed ✔ (' + suite.length + ' checks)')
} catch (err) {
  console.error('\n✗ Smoke test FAILED:', (err && err.stack) || err)
  process.exitCode = 1
} finally {
  await cleanup()
  // Verify no smoke resources remain.
  try {
    const leftover = execFileSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8' })
    for (const line of leftover.split('\n')) {
      const n = line.trim()
      if (n && (n.startsWith('dsh-smoke-') || n.startsWith('dsh-pf-'))) {
        console.error('✗ leftover smoke resource: ' + n)
        process.exitCode = 1
      }
    }
  } catch (e) { /* docker unavailable */ }
  if (!process.exitCode) console.log('Cleanup verified ✔')
}
