// QuickEats: the whole UI. State lives in one object; every change calls render().
const TIP_OPTIONS = [0, 0.1, 0.15, 0.2]
const ORDER_STEPS = ['Order received', 'Preparing your food', 'Out for delivery', 'Delivered']
const STEP_SECONDS = 6   // demo speed: each delivery step takes a few seconds

const state = {
  view: 'home',            // home | restaurant | checkout | tracking
  restaurantId: null,
  query: '',
  category: 'All',
  sort: 'recommended',     // recommended | rating | eta | fee
  cart: createCart(),
  cartOpen: false,
  address: '1 Market St, San Francisco',
  tipRate: 0.15,
  order: null,             // { id, restaurantId, lines, price, placedAt, step }
  toast: '',
}

const root = document.getElementById('app')

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function visibleRestaurants() {
  const q = state.query.trim()
  const list = RESTAURANTS.filter((r) =>
    (state.category === 'All' || r.category === state.category) &&
    (!q || r.name.includes(q) || r.category.includes(q) ||
      r.menu.some((m) => m.name.includes(q))))
  const by = {
    recommended: (a, b) => b.rating * Math.log(b.reviews) - a.rating * Math.log(a.reviews),
    rating: (a, b) => b.rating - a.rating,
    eta: (a, b) => a.etaMin - b.etaMin,
    fee: (a, b) => a.deliveryFee - b.deliveryFee,
  }
  return list.sort(by[state.sort])
}

// ---------------------------------------------------------------- views

function header() {
  const n = cartCount(state.cart)
  return `
    <header class="topbar">
      <button class="logo" data-action="home">Quick<b>Eats</b></button>
      <div class="address">📍 <input data-bind="address" value="${esc(state.address)}" aria-label="Delivery address" /></div>
      <button class="cart-btn" data-action="open-cart">🛒 Cart${n ? ` <span class="badge">${n}</span>` : ''}</button>
    </header>`
}

