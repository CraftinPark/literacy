"""Charges through the API and the checkout webhook."""
from tally import api, webhooks


def checkout_event(event_id, order_id="1042", customer_id="cus_ada", amount_cents=4999):
    return {
        "id": event_id,
        "type": "checkout.completed",
        "data": {"order_id": order_id, "customer_id": customer_id, "amount_cents": amount_cents},
    }


def post_charge(svc, body, key=None):
    headers = {"Idempotency-Key": key} if key else {}
    return api.handle(svc, "POST", "/charges", headers, body)


def test_redelivered_checkout_event_charges_once(svc):
    event = checkout_event("evt_1042")
    webhooks.handle_event(svc, event)
    webhooks.handle_event(svc, event)

    assert len(svc.processor.captures) == 1
    assert len(svc.repo.charges_for("cus_ada")) == 1
    assert svc.ledger.balance("merchant") == 4999


def test_repeated_request_returns_the_original_charge(svc):
    first = post_charge(svc, {"customer_id": "cus_ada", "amount_cents": 1500}, key="k-1")
    again = post_charge(svc, {"customer_id": "cus_ada", "amount_cents": 1500}, key="k-1")
    assert (first.status, again.status) == (201, 200)
    assert again.body["id"] == first.body["id"]

    a = webhooks.handle_event(svc, checkout_event("evt_7", order_id="7"))
    b = webhooks.handle_event(svc, checkout_event("evt_7", order_id="7"))
    assert b["charge_id"] == a["charge_id"]


def test_distinct_requests_create_distinct_charges(svc):
    for _ in range(2):
        assert post_charge(svc, {"customer_id": "cus_ada", "amount_cents": 500}).status == 201
    webhooks.handle_event(svc, checkout_event("evt_1", order_id="1", amount_cents=500))
    webhooks.handle_event(svc, checkout_event("evt_2", order_id="2", amount_cents=500))

    assert len(svc.processor.captures) == 4
    assert svc.ledger.balance("merchant") == 2000
