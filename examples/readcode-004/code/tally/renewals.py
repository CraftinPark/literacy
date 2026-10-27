"""Monthly subscription renewals.

The scheduler calls run_renewals(svc, "2026-11") once a month. If a run dies
halfway through (a deploy, a crash), the scheduler starts it again from the top.
"""
from . import payments
from .models import ChargeStatus


def renewal_key(subscription_id, period):
    return f"renewal:{subscription_id}:{period}"


def run_renewals(svc, period):
    """Charge every active subscription for `period`. Returns a summary of charge ids."""
    charged, declined = [], []
    for sub in svc.repo.active_subscriptions():
        charge = payments.charge(
            svc,
            sub.customer_id,
            sub.price_cents,
            idempotency_key=renewal_key(sub.id, period),
            description=f"{sub.plan} plan, {period}",
        )
        (charged if charge.status is ChargeStatus.SUCCEEDED else declined).append(charge.id)
    return {"period": period, "charged": charged, "declined": declined}