function homeView() {
  const list = visibleRestaurants()
  return `
    <section class="hero">
      <h1>Hungry? We've got you.</h1>
      <input class="search" data-bind="query" placeholder="Search restaurants or dishes" value="${esc(state.query)}" />
    </section>
    <nav class="chips">
      ${CATEGORIES.map((c) => `<button class="chip ${c === state.category ? 'on' : ''}" data-action="category" data-value="${c}">${c}</button>`).join('')}
      <select class="sort" data-bind="sort" aria-label="Sort">
        ${[['recommended', 'Recommended'], ['rating', 'Top rated'], ['eta', 'Fastest'], ['fee', 'Lowest fee']]
          .map(([v, l]) => `<option value="${v}" ${v === state.sort ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </nav>
    <section class="grid">
      ${list.length ? list.map(card).join('') : `<p class="empty">No restaurants match “${esc(state.query)}”.</p>`}
    </section>`
}

function card(r) {
  return `
    <button class="card" data-action="open-restaurant" data-value="${r.id}">
      <div class="card-img" style="background:${r.color}">${r.emoji}</div>
      <div class="card-body">
        <div class="row"><b>${esc(r.name)}</b><span class="rating">${r.rating.toFixed(1)}</span></div>
        <div class="muted">${r.category} · ${r.etaMin}–${r.etaMax} min · ${r.deliveryFee ? money(r.deliveryFee) + ' delivery' : 'Free delivery'}</div>
      </div>
    </button>`
}

function restaurantView() {
  const r = findRestaurant(state.restaurantId)
  const sections = [...new Set(r.menu.map((m) => m.section))]
  const popular = r.menu.filter((m) => m.popular)
  return `
    <div class="banner" style="background:${r.color}"><span>${r.emoji}</span></div>
    <section class="rest-head">
      <button class="back" data-action="home">← All restaurants</button>
      <h1>${esc(r.name)}</h1>
      <p class="muted">★ ${r.rating.toFixed(1)} (${r.reviews.toLocaleString()} ratings) · ${r.category} · ${r.etaMin}–${r.etaMax} min ·
        ${r.deliveryFee ? money(r.deliveryFee) + ' delivery' : 'Free delivery'} · ${money(r.minOrder)} minimum</p>
    </section>
    ${popular.length ? `<h2 class="section">Popular</h2><div class="menu">${popular.map((m) => menuItem(r, m)).join('')}</div>` : ''}
    ${sections.map((s) => `
      <h2 class="section">${esc(s)}</h2>
      <div class="menu">${r.menu.filter((m) => m.section === s).map((m) => menuItem(r, m)).join('')}</div>`).join('')}`
}

function menuItem(r, m) {
  const qty = state.cart.restaurantId === r.id ? state.cart.lines[m.id] || 0 : 0
  return `
    <div class="item">
      <div>
        <b>${esc(m.name)}</b>
        <p class="muted">${esc(m.desc)}</p>
        <span>${money(m.price)}</span>
      </div>
      ${qty
        ? `<div class="stepper">
             <button data-action="qty" data-value="${m.id}" data-delta="-1" aria-label="Remove one">−</button>
             <span>${qty}</span>
             <button data-action="qty" data-value="${m.id}" data-delta="1" aria-label="Add one">+</button>
           </div>`
        : `<button class="add" data-action="add" data-value="${m.id}" aria-label="Add ${esc(m.name)}">+</button>`}
    </div>`
}

function cartLines() {
  const r = findRestaurant(state.cart.restaurantId)
  return Object.entries(state.cart.lines).map(([id, qty]) => {
    const m = findItem(r, id)
    return `
      <div class="line">
        <div class="stepper small">
          <button data-action="qty" data-value="${id}" data-delta="-1">−</button><span>${qty}</span><button data-action="qty" data-value="${id}" data-delta="1">+</button>
        </div>
        <span class="grow">${esc(m.name)}</span>
        <span>${money(m.price * qty)}</span>
      </div>`
  }).join('')
}

function cartDrawer() {
  if (!state.cartOpen) return ''
  const r = findRestaurant(state.cart.restaurantId)
  const p = priceCart(state.cart, 0)
  return `
    <div class="scrim" data-action="close-cart"></div>
    <aside class="drawer">
      <div class="row"><h2>Your cart</h2><button class="x" data-action="close-cart" aria-label="Close">✕</button></div>
      ${r ? `
        <p class="muted">From <b>${esc(r.name)}</b></p>
        ${cartLines()}
        <div class="row total"><span>Subtotal</span><b>${money(p.subtotal)}</b></div>
        ${p.subtotal < r.minOrder ? `<p class="note">Add ${money(r.minOrder - p.subtotal)} more to avoid a ${money(SMALL_ORDER_FEE)} small-order fee.</p>` : ''}
        <button class="primary" data-action="checkout">Go to checkout</button>
        <button class="link" data-action="clear-cart">Clear cart</button>`
      : `<p class="empty">Your cart is empty. Add something tasty!</p>`}
    </aside>`
}

function checkoutView() {
  const r = findRestaurant(state.cart.restaurantId)
  if (!r) return `<p class="empty">Your cart is empty. <button class="link" data-action="home">Browse restaurants</button></p>`
  const p = priceCart(state.cart, state.tipRate)
  const row = (label, v) => (v ? `<div class="row"><span>${label}</span><span>${money(v)}</span></div>` : '')
  return `
    <section class="checkout">
      <button class="back" data-action="back-to-restaurant">← Back to ${esc(r.name)}</button>
      <h1>Checkout</h1>
      <div class="panel">
        <h3>Delivery address</h3>
        <input class="field" data-bind="address" value="${esc(state.address)}" />
        <p class="muted">Arrives in ${r.etaMin}–${r.etaMax} min</p>
      </div>
      <div class="panel">
        <h3>Order from ${esc(r.name)}</h3>
        ${cartLines()}
      </div>
      <div class="panel">
        <h3>Tip your courier</h3>
        <div class="tips">
          ${TIP_OPTIONS.map((t) => `<button class="chip ${t === state.tipRate ? 'on' : ''}" data-action="tip" data-value="${t}">${t ? Math.round(t * 100) + '%' : 'None'}</button>`).join('')}
        </div>
      </div>
      <div class="panel">
        ${row('Subtotal', p.subtotal)}
        ${p.delivery ? row('Delivery fee', p.delivery) : '<div class="row"><span>Delivery fee</span><span>Free</span></div>'}
        ${row('Service fee', p.service)}
        ${row('Small order fee', p.smallOrder)}
        ${row('Tax', p.tax)}
        ${row('Tip', p.tip)}
        <div class="row total"><b>Total</b><b>${money(p.total)}</b></div>
      </div>
      <button class="primary" data-action="place-order" ${state.address.trim() ? '' : 'disabled'}>Place order · ${money(p.total)}</button>
    </section>`
}

function trackingView() {
  const o = state.order
  const r = findRestaurant(o.restaurantId)
  const left = Math.max(0, (ORDER_STEPS.length - 1 - o.step) * STEP_SECONDS)
  return `
    <section class="checkout">
      <h1>${o.step === ORDER_STEPS.length - 1 ? 'Enjoy your meal! 🎉' : 'Your order is on its way'}</h1>
      <p class="muted">Order ${o.id} from ${esc(r.name)} · ${money(o.price.total)} · to ${esc(o.address)}</p>
      <ol class="steps">
        ${ORDER_STEPS.map((s, i) => `<li class="${i < o.step ? 'done' : i === o.step ? 'now' : ''}">${s}</li>`).join('')}
      </ol>
      ${left ? `<p class="eta">About ${left} seconds left (demo time)</p>` : ''}
      <button class="primary" data-action="home">Order something else</button>
    </section>`
}

function render() {
  // Keep focus and caret in a bound input across the innerHTML rebuild.
  const active = document.activeElement
  const bound = active && active.dataset ? active.dataset.bind : null
  const caret = bound ? active.selectionStart : null

  const body = { home: homeView, restaurant: restaurantView, checkout: checkoutView, tracking: trackingView }[state.view]()
  root.innerHTML = `${header()}<main>${body}</main>${cartDrawer()}${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ''}`

  if (bound) {
    const el = root.querySelector(`[data-bind="${bound}"]`)
    if (el) { el.focus(); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret) }
  }
}

// ---------------------------------------------------------------- actions

let toastTimer
function toast(msg) {
  state.toast = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { state.toast = ''; render() }, 2200)
}

function go(view) {
  state.view = view
  state.cartOpen = false
  window.scrollTo(0, 0)
}

let trackTimer
function placeOrder() {
  const price = priceCart(state.cart, state.tipRate)
  state.order = {
    id: '#' + Math.floor(100000 + Math.random() * 900000),
    restaurantId: state.cart.restaurantId,
    lines: { ...state.cart.lines },
    address: state.address,
    price,
    step: 0,
  }
  console.log('Order placed', state.order.id, money(price.total))
  clearCart(state.cart)
  go('tracking')
  clearInterval(trackTimer)
  trackTimer = setInterval(() => {
    state.order.step++
    console.log('Order status:', ORDER_STEPS[state.order.step])
    if (state.order.step >= ORDER_STEPS.length - 1) clearInterval(trackTimer)
    if (state.view === 'tracking') render()
  }, STEP_SECONDS * 1000)
}

const actions = {
  home: () => go('home'),
  category: (v) => { state.category = v },
  'open-restaurant': (v) => { state.restaurantId = v; go('restaurant') },
  'back-to-restaurant': () => { state.restaurantId = state.cart.restaurantId; go('restaurant') },
  add: (v) => {
    if (!addToCart(state.cart, state.restaurantId, v)) {
      const other = findRestaurant(state.cart.restaurantId)
      if (!confirm(`Your cart has items from ${other.name}. Start a new cart?`)) return
      clearCart(state.cart)
      addToCart(state.cart, state.restaurantId, v)
    }
    toast(`Added ${findItem(findRestaurant(state.restaurantId), v).name}`)
  },
  qty: (v, el) => setQuantity(state.cart, v, (state.cart.lines[v] || 0) + Number(el.dataset.delta)),
  'open-cart': () => { state.cartOpen = true },
  'close-cart': () => { state.cartOpen = false },
  'clear-cart': () => clearCart(state.cart),
  checkout: () => go('checkout'),
  tip: (v) => { state.tipRate = Number(v) },
  'place-order': placeOrder,
}

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]')
  if (!el) return
  actions[el.dataset.action](el.dataset.value, el)
  render()
})

root.addEventListener('input', (e) => {
  const key = e.target.dataset.bind
  if (!key) return
  state[key] = e.target.value
  render()
})

render()
console.log(`QuickEats ready: ${RESTAURANTS.length} restaurants`)
