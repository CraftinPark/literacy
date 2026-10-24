// Restaurants and menus. Prices are in cents to avoid floating-point rounding.
const CATEGORIES = ['All', 'Pizza', 'Burgers', 'Sushi', 'Mexican', 'Healthy', 'Dessert']

const RESTAURANTS = [
  {
    id: 'r1', name: 'Slice Republic', category: 'Pizza', emoji: '🍕', color: '#F6D7B0',
    rating: 4.7, reviews: 1820, etaMin: 20, etaMax: 30, deliveryFee: 199, minOrder: 1000,
    menu: [
      { id: 'r1-1', section: 'Pizzas', name: 'Margherita', desc: 'San Marzano tomato, fior di latte, basil', price: 1450, popular: true },
      { id: 'r1-2', section: 'Pizzas', name: 'Pepperoni', desc: 'Cup-and-char pepperoni, mozzarella', price: 1650, popular: true },
      { id: 'r1-3', section: 'Pizzas', name: 'Funghi', desc: 'Roasted mushrooms, thyme, garlic oil', price: 1595 },
      { id: 'r1-4', section: 'Sides', name: 'Garlic knots', desc: 'Six knots with marinara', price: 650 },
      { id: 'r1-5', section: 'Sides', name: 'Caesar salad', desc: 'Romaine, parmesan, croutons', price: 895 },
      { id: 'r1-6', section: 'Drinks', name: 'Sparkling lemonade', desc: '12 oz can', price: 325 },
    ],
  },
  {
    id: 'r2', name: 'Burger Barn', category: 'Burgers', emoji: '🍔', color: '#F4C7A1',
    rating: 4.5, reviews: 2604, etaMin: 15, etaMax: 25, deliveryFee: 0, minOrder: 800,
    menu: [
      { id: 'r2-1', section: 'Burgers', name: 'Classic smash', desc: 'Two patties, American cheese, pickles', price: 1195, popular: true },
      { id: 'r2-2', section: 'Burgers', name: 'Bacon BBQ', desc: 'Smoked bacon, cheddar, onion rings', price: 1395 },
      { id: 'r2-3', section: 'Burgers', name: 'Crispy chicken', desc: 'Buttermilk thigh, slaw, hot honey', price: 1295, popular: true },
      { id: 'r2-4', section: 'Sides', name: 'Fries', desc: 'Skin-on, sea salt', price: 450 },
      { id: 'r2-5', section: 'Shakes', name: 'Vanilla shake', desc: 'Made with real ice cream', price: 595 },
    ],
  },
  {
    id: 'r3', name: 'Kaiten Sushi', category: 'Sushi', emoji: '🍣', color: '#CFE3EA',
    rating: 4.8, reviews: 940, etaMin: 30, etaMax: 45, deliveryFee: 299, minOrder: 1500,
    menu: [
      { id: 'r3-1', section: 'Rolls', name: 'Spicy tuna roll', desc: '8 pieces, chili mayo, scallion', price: 1250, popular: true },
      { id: 'r3-2', section: 'Rolls', name: 'California roll', desc: '8 pieces, crab, avocado, cucumber', price: 995 },
      { id: 'r3-3', section: 'Nigiri', name: 'Salmon nigiri', desc: '2 pieces', price: 750 },
      { id: 'r3-4', section: 'Nigiri', name: 'Hamachi nigiri', desc: '2 pieces', price: 850 },
      { id: 'r3-5', section: 'Sides', name: 'Miso soup', desc: 'Tofu, wakame, scallion', price: 395 },
      { id: 'r3-6', section: 'Sides', name: 'Edamame', desc: 'Sea salt', price: 495 },
    ],
  },
  {
    id: 'r4', name: 'La Taquería', category: 'Mexican', emoji: '🌮', color: '#F3E1A6',
    rating: 4.6, reviews: 1311, etaMin: 20, etaMax: 35, deliveryFee: 149, minOrder: 1000,
    menu: [
      { id: 'r4-1', section: 'Tacos', name: 'Al pastor tacos', desc: 'Three tacos, pineapple, cilantro', price: 1150, popular: true },
      { id: 'r4-2', section: 'Tacos', name: 'Carne asada tacos', desc: 'Three tacos, salsa verde', price: 1250 },
      { id: 'r4-3', section: 'Burritos', name: 'Bean & cheese burrito', desc: 'Refried pinto, Oaxaca cheese', price: 995 },
      { id: 'r4-4', section: 'Sides', name: 'Chips & guac', desc: 'Made to order', price: 750, popular: true },
      { id: 'r4-5', section: 'Drinks', name: 'Horchata', desc: '16 oz', price: 425 },
    ],
  },
  {
    id: 'r5', name: 'Green Bowl', category: 'Healthy', emoji: '🥗', color: '#D3E8C8',
    rating: 4.4, reviews: 702, etaMin: 15, etaMax: 25, deliveryFee: 99, minOrder: 1000,
    menu: [
      { id: 'r5-1', section: 'Bowls', name: 'Harvest bowl', desc: 'Roast squash, quinoa, kale, tahini', price: 1395, popular: true },
      { id: 'r5-2', section: 'Bowls', name: 'Poke bowl', desc: 'Ahi tuna, rice, mango, ponzu', price: 1595 },
      { id: 'r5-3', section: 'Bowls', name: 'Falafel bowl', desc: 'Hummus, pickled onion, herbs', price: 1295 },
      { id: 'r5-4', section: 'Drinks', name: 'Green juice', desc: 'Kale, apple, ginger', price: 695 },
    ],
  },
  {
    id: 'r6', name: 'Sugar Rush', category: 'Dessert', emoji: '🍩', color: '#F5CFE0',
    rating: 4.9, reviews: 455, etaMin: 10, etaMax: 20, deliveryFee: 199, minOrder: 600,
    menu: [
      { id: 'r6-1', section: 'Donuts', name: 'Glazed donut', desc: 'Classic yeast-raised', price: 275, popular: true },
      { id: 'r6-2', section: 'Donuts', name: 'Boston cream', desc: 'Custard filled, chocolate top', price: 350 },
      { id: 'r6-3', section: 'Treats', name: 'Brownie', desc: 'Fudgy, sea salt flake', price: 425 },
      { id: 'r6-4', section: 'Treats', name: 'Ice cream pint', desc: 'Vanilla bean', price: 899 },
    ],
  },
]
