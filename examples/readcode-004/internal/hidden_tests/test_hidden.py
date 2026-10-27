"""Graded tests the candidate does not see. They run from the tests/ folder,
next to the visible tests, so they share conftest.py."""
import pytest

from tally import payments, refunds, renewals
from tally.models import RefundNotAllowed, RefundStatus, Subscription


def test_restarted_renewal_run_charges_each_subscription_once(svc):
    svc.repo.add_subscription(Subscription("sub_1", "cus_ada", "pro", 2900))
    svc.repo.add_subscription(Subscription("sub_2", "cus_grace", "team", 9900))

    first = renewals.run_renewals(svc, "2026-11")
    again = renewals.run_renewals(svc, "2026-11")      # the scheduler restarted the job
    assert sorted(again["charged"]) == sorted(first["charged"])
    assert len(svc.processor.captures) == 2
    assert svc.ledger.balance("merchant") == 2900 + 9900

    renewals.run_renewals(svc, "2026-12")              # a new month is a new charge
    assert len(svc.processor.captures) == 4


def test_declined_refund_does_not_use_up_the_charge(svc):
    charge_id = payments.charge(svc, "cus_ada", 10000).id
    assert refunds.refund(svc, charge_id, 4000).status is RefundStatus.SUCCEEDED

    svc.processor.refunds_to_decline = 1
    assert refunds.refund(svc, charge_id, 5000).status is RefundStatus.FAILED

    assert refunds.refund(svc, charge_id, 6000).status is RefundStatus.SUCCEEDED
    with pytest.raises(RefundNotAllowed):
        refunds.refund(svc, charge_id, 1)
    assert svc.ledger.balance("merchant") == 0
