// Prepare script for @dsh-community/dsh-plugin-container.
// Git installs fetch source and run `prepare`; this builds lib/ from src/.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(root, 'src')
const libDir = join(root, 'lib')

const required = ['index.js', 'client.js', 'types/index.d.ts']
const missing = required.filter((file) => existsSync(join(srcDir, file)) === false)
if (missing.length > 0) {
  console.error(`[dsh-plugin-container] prepare failed: missing src/${missing.join(', src/')}`)
  process.exit(1)
}

rmSync(libDir, { recursive: true, force: true })
mkdirSync(libDir, { recursive: true })
cpSync(srcDir, libDir, { recursive: true })

console.log('[dsh-plugin-container] prepare: built lib/ from src/')
