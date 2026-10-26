"""Client for the pricing service (dynamic prices and fees).

The real service runs in another team's cluster; the p50 latency is about 30 ms
and it gets slower under load. Here we simulate it.
"""
import random
import time

SERVICE_FEE_CENTS = 350          # per ticket
DEMAND_STEP = 0.10               # +10% for every 25% of capacity already sold


class PricingUnavailable(Exception):
    pass


def _latency():
    time.sleep(random.uniform(0.020, 0.045))


def quote(event, qty: int, sold: int) -> int:
    """Total price in cents for qty tickets, given how many are already sold."""
    _latency()
    if event["capacity"] == 0:
        raise PricingUnavailable("event has no capacity")
    demand = min(sold / event["capacity"], 1.0)
    multiplier = 1.0 + DEMAND_STEP * int(demand / 0.25)
    per_ticket = round(event["base_cents"] * multiplier)
    return qty * (per_ticket + SERVICE_FEE_CENTS)
