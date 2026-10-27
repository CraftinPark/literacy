import pytest

from tally import Services


@pytest.fixture
def svc():
    """A fresh service with empty storage, an empty ledger and a processor that accepts everything."""
    return Services()
