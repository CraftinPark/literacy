"""In-memory storage, standing in for the database.

Like rows read from a real database, objects returned by the repo are copies:
changing one has no effect on what is stored until it is written back with
the matching save_* method.
"""
import copy
import itertools
import threading
from contextlib import contextmanager

from .models import NotFound


class Repo:
    def __init__(self):
        self._charges = {}
        self._refunds = {}
        self._subscriptions = {}
        self._next_id = itertools.count(1)
        self._locks = {}
        self._locks_guard = threading.Lock()

    def new_id(self, prefix):
        return f"{prefix}_{next(self._next_id):04d}"

    # ---- charges

    def add_charge(self, charge):
        if charge.id in self._charges:
            raise ValueError(f"charge {charge.id} already exists")
        self._charges[charge.id] = copy.deepcopy(charge)

    def save_charge(self, charge):
        if charge.id not in self._charges:
            raise NotFound(f"charge {charge.id}")
        self._charges[charge.id] = copy.deepcopy(charge)

    def get_charge(self, charge_id):
        try:
            return copy.deepcopy(self._charges[charge_id])
        except KeyError:
            raise NotFound(f"charge {charge_id}") from None

    def charge_by_key(self, idempotency_key):
        """The charge recorded under this idempotency key, or None."""
        if idempotency_key is None:
            return None
        for c in self._charges.values():
            if c.idempotency_key == idempotency_key:
                return copy.deepcopy(c)
        return None

    def charges_for(self, customer_id):
        return [copy.deepcopy(c) for c in self._charges.values() if c.customer_id == customer_id]

    # ---- refunds

    def add_refund(self, refund):
        self._refunds[refund.id] = copy.deepcopy(refund)

    def refunds_for(self, charge_id):
        """Every refund recorded against the charge, oldest first."""
        return [copy.deepcopy(r) for r in self._refunds.values() if r.charge_id == charge_id]

    # ---- subscriptions

    def add_subscription(self, sub):
        self._subscriptions[sub.id] = copy.deepcopy(sub)

    def active_subscriptions(self):
        return [copy.deepcopy(s) for s in self._subscriptions.values() if s.active]

    # ---- locking

    @contextmanager
    def locked(self, name):
        """Hold the lock called `name` for the duration of the block.

        Plays the part of SELECT ... FOR UPDATE: two blocks that lock the same
        name never run at the same time; different names don't wait for each other.
        """
        with self._locks_guard:
            lock = self._locks.setdefault(name, threading.Lock())
        with lock:
            yield
