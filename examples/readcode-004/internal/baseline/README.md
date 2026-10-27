# Tally

The payments service behind our checkout. It charges customers' cards,
refunds charges, and renews subscriptions every month.

It is plain Python with no server or database: storage is in memory
(`tally/repo.py`) and the card processor is a fake (`tally/processor.py`),
so everything runs inside the tests.

> **ReadCode exercise.** Your tickets are in the panel on the right. Fix them
> in this editor and press **Run tests**; files under `tests/` are read-only.
> The provided tests are a starting point: more tests run when you finish,
> always against the original copies of the test files.

## Where things are

| Path                  | What it does |
|-----------------------|--------------|
| `tally/__init__.py`   | `Services`: the repo, ledger and processor bundled together |
| `tally/models.py`     | Charges, refunds, subscriptions, errors |
| `tally/repo.py`       | In-memory storage and named locks |
| `tally/ledger.py`     | Double-entry ledger |
| `tally/processor.py`  | Fake card processor |
| `tally/payments.py`   | Taking money: `charge()` |
| `tally/refunds.py`    | Giving it back: `refund()` |
| `tally/api.py`        | HTTP API: router, handlers, JSON shapes |
| `tally/webhooks.py`   | Events from the hosted checkout page |
| `tally/renewals.py`   | The monthly subscription renewal job |
| `tests/`              | Tests (pytest) |

## Ways money is taken

| Entry point           | Called by |
|-----------------------|-----------|
| `api.create_charge`   | Our apps, `POST /charges` |
| `webhooks.handle_event` | The checkout provider, for `checkout.completed` |
| `renewals.run_renewals` | The scheduler, once a month |

Amounts are always integer cents: `4999` is $49.99.
