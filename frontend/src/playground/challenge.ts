// The playground's challenge: make the restaurant search case-insensitive.
// The check is black-box: it types into the app's real search box and reads the cards shown,
// so any correct fix passes, wherever in the code it is made.
import { bundle } from './project'
import type { Files } from './project'

export const CHALLENGE = {
  title: 'Search misses results that are typed in lowercase',
  report:
    '“I typed “burger barn” into the search bar and got “No restaurants match”. ' +
    'Burger Barn is right there on the home page! Searching “sushi” finds nothing either.”',
  task: 'Find the code that makes the search case-sensitive and change it so the search ignores case. ' +
    'Typing “burger barn”, “BURGER BARN” or “Burger Barn” should all find Burger Barn.',
  reproduce: [
    'Click ▶ Run so the app on the right is running your current code.',
    'In the app, type burger barn (all lowercase) into the search bar.',
    'Expected: the Burger Barn card. Actual: “No restaurants match”.',
    'Now type Burger Barn with capitals. It shows up, so the search only fails when the case differs.',
  ],
  reproduceQuery: 'burger barn',
  hints: [
    'Search filtering happens in one function in app.js. Find what runs when the search text changes.',
    'Look at how the search text is compared with the restaurant, category and dish names. What happens to capital letters?',
    'Compare both sides in the same case, for example by lower-casing the query and each name before calling includes().',
  ],
  rules: 'Search should still filter: “sushi” must show only Kaiten Sushi, and nonsense like “xyz” must show nothing.',
}

export interface TestResult {
  name: string
  pass: boolean
  detail: string
}

// Runs inside a hidden copy of the app after it starts. Each case types a query and checks the cards.
const TESTS = `
(function () {
  var CASES = [
    ['Lowercase restaurant name: "burger barn"', 'burger barn', ['Burger Barn'], false],
    ['Uppercase restaurant name: "BURGER BARN"', 'BURGER BARN', ['Burger Barn'], false],
    ['Original casing still works: "Burger Barn"', 'Burger Barn', ['Burger Barn'], false],
    ['Lowercase category: "sushi"', 'sushi', ['Kaiten Sushi'], true],
    ['Mixed-case dish name: "sPiCy TuNa"', 'sPiCy TuNa', ['Kaiten Sushi'], true],
    ['Lowercase category: "mexican"', 'mexican', ['La Taquería'], true],
    ['Search still filters: "xyz" shows nothing', 'xyz', [], true],
  ]
  function names() {
    return Array.prototype.map.call(document.querySelectorAll('.card b'), function (b) { return b.textContent })
  }
  function type(text) {
    var box = document.querySelector('[data-bind="query"]')   // re-query: render() replaces the element
    if (!box) throw new Error('could not find the search box on the home page')
    box.value = text
    box.dispatchEvent(new Event('input', { bubbles: true }))
  }
  function run() {
    window.confirm = function () { return true }
    var results = CASES.map(function (c) {
      var name = c[0], query = c[1], want = c[2], exact = c[3]
      try {
        var home = document.querySelector('[data-action="home"]'); if (home) home.click()
        var all = document.querySelector('[data-action="category"][data-value="All"]'); if (all) all.click()
        type(query)
        var got = names()
        var pass = exact
          ? got.length === want.length && want.every(function (w) { return got.indexOf(w) >= 0 })
          : want.every(function (w) { return got.indexOf(w) >= 0 })
        var shown = got.length ? got.join(', ') : 'no restaurants'
        return { name: name, pass: pass, detail: pass ? 'Showed ' + shown : 'Expected ' + (want.length ? want.join(', ') + (exact ? ' only' : '') : 'no restaurants') + ', but the app showed ' + shown }
      } catch (e) {
        return { name: name, pass: false, detail: 'Error: ' + (e && e.message ? e.message : e) }
      }
    })
    parent.postMessage({ __challenge: true, results: results }, '*')
  }
  window.addEventListener('load', function () { setTimeout(run, 0) })
})()
`

/** The user's app plus the test script, as one document to load in a hidden iframe. */
export function testBundle(files: Files): string {
  const html = bundle(files)
  const script = `<script>${TESTS}</script>`
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => script + '</body>') : html + script
}
