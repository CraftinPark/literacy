"""Domain objects and errors. Amounts are integer cents."""
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ChargeStatus(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class RefundStatus(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class Charge:
    id: str
    customer_id: str
    amount_cents: int
    status: ChargeStatus
    idempotency_key: Optional[str] = None
    processor_ref: Optional[str] = None
    refunded_cents: int = 0
    description: str = ""


@dataclass
class Refund:
    id: str
    charge_id: str
    amount_cents: int
    status: RefundStatus
    processor_ref: Optional[str] = None
    reason: str = ""


@dataclass
class Subscription:
    id: str
    customer_id: str
    plan: str
    price_cents: int
    active: bool = True


class PaymentError(Exception):
    """Base class for errors the API turns into 4xx answers."""


class NotFound(PaymentError):
    pass


class InvalidRequest(PaymentError):
    pass


class RefundNotAllowed(PaymentError):
    pass


class Declined(PaymentError):
    """The card processor refused the operation."""
