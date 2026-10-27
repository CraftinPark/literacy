// Dev-server bridge for fix-and-quiz exercises: POST /api/exam/<id>/<action> runs
// `python -m fixquiz api <action>` (backend/fixquiz) and returns its JSON reply.
// It stands in for the FastAPI backend, which doesn't exist yet; only `npm run dev` has it.
// The page sends the files edited in its built-in editor; Python reads key.json itself, and
// grading content never passes through here before `complete`. Reports go to literacy/workspace/reports/.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { NO_VENV_HELP, ROOT, findPython } from './python.mjs'

const ACTIONS = new Set(['run', 'complete'])
const MAX_BODY = 4 * 1024 * 1024 // the request carries the candidate's edited files

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) reject(new Error('request too large'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function runPython(python, action, example, body) {
  return new Promise((resolve) => {
    const args = ['-m', 'fixquiz', 'api', action, '--example', example, '--workdir', join(ROOT, 'workspace')]
    const child = spawn(python, args, { cwd: join(ROOT, 'backend') })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => resolve({ code: 1, out: '', err: e.message }))
    child.on('close', (code) => resolve({ code, out, err }))
    child.stdin.end(body || '{}')
  })
}

async function handle(req, res) {
  const m = /^\/(readcode-\d{3,})\/([a-z]+)\/?$/.exec((req.url || '').split('?')[0])
  if (req.method !== 'POST' || !m || !ACTIONS.has(m[2])) return send(res, 404, { error: 'unknown exam endpoint' })
  const example = join(ROOT, 'examples', m[1])
  if (!existsSync(join(example, 'public.json'))) return send(res, 404, { error: `exercise ${m[1]} not found` })
  const python = findPython()
  if (!python) return send(res, 500, { error: NO_VENV_HELP })
  let body
  try {
    body = await readBody(req)
  } catch (e) {
    return send(res, 413, { error: e.message })
  }
  const { code, out, err } = await runPython(python, m[2], example, body)
  let reply
  try {
    reply = JSON.parse(out)
  } catch {
    reply = { error: (err || out || 'the grader produced no output').trim().split('\n').slice(-8).join('\n') }
  }
  send(res, code === 0 ? 200 : 500, reply)
}

export function examApi() {
  return {
    name: 'readcode-exam-api',
    configureServer(server) {
      // Registered before Vite's own middleware, so this wins over the /api proxy.
      server.middlewares.use('/api/exam', (req, res) => {
        handle(req, res).catch((e) => send(res, 500, { error: String(e?.message || e) }))
      })
    },
  }
}
