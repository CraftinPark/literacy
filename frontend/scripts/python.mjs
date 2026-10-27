// Finds the repo's virtualenv Python, on Windows or macOS/Linux. Shared by sync.mjs and exam-api.mjs.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const NO_VENV_HELP = `No virtualenv found at ${join(ROOT, '.venv')}. Create it from the repo root:\n` +
  '  python -m venv .venv\n' +
  '  .venv\\Scripts\\python -m pip install -r requirements.txt   (Windows)\n' +
  '  .venv/bin/python -m pip install -r requirements.txt       (macOS/Linux)'

export function findPython() {
  const candidates = [
    join(ROOT, '.venv', 'Scripts', 'python.exe'), // Windows venv
    join(ROOT, '.venv', 'bin', 'python'), // macOS/Linux venv
  ]
  return candidates.find(existsSync) ?? null
}
