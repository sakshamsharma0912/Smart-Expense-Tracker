CREATE TABLE IF NOT EXISTS schema_info (version INTEGER PRIMARY KEY);
INSERT INTO schema_info(version) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_info);

CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    role VARCHAR(5) NOT NULL CHECK (role IN ('USER', 'ADMIN')),
    password_salt VARCHAR(64) NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    password_algorithm VARCHAR(32) NOT NULL DEFAULT 'PBKDF2WithHmacSHA256',
    password_iterations INTEGER NOT NULL DEFAULT 210000,
    created_at VARCHAR(40) NOT NULL,
    share_tracker BOOLEAN NOT NULL DEFAULT FALSE,
    adapter_allowed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS transactions (
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    record_id VARCHAR(80) NOT NULL,
    row_index INTEGER NOT NULL,
    occurred_on DATE NOT NULL,
    description VARCHAR(100) NOT NULL,
    category VARCHAR(24) NOT NULL,
    amount DECIMAL(11, 2) NOT NULL CHECK (amount > 0),
    entry_type VARCHAR(12) NOT NULL CHECK (entry_type IN ('expense', 'income', 'refund', 'transfer')),
    method VARCHAR(12) NOT NULL,
    notes VARCHAR(500) NOT NULL,
    source VARCHAR(40) NOT NULL,
    inbox_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (account_id, record_id)
);
CREATE INDEX IF NOT EXISTS transactions_by_month ON transactions(account_id, occurred_on);

CREATE TABLE IF NOT EXISTS inbox_entries (
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    record_id VARCHAR(36) NOT NULL,
    row_index INTEGER NOT NULL,
    external_key VARCHAR(64) NOT NULL,
    reference VARCHAR(120) NOT NULL,
    account_label VARCHAR(80) NOT NULL,
    occurred_on DATE NOT NULL,
    description VARCHAR(100) NOT NULL,
    amount DECIMAL(11, 2) NOT NULL CHECK (amount > 0),
    direction VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    method VARCHAR(12) NOT NULL,
    source VARCHAR(40) NOT NULL,
    suggested VARCHAR(24) NOT NULL,
    status VARCHAR(12) NOT NULL CHECK (status IN ('pending', 'categorized', 'matched', 'ignored')),
    ledger_id VARCHAR(80) NOT NULL,
    note VARCHAR(160) NOT NULL,
    received_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (account_id, record_id),
    UNIQUE (account_id, external_key)
);

CREATE TABLE IF NOT EXISTS budgets (
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    record_id VARCHAR(80) NOT NULL,
    row_index INTEGER NOT NULL,
    report_month VARCHAR(7) NOT NULL,
    category VARCHAR(24) NOT NULL,
    amount DECIMAL(11, 2) NOT NULL CHECK (amount > 0),
    PRIMARY KEY (account_id, record_id),
    UNIQUE (account_id, report_month, category)
);

CREATE TABLE IF NOT EXISTS activity_log (
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    record_id VARCHAR(36) NOT NULL,
    row_index INTEGER NOT NULL,
    happened_at VARCHAR(40) NOT NULL,
    actor VARCHAR(60) NOT NULL,
    event VARCHAR(260) NOT NULL,
    PRIMARY KEY (account_id, record_id)
);
