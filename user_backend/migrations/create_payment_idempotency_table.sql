-- Create payment_idempotency table for preventing duplicate charges
-- This table stores idempotency keys and their responses

CREATE TABLE IF NOT EXISTS payment_idempotency (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_data TEXT,
    status_code INT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_idempotency_user_id ON payment_idempotency(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_idempotency_expires_at ON payment_idempotency(expires_at);

-- Add a comment explaining the table
COMMENT ON TABLE payment_idempotency IS 'Stores idempotency keys to prevent duplicate payment processing';
COMMENT ON COLUMN payment_idempotency.idempotency_key IS 'Unique key provided by client to identify the request';
COMMENT ON COLUMN payment_idempotency.request_hash IS 'SHA256 hash of request parameters to detect key reuse with different data';
COMMENT ON COLUMN payment_idempotency.response_data IS 'Cached response data in JSON format';
COMMENT ON COLUMN payment_idempotency.expires_at IS 'When this idempotency key expires (typically 24 hours)';