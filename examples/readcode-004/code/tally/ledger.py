"""Double-entry ledger.

Every movement of money is one posting made of two entries that sum to zero:
the amount leaves one account and arrives in another. Accounts in use:

    customer:<id>   the customer's side; goes negative as they pay us
    merchant        what we hold from charges, minus what we refunded
"""
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class Entry:
    posting: int
    account: str
    amount_cents: int
    memo: str


class Ledger:
    def __init__(self):
        self.entries: List[Entry] = []
        self._postings = 0

    def transfer(self, source, destination, amount_cents, memo=""):
        """Move a positive amount from one account to another. Returns the posting number."""
        if amount_cents <= 0:
            raise ValueError("a transfer moves a positive amount")
        if source == destination:
            raise ValueError("source and destination are the same account")
        self._postings += 1
        self.entries.append(Entry(self._postings, source, -amount_cents, memo))
        self.entries.append(Entry(self._postings, destination, amount_cents, memo))
        return self._postings

    def balance(self, account):
        return sum(e.amount_cents for e in self.entries if e.account == account)

    def is_balanced(self):
        return sum(e.amount_cents for e in self.entries) == 0
