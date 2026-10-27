"""Refunds."""
import pytest

from tally import api, payments, refunds
from tally.models import RefundNotAllowed, RefundStatus


@pytest.fixture
def charge_id(svc):
    """A $100.00 charge that succeeded."""
    return payments.charge(svc, "cus_ada", 10000, idempotency_key="order-77").id


def test_second_refund_cannot_exceed_what_is_left(svc, charge_id):
    assert refunds.refund(svc, charge_id, 7000).status is RefundStatus.SUCCEEDED
    with pytest.raises(RefundNotAllowed):
        refunds.refund(svc, charge_id, 4000)
    assert svc.ledger.balance("merchant") == 3000


def test_refunds_can_add_up_to_exactly_the_charge(svc, charge_id):
    for amount in (3000, 3000, 4000):
        assert refunds.refund(svc, charge_id, amount).status is RefundStatus.SUCCEEDED

    one_more_cent = api.handle(svc, "POST", f"/charges/{charge_id}/refunds", {}, {"amount_cents": 1})
    assert one_more_cent.status == 409
    shown = api.handle(svc, "GET", f"/charges/{charge_id}").body
    assert shown["refunded_cents"] == 10000
    assert svc.ledger.balance("merchant") == 0


def test_full_refund_in_one_go(svc, charge_id):
    resp = api.handle(svc, "POST", f"/charges/{charge_id}/refunds", {}, {"amount_cents": 10000, "reason": "order cancelled"})
    assert resp.status == 201
    assert svc.ledger.balance("merchant") == 0
    assert svc.ledger.balance("customer:cus_ada") == 0
    assert svc.ledger.is_balanced()
