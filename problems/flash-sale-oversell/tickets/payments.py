"""Client for the card payment provider.

authorize() puts a hold on the card; capture() takes the money once the order is
confirmed; void() releases the hold. Every call carries an idempotency key, so
retrying after a timeout never charges twice: the provider returns the result of
the first call with that key.
"""
import hashlib
import random
import time

MAX_ATTEMPTS = 3


class Declined(Exception):
    pass


class ProviderTimeout(Exception):
    pass


def _call(op: str, key: str) -> str:
    time.sleep(random.uniform(0.030, 0.060))
    if random.random() < 0.01:
        raise ProviderTimeout(op)
    # The provider derives the reference from the idempotency key, so a retry
    # with the same key gets the same reference back.
    return f"{op[:3]}_{hashlib.sha256(key.encode()).hexdigest()[:12]}"


def _with_retries(op: str, key: str) -> str:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return _call(op, key)
        except ProviderTimeout:
            if attempt == MAX_ATTEMPTS:
                raise
            time.sleep(0.05 * 2 ** attempt)
    raise AssertionError("unreachable")


def authorize(customer: str, amount_cents: int, idempotency_key: str) -> str:
    if customer.endswith("@declined.test"):
        raise Declined(customer)
    return _with_retries("authorize", idempotency_key)


def capture(auth_ref: str, idempotency_key: str) -> str:
    return _with_retries("capture", idempotency_key + ":capture")


def void(auth_ref: str, idempotency_key: str) -> None:
    _with_retries("void", idempotency_key + ":void")
