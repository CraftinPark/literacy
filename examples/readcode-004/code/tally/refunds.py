"""Refunding charges, in full or in part."""
from .models import ChargeStatus, Declined, InvalidRequest, Refund, RefundNotAllowed, RefundStatus


def refund(svc, charge_id, amount_cents, reason=""):
    """Send part or all of a charge back to the customer.

    Returns the Refund. If the processor declines, the refund is recorded with
    status FAILED and no money moves.
    """
    if not isinstance(amount_cents, int) or amount_cents <= 0:
        raise InvalidRequest("amount_cents must be a positive integer")
    with svc.repo.locked(f"charge:{charge_id}"):
        charge = svc.repo.get_charge(charge_id)
        if charge.status is not ChargeStatus.SUCCEEDED:
            raise RefundNotAllowed(f"charge {charge_id} did not succeed")
        remaining = charge.amount_cents - charge.refunded_cents
        if amount_cents > remaining:
            raise RefundNotAllowed(f"refund of {amount_cents} is more than the {remaining} left on {charge_id}")

        refund = Refund(
            id=svc.repo.new_id("re"),
            charge_id=charge_id,
            amount_cents=amount_cents,
            status=RefundStatus.SUCCEEDED,
            reason=reason,
        )
        try:
            refund.processor_ref = svc.processor.refund(charge.processor_ref, amount_cents)
        except Declined:
            refund.status = RefundStatus.FAILED
            svc.repo.add_refund(refund)
            return refund

        svc.repo.add_refund(refund)
        svc.ledger.transfer("merchant", f"customer:{charge.customer_id}", amount_cents, memo=f"refund {refund.id}")
        return refund
