"""Charging customers."""
from .models import Charge, ChargeStatus, Declined, InvalidRequest


def charge(svc, customer_id, amount_cents, idempotency_key=None, description=""):
    """Charge the customer's card on file and record the charge.

    Returns the Charge. Its status is FAILED when the processor declined, in
    which case no money moved.
    """
    if not customer_id:
        raise InvalidRequest("customer_id is required")
    if not isinstance(amount_cents, int) or amount_cents <= 0:
        raise InvalidRequest("amount_cents must be a positive integer")
    if idempotency_key is None:
        return _create(svc, customer_id, amount_cents, None, description)
    with svc.repo.locked(f"idempotency:{idempotency_key}"):
        existing = svc.repo.charge_by_key(idempotency_key)
        if existing is not None:
            return existing
        return _create(svc, customer_id, amount_cents, idempotency_key, description)


def _create(svc, customer_id, amount_cents, idempotency_key, description):
    charge = Charge(
        id=svc.repo.new_id("ch"),
        customer_id=customer_id,
        amount_cents=amount_cents,
        status=ChargeStatus.SUCCEEDED,
        idempotency_key=idempotency_key,
        description=description,
    )
    try:
        charge.processor_ref = svc.processor.capture(customer_id, amount_cents)
    except Declined:
        charge.status = ChargeStatus.FAILED
    svc.repo.add_charge(charge)
    if charge.status is ChargeStatus.SUCCEEDED:
        svc.ledger.transfer(f"customer:{customer_id}", "merchant", amount_cents, memo=f"charge {charge.id}")
    return charge
