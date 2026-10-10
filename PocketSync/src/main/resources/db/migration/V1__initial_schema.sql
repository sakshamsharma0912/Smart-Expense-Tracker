CREATE TABLE app_users (
 id VARCHAR(36) PRIMARY KEY, name VARCHAR(60) NOT NULL,
 email VARCHAR(120) NOT NULL UNIQUE, password_hash VARCHAR(400) NOT NULL,
 role VARCHAR(5) NOT NULL, share_tracker BOOLEAN NOT NULL DEFAULT FALSE,
 active BOOLEAN NOT NULL DEFAULT TRUE, token_version INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL
);
CREATE TABLE expense_transactions (
 id VARCHAR(80) PRIMARY KEY, user_id VARCHAR(36) NOT NULL,
 occurred_on DATE NOT NULL, description VARCHAR(100) NOT NULL,
 category VARCHAR(24) NOT NULL, amount DECIMAL(11,2) NOT NULL CHECK (amount > 0),
 entry_type VARCHAR(12) NOT NULL, method VARCHAR(12) NOT NULL,
 notes VARCHAR(500) NOT NULL, source VARCHAR(40) NOT NULL,
 inbox_id VARCHAR(36) NOT NULL, import_key VARCHAR(64),
 tax_amount DECIMAL(11,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0 AND tax_amount <= amount),
 created_at TIMESTAMP NOT NULL, UNIQUE (user_id, import_key), FOREIGN KEY(user_id) REFERENCES app_users(id)
);
CREATE INDEX tx_user_date ON expense_transactions(user_id, occurred_on);
CREATE TABLE expense_budgets (
 id VARCHAR(80) PRIMARY KEY, user_id VARCHAR(36) NOT NULL,
 report_month VARCHAR(7) NOT NULL, category VARCHAR(24) NOT NULL,
 amount DECIMAL(11,2) NOT NULL CHECK (amount > 0), UNIQUE(user_id, report_month, category), FOREIGN KEY(user_id) REFERENCES app_users(id)
);
CREATE TABLE statement_inbox (
 id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL,
 external_key VARCHAR(64) NOT NULL, reference_text VARCHAR(120) NOT NULL,
 account_label VARCHAR(80) NOT NULL, occurred_on DATE NOT NULL,
 description VARCHAR(100) NOT NULL, amount DECIMAL(11,2) NOT NULL CHECK (amount > 0),
 tax_amount DECIMAL(11,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0 AND tax_amount <= amount),
 direction VARCHAR(6) NOT NULL, method VARCHAR(12) NOT NULL,
 source VARCHAR(40) NOT NULL, suggested VARCHAR(24) NOT NULL,
 status VARCHAR(12) NOT NULL, ledger_id VARCHAR(80) NOT NULL,
 note VARCHAR(160) NOT NULL, received_at TIMESTAMP NOT NULL, UNIQUE(user_id, external_key), FOREIGN KEY(user_id) REFERENCES app_users(id)
);
CREATE TABLE expense_audit (
 id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL,
 happened_at TIMESTAMP NOT NULL, actor VARCHAR(60) NOT NULL, event_text VARCHAR(260) NOT NULL, FOREIGN KEY(user_id) REFERENCES app_users(id)
);
CREATE INDEX audit_user_time ON expense_audit(user_id,happened_at);
CREATE TABLE refresh_tokens (
 token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(36) NOT NULL,
 expires_at TIMESTAMP NOT NULL, FOREIGN KEY(user_id) REFERENCES app_users(id)
);
