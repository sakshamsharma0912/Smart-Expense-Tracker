CREATE TABLE recurring_transactions (
 id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL,
 description VARCHAR(100) NOT NULL, plan_name VARCHAR(60) NOT NULL,
 category VARCHAR(24) NOT NULL, amount DECIMAL(11,2) NOT NULL CHECK (amount > 0),
 entry_type VARCHAR(12) NOT NULL, method VARCHAR(12) NOT NULL, frequency VARCHAR(12) NOT NULL,
 anchor_date DATE NOT NULL, next_date DATE NOT NULL, end_date DATE,
 active BOOLEAN NOT NULL DEFAULT TRUE, archived BOOLEAN NOT NULL DEFAULT FALSE,
 auto_post BOOLEAN NOT NULL DEFAULT FALSE, notes VARCHAR(500) NOT NULL,
 tax_amount DECIMAL(11,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0 AND tax_amount <= amount),
 created_at TIMESTAMP NOT NULL, FOREIGN KEY(user_id) REFERENCES app_users(id)
);
CREATE INDEX recurring_owner_due ON recurring_transactions(user_id, next_date);
CREATE TABLE recurring_occurrences (
 id VARCHAR(36) PRIMARY KEY, recurring_id VARCHAR(36) NOT NULL, due_date DATE NOT NULL,
 transaction_id VARCHAR(80) NOT NULL, created_at TIMESTAMP NOT NULL,
 UNIQUE(recurring_id, due_date), FOREIGN KEY(recurring_id) REFERENCES recurring_transactions(id)
);
