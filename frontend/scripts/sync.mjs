// Runs tools/sync_public.py with the repo's virtualenv Python, on Windows or macOS/Linux.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { NO_VENV_HELP, ROOT, findPython } from './python.mjs'

const python = findPython()
if (!python) {
  console.error(NO_VENV_HELP)
  process.exit(1)
}
const r = spawnSync(python, [join(ROOT, 'tools', 'sync_public.py')], { stdio: 'inherit' })
process.exit(r.status ?? 1)
