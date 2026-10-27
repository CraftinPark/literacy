"""Tally: the payments service behind the checkout.

Money is always an integer number of cents (USD). `Services` bundles what every
entry point needs; tests build a fresh one per test.
"""
from dataclasses import dataclass, field

from .ledger import Ledger
from .processor import FakeProcessor
from .repo import Repo


@dataclass
class Services:
    repo: Repo = field(default_factory=Repo)
    ledger: Ledger = field(default_factory=Ledger)
    processor: FakeProcessor = field(default_factory=FakeProcessor)
