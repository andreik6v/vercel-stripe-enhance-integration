-- Initial database schema for Stripe-Enhance integration
-- This creates the core tables for managing customers, subscriptions, and plan mappings

-- Tabela pentru clienți, sursa noastră de adevăr pentru identități
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY, -- ID-ul nostru intern, auto-increment
    enhance_customer_id TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT UNIQUE,
    paddle_customer_id TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE CHECK (email LIKE '%@%.%'),
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Pentru soft delete
);

-- Trigger pentru a actualiza automat `updated_at` la orice modificare
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW(); 
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_updated_at 
BEFORE UPDATE ON customers 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Tabela pentru abonamente, leagă totul
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    enhance_subscription_id TEXT NOT NULL UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    paddle_subscription_id TEXT UNIQUE,
    enhance_plan_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'suspended', 'canceled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    canceled_at TIMESTAMPTZ
);

CREATE TRIGGER update_subscriptions_updated_at 
BEFORE UPDATE ON subscriptions 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Tabela pentru a mapa planurile, pentru flexibilitate maximă
CREATE TABLE IF NOT EXISTS plan_mappings (
    id SERIAL PRIMARY KEY,
    billing_provider TEXT NOT NULL CHECK(billing_provider IN ('stripe', 'paddle')),
    billing_plan_id TEXT NOT NULL,
    enhance_plan_id TEXT NOT NULL,
    UNIQUE(billing_provider, billing_plan_id)
);

-- Tabela pentru log-uri și idempotency, plasa de siguranță a sistemului
CREATE TABLE IF NOT EXISTS webhook_logs (
    id SERIAL PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received', -- 'received', 'processing', 'success', 'error'
    payload_json JSONB NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_idempotency ON webhook_logs (idempotency_key);

-- Inserăm câteva mapări de planuri pentru testare
INSERT INTO plan_mappings (billing_provider, billing_plan_id, enhance_plan_id) VALUES
('stripe', 'price_basic_monthly', 'basic-hosting-plan'),
('stripe', 'price_pro_monthly', 'pro-hosting-plan'),
('stripe', 'price_enterprise_monthly', 'enterprise-hosting-plan')
ON CONFLICT (billing_provider, billing_plan_id) DO NOTHING;
