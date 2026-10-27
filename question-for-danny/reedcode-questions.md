# ReedCode Questions

## Codebase Overview

- **server.js**
  - starts the app. It sets up the shared request handling and defines the login, signup, profile and admin routes.
- **routes/orders.js**
  - handles everything about orders: the product list, price calculation, and creating, viewing and cancelling orders.
- **middleware.js**
  - holds the checks that run before a request reaches its route, like verifying the user is logged in, checking admin access, limiting how often orders can be placed, and turning errors into clean responses.
- **db.js**
  - stores the data. It keeps users and orders in memory, hashes passwords, and creates a few sample users.
- **config.js**
  - holds the app’s settings, such as the port and token lifetime. Settings change depending on whether the app runs in development, test or production.

---

## Question 1 (something very simple. Can be found with ctrl+f)

- This is the first time John visits our website to purchase a hoodie for his friend’s birthday. Upon signing up with a new account, John receives a coupon code, “WELCOME10”. John gets excited and tries to place an order with this coupon code, however, right before the purchase, he sees that the coupon hasn’t been applied to the final pricing. Fix the codebase to help John apply his coupon!!

---

## Question 2 (something very simple. Can be found with ctrl+f)

- When a user signs into their account, a token is issued for the user. The token allows the backend to identify the user when actions such as view/update profile, order placement, viewing order history, etc are performed.
- **Problem:** Roger successfully logs in to his account with a response status of 200 (success). But when Roger tries to view his profile or place an order, he receives “401 Unauthorized”. It was confirmed that the token was made fresh when Roger signed up. Fix the token issue in our codebase.

---

## Question 3 (explanation questions)

Assume the server has just been initialized

- If David signed up with username David_H, email [david@gmail.com](mailto:david@gmail.com) and password password123, what would be the userID given this David’s account?
- If David were to login in with DAVID_H and password123, will the login succeed? Explain
