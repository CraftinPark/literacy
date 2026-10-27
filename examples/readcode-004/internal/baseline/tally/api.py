"""HTTP API.

A small router maps (method, path) to a handler. The web framework adapter
(not part of this exercise) turns real requests into handle() calls and
handle()'s Response back into HTTP.

    POST /charges                {"customer_id", "amount_cents", "description"?}
                                 optional header Idempotency-Key
    GET  /charges/{id}
    POST /charges/{id}/refunds   {"amount_cents", "reason"?}
"""
import re
from dataclasses import dataclass, field

from . import payments, refunds
from .models import ChargeStatus, InvalidRequest, NotFound, PaymentError, RefundNotAllowed, RefundStatus


@dataclass
class Response:
    status: int
    body: dict
    headers: dict = field(default_factory=dict)


def refund_json(r):
    return {"id": r.id, "amount_cents": r.amount_cents, "status": r.status.value, "reason": r.reason}


def charge_json(svc, charge):
    return {
        "id": charge.id,
        "customer_id": charge.customer_id,
        "amount_cents": charge.amount_cents,
        "refunded_cents": charge.refunded_cents,
        "status": charge.status.value,
        "description": charge.description,
        "refunds": [refund_json(r) for r in svc.repo.refunds_for(charge.id)],
    }


def create_charge(svc, headers, body):
    key = headers.get("Idempotency-Key")
    if key:
        existing = svc.repo.charge_by_key(key)
        if existing is not None:
            return Response(200, charge_json(svc, existing), {"Idempotent-Replayed": "true"})
    charge = payments.charge(
        svc,
        body.get("customer_id"),
        body.get("amount_cents"),
        idempotency_key=key,
        description=body.get("description", ""),
    )
    status = 201 if charge.status is ChargeStatus.SUCCEEDED else 402
    return Response(status, charge_json(svc, charge))


def get_charge(svc, headers, body, charge_id):
    return Response(200, charge_json(svc, svc.repo.get_charge(charge_id)))


def create_refund(svc, headers, body, charge_id):
    r = refunds.refund(svc, charge_id, body.get("amount_cents"), reason=body.get("reason", ""))
    return Response(201 if r.status is RefundStatus.SUCCEEDED else 402, refund_json(r))


ROUTES = [
    ("POST", re.compile(r"^/charges$"), create_charge),
    ("GET", re.compile(r"^/charges/(?P<charge_id>ch_\w+)$"), get_charge),
    ("POST", re.compile(r"^/charges/(?P<charge_id>ch_\w+)/refunds$"), create_refund),
]

ERROR_STATUS = [(NotFound, 404), (InvalidRequest, 400), (RefundNotAllowed, 409)]


def handle(svc, method, path, headers=None, body=None):
    for route_method, pattern, handler in ROUTES:
        match = pattern.match(path)
        if match and route_method == method:
            try:
                return handler(svc, headers or {}, body or {}, **match.groupdict())
            except PaymentError as e:
                status = next((code for cls, code in ERROR_STATUS if isinstance(e, cls)), 400)
                return Response(status, {"error": str(e)})
    return Response(404, {"error": f"no route for {method} {path}"})
