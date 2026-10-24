// The playground's codebase (a food-delivery app) and how to run it in the browser.
import appJs from './eats/app.js?raw'
import cartJs from './eats/cart.js?raw'
import dataJs from './eats/data.js?raw'
import indexHtml from './eats/index.html?raw'
import stylesCss from './eats/styles.css?raw'

export type Files = Record<string, string>

// Order is the order of the file tabs.
export const ORIGINAL: Files = {
  'index.html': indexHtml,
  'app.js': appJs,
  'cart.js': cartJs,
  'data.js': dataJs,
  'styles.css': stylesCss,
}

export interface LogLine {
  level: 'log' | 'info' | 'warn' | 'error'
  text: string
}

// Runs inside the preview before the app: forwards console output and uncaught errors to the playground.
const BRIDGE = `
(function () {
  function fmt(v) {
    if (v instanceof Error) return v.stack || String(v)
    if (typeof v === 'object' && v !== null) { try { return JSON.stringify(v) } catch (e) { return String(v) } }
    return String(v)
  }
  function send(level, args) {
    parent.postMessage({ __playground: true, level: level, text: Array.prototype.map.call(args, fmt).join(' ') }, '*')
  }
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var orig = console[level]
    console[level] = function () { send(level, arguments); orig.apply(console, arguments) }
  })
  // Error line numbers are in the bundled document; map them back to the source file.
  var ranges = __RANGES__
  function where(line) {
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i]
      if (line >= r[1] && line <= r[2]) return ' (' + r[0] + ':' + (line - r[1] + 1) + ')'
    }
    return ''
  }
  window.addEventListener('error', function (e) {
    send('error', [e.message + (e.lineno ? where(e.lineno) : '')])
  })
  window.addEventListener('unhandledrejection', function (e) { send('error', ['Unhandled promise rejection: ' + fmt(e.reason)]) })
  // Lets the playground type into the app's search box (the challenge's "Reproduce" button).
  window.addEventListener('message', function (e) {
    if (e.source !== parent || !e.data || e.data.__playgroundSearch == null) return
    var home = document.querySelector('[data-action="home"]')
    if (home) home.click()
    var box = document.querySelector('[data-bind="query"]')
    if (!box) return
    box.value = e.data.__playgroundSearch
    box.dispatchEvent(new Event('input', { bubbles: true }))
  })
})()
`

const START = (name: string) => `/*@file ${name}*/`
const inlineScript = (code: string, name: string) =>
  `<script>${START(name)}${code.replace(/<\/script/gi, '<\\/script')}\n//# sourceURL=${name}\n</script>`

/** Builds one self-contained HTML document: index.html with its local stylesheets and scripts inlined. */
export function bundle(files: Files): string {
  let html = files['index.html'] ?? ''
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (tag, href: string) =>
    href in files ? `<style>${files[href].replace(/<\/style/gi, '<\\/style')}</style>` : tag)
  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (tag, src: string) =>
    src in files ? inlineScript(files[src], src) : tag)
  const bridge = inlineScript(BRIDGE, 'playground-console.js')
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + bridge) : bridge + html

  // Now that every line is in place, record where each file starts (1-based document lines).
  // Filling in __RANGES__ stays on one line, so it doesn't move anything.
  const lineOf = (i: number) => html.slice(0, i).split('\n').length
  const ranges = Object.keys(files).flatMap((name) => {
    const i = html.indexOf(START(name))
    return i < 0 ? [] : [[name, lineOf(i), lineOf(i) + files[name].split('\n').length - 1]]
  })
  return html.replace('__RANGES__', () => JSON.stringify(ranges))
}
