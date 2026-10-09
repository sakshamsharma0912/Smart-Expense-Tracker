# Digital payment records and imports

Manual entries support Cash, UPI, Card, Bank and Other payment methods. Statement CSV imports place digital payments in Review inbox. Category suggestions use merchant keywords; the user chooses the final classification. No live bank provider is connected.

## Import a statement

1. Open Bank imports and select a CSV.
2. Map the reference, date, description, amount/direction (or debit/credit) and optional method/account fields.
3. Preview the rows, then commit the import.
4. Categorise each entry, match an existing expense, or ignore it.

The supported default CSV format is in `templates/statement_template.csv`. Use stable account labels and unique bank statement references. Repeated references with identical details are skipped; conflicts are rejected before saving. Pending and ignored imports do not inflate reports.

## Optional local adapter

`AdapterController` retains the authenticated local import interface. Set `EXPENSE_ADAPTER_SECRET` to a random secret of at least 32 characters before starting Java. A user must opt in through Settings. Without a configured secret, the endpoint is disabled.

POST URL-encoded fields to `/api/integrations/transactions` from the server computer. Fields: `userId`, `transaction_id`, `date`, `description`, `amount`, `direction`, `method`, `account`. Include:

- `X-Event-Timestamp`: Unix seconds, within five minutes.
- `X-Event-Signature`: hex HMAC-SHA256 of `timestamp + "." + exact_body_bytes`, keyed by the configured secret.

The supplied `tools/send_adapter_event.py` constructs a request. Successful records enter the opted-in user's pending inbox; repeated identical references are idempotent. An actual bank-provider integration must supply authorised transactions before this endpoint can deliver live records.
