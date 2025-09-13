// Database utilities for Stripe-Enhance integration
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export interface Customer {
  id: number
  enhance_customer_id: string
  stripe_customer_id?: string
  paddle_customer_id?: string
  email: string
  name?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Subscription {
  id: number
  customer_id: number
  enhance_subscription_id: string
  stripe_subscription_id?: string
  paddle_subscription_id?: string
  enhance_plan_id: string
  status: "active" | "suspended" | "canceled"
  created_at: string
  updated_at: string
  canceled_at?: string
}

export interface PlanMapping {
  id: number
  billing_provider: "stripe" | "paddle"
  billing_plan_id: string
  enhance_plan_id: string
}

export interface WebhookLog {
  id: number
  idempotency_key: string
  source: string
  event_type: string
  status: "received" | "processing" | "success" | "error"
  payload_json: any
  error_message?: string
  created_at: string
}

export class DatabaseService {
  static async findCustomerByStripeId(stripeCustomerId: string): Promise<Customer | null> {
    const result = await sql`
      SELECT * FROM customers 
      WHERE stripe_customer_id = ${stripeCustomerId} 
      AND deleted_at IS NULL
    `
    return result[0] || null
  }

  static async findCustomerByEmail(email: string): Promise<Customer | null> {
    const result = await sql`
      SELECT * FROM customers 
      WHERE email = ${email} 
      AND deleted_at IS NULL
    `
    return result[0] || null
  }

  static async createCustomer(data: {
    enhance_customer_id: string
    stripe_customer_id?: string
    email: string
    name?: string
  }): Promise<Customer> {
    const result = await sql`
      INSERT INTO customers (enhance_customer_id, stripe_customer_id, email, name)
      VALUES (${data.enhance_customer_id}, ${data.stripe_customer_id}, ${data.email}, ${data.name})
      RETURNING *
    `
    return result[0]
  }

  static async findSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    const result = await sql`
      SELECT * FROM subscriptions 
      WHERE stripe_subscription_id = ${stripeSubscriptionId}
    `
    return result[0] || null
  }

  static async createSubscription(data: {
    customer_id: number
    enhance_subscription_id: string
    stripe_subscription_id?: string
    enhance_plan_id: string
    status: "active" | "suspended" | "canceled"
  }): Promise<Subscription> {
    const result = await sql`
      INSERT INTO subscriptions (customer_id, enhance_subscription_id, stripe_subscription_id, enhance_plan_id, status)
      VALUES (${data.customer_id}, ${data.enhance_subscription_id}, ${data.stripe_subscription_id}, ${data.enhance_plan_id}, ${data.status})
      RETURNING *
    `
    return result[0]
  }

  static async updateSubscriptionStatus(id: number, status: "active" | "suspended" | "canceled"): Promise<void> {
    await sql`
      UPDATE subscriptions 
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
    `
  }

  static async findPlanMapping(
    billingProvider: "stripe" | "paddle",
    billingPlanId: string,
  ): Promise<PlanMapping | null> {
    const result = await sql`
      SELECT * FROM plan_mappings 
      WHERE billing_provider = ${billingProvider} 
      AND billing_plan_id = ${billingPlanId}
    `
    return result[0] || null
  }

  static async logWebhook(data: {
    idempotency_key: string
    source: string
    event_type: string
    payload_json: any
    status?: "received" | "processing" | "success" | "error"
  }): Promise<WebhookLog> {
    const result = await sql`
      INSERT INTO webhook_logs (idempotency_key, source, event_type, payload_json, status)
      VALUES (${data.idempotency_key}, ${data.source}, ${data.event_type}, ${JSON.stringify(data.payload_json)}, ${data.status || "received"})
      RETURNING *
    `
    return result[0]
  }

  static async updateWebhookStatus(
    idempotencyKey: string,
    status: "processing" | "success" | "error",
    errorMessage?: string,
  ): Promise<void> {
    await sql`
      UPDATE webhook_logs 
      SET status = ${status}, error_message = ${errorMessage}
      WHERE idempotency_key = ${idempotencyKey}
    `
  }

  static async webhookExists(idempotencyKey: string): Promise<boolean> {
    const result = await sql`
      SELECT 1 FROM webhook_logs 
      WHERE idempotency_key = ${idempotencyKey}
    `
    return result.length > 0
  }

  static async getAllActiveSubscriptions(): Promise<Subscription[]> {
    const result = await sql`
      SELECT * FROM subscriptions 
      WHERE status IN ('active', 'suspended')
      ORDER BY created_at DESC
    `
    return result
  }

  static async updateSubscriptionPlan(id: number, enhancePlanId: string): Promise<void> {
    await sql`
      UPDATE subscriptions 
      SET enhance_plan_id = ${enhancePlanId}, updated_at = NOW()
      WHERE id = ${id}
    `
  }

  static async getSubscriptionSummary(): Promise<{
    total: number
    active: number
    suspended: number
    canceled: number
  }> {
    const result = await sql`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended,
        COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceled
      FROM subscriptions
    `
    return {
      total: Number(result[0].total),
      active: Number(result[0].active),
      suspended: Number(result[0].suspended),
      canceled: Number(result[0].canceled),
    }
  }

  static async getCustomerSubscriptions(customerId: number): Promise<Subscription[]> {
    const result = await sql`
      SELECT * FROM subscriptions 
      WHERE customer_id = ${customerId}
      ORDER BY created_at DESC
    `
    return result
  }

  static async getRecentWebhookLogs(limit = 50): Promise<WebhookLog[]> {
    const result = await sql`
      SELECT * FROM webhook_logs 
      ORDER BY created_at DESC 
      LIMIT ${limit}
    `
    return result
  }

  static async getFailedWebhooks(): Promise<WebhookLog[]> {
    const result = await sql`
      SELECT * FROM webhook_logs 
      WHERE status = 'error'
      ORDER BY created_at DESC
    `
    return result
  }

  static async testConnection(): Promise<void> {
    await sql`SELECT 1 as test`
  }

  static async updateCustomer(
    id: number,
    data: {
      email?: string
      name?: string
    },
  ): Promise<Customer> {
    const result = await sql`
      UPDATE customers 
      SET 
        email = COALESCE(${data.email}, email),
        name = COALESCE(${data.name}, name),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return result[0]
  }
}
