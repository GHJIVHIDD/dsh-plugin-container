/**
 * Build the release tarball for @dsh-community/dsh-plugin-container.
 *
 * The repository root mirrors the official dsh-plugin-vm-sandbox layout:
 *   repo root  = source install bundle (prepare -> dsh-plugin-container/lib)
 *   dsh-plugin-container/ = installable npm package published as release tgz
 *
 * Output: dist/dsh-plugin-container-<version>.tgz
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkgDir = join(root, 'dsh-plugin-container')
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
const version = pkg.version
const distDir = join(root, 'dist')
const unscopedName = pkg.name.replace(/^@[^/]+\//, '')
const filename = `${unscopedName}-${version}.tgz`
const scopedFilename = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`
const tarball = join(distDir, filename)

mkdirSync(distDir, { recursive: true })
rmSync(tarball, { force: true })
rmSync(join(distDir, scopedFilename), { force: true })

console.log(`[package] npm pack ${pkg.name}@${version} -> ${filename}`)
execFileSync('npm', ['pack', '--pack-destination', distDir], { cwd: pkgDir, stdio: 'inherit' })

if (!existsSync(tarball) && existsSync(join(distDir, scopedFilename))) {
  renameSync(join(distDir, scopedFilename), tarball)
}

if (!existsSync(tarball)) {
  console.error('[package] expected tarball missing:', tarball)
  process.exit(1)
}

// Sanity-check the tarball contents.
const list = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
for (const required of ['package/lib/index.js', 'package/lib/client.js', 'package/lib/types/index.d.ts', 'package/cordis.patch.yml', 'package/package.json']) {
  if (!list.split('\n').some((line) => line.trim() === required)) {
    console.error('[package] tarball missing required entry:', required)
    process.exit(1)
  }
}
console.log('[package] tarball contents OK:\n' + list.split('\n').filter(Boolean).join('\n'))
console.log('[package] release artifact ready: ' + tarball)
