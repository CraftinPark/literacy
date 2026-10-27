"""Fake card processor, standing in for the real processor's API.

capture() takes money from the customer's card on file and refund() sends part
of a capture back. Both return the processor's reference for the operation and
raise Declined when the processor refuses. Tests use the two knobs in
__init__ to make it refuse.
"""
import itertools

from .models import Declined


class FakeProcessor:
    def __init__(self):
        self.captures = []              # (ref, customer_id, amount_cents)
        self.refunds = []               # (ref, capture_ref, amount_cents)
        self.declined_customers = set()
        self.refunds_to_decline = 0     # decline this many refund calls, then accept again
        self._refs = itertools.count(1)

    def capture(self, customer_id, amount_cents):
        if customer_id in self.declined_customers:
            raise Declined(f"card declined for {customer_id}")
        ref = f"cap_{next(self._refs)}"
        self.captures.append((ref, customer_id, amount_cents))
        return ref

    def refund(self, capture_ref, amount_cents):
        if self.refunds_to_decline > 0:
            self.refunds_to_decline -= 1
            raise Declined(f"refund on {capture_ref} declined")
        ref = f"rfd_{next(self._refs)}"
        self.refunds.append((ref, capture_ref, amount_cents))
        return ref
