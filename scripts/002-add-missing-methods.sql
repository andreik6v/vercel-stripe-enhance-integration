-- Add any missing database methods and indexes for better performance

-- Index for faster customer lookups
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_stripe_id ON customers (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_enhance_id ON customers (enhance_customer_id);

-- Index for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_enhance_id ON subscriptions (enhance_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);

-- Index for webhook logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs (status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs (source);
