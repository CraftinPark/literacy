// Cart and pricing. A cart holds items from one restaurant at a time.
const SERVICE_FEE_RATE = 0.05   // 5% of subtotal, min $1.00
const TAX_RATE = 0.0875
const SMALL_ORDER_FEE = 200     // charged when the subtotal is under the restaurant's minimum

function createCart() {
  return { restaurantId: null, lines: {} }   // lines: itemId -> quantity
}

function findRestaurant(id) {
  return RESTAURANTS.find((r) => r.id === id)
}

function findItem(restaurant, itemId) {
  return restaurant.menu.find((m) => m.id === itemId)
}

function cartCount(cart) {
  return Object.values(cart.lines).reduce((n, q) => n + q, 0)
}

/** Returns false if the item is from a different restaurant than the cart's. */
function addToCart(cart, restaurantId, itemId) {
  if (cart.restaurantId && cart.restaurantId !== restaurantId) return false
  cart.restaurantId = restaurantId
  cart.lines[itemId] = (cart.lines[itemId] || 0) + 1
  return true
}

function setQuantity(cart, itemId, qty) {
  if (qty <= 0) delete cart.lines[itemId]
  else cart.lines[itemId] = qty
  if (cartCount(cart) === 0) cart.restaurantId = null
}

function clearCart(cart) {
  cart.restaurantId = null
  cart.lines = {}
}

function priceCart(cart, tipRate) {
  const r = findRestaurant(cart.restaurantId)
  if (!r) return { subtotal: 0, delivery: 0, service: 0, smallOrder: 0, tax: 0, tip: 0, total: 0 }
  const subtotal = Object.entries(cart.lines)
    .reduce((sum, [id, qty]) => sum + findItem(r, id).price * qty, 0)
  const delivery = r.deliveryFee
  const service = Math.max(100, Math.round(subtotal * SERVICE_FEE_RATE))
  const smallOrder = subtotal < r.minOrder ? SMALL_ORDER_FEE : 0
  const tax = Math.round(subtotal * TAX_RATE)
  const tip = Math.round(subtotal * tipRate)
  return { subtotal, delivery, service, smallOrder, tax, tip, total: subtotal + delivery + service + smallOrder + tax + tip }
}

function money(cents) {
  return '$' + (cents / 100).toFixed(2)
}
