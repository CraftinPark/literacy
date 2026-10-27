"""Events from the hosted checkout page.

The checkout provider POSTs an event to us when something happens on its side.
Delivery is at least once: if it doesn't get a 2xx answer quickly enough, it
sends the same event again with the same id. An event looks like

    {"id": "evt_1042", "type": "checkout.completed",
     "data": {"order_id": "1042", "customer_id": "cus_ada", "amount_cents": 4999}}
"""
from . import payments
from .models import ChargeStatus


def handle_event(svc, event):
    """Process one delivery and return the body of our 200 answer."""
    kind = event.get("type")
    if kind == "checkout.completed":
        return _checkout_completed(svc, event)
    if kind == "checkout.expired":
        return {"received": event["id"], "action": "none"}
    return {"received": event["id"], "action": "ignored"}


def _checkout_completed(svc, event):
    data = event["data"]
    charge = payments.charge(
        svc,
        data["customer_id"],
        data["amount_cents"],
        idempotency_key=event["id"],
        description=f"order {data['order_id']}",
    )
    return {
        "received": event["id"],
        "action": "charged" if charge.status is ChargeStatus.SUCCEEDED else "declined",
        "charge_id": charge.id,
    }
