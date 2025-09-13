// Stripe integration utilities
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
})

export interface StripeWebhookEvent {
  id: string
  type: string
  data: {
    object: any
  }
  created: number
}

export class StripeService {
  static verifyWebhookSignature(payload: string, signature: string): StripeWebhookEvent {
    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      ) as StripeWebhookEvent
    } catch (error) {
      throw new Error(`Webhook signature verification failed: ${error}`)
    }
  }

  static extractCustomerData(event: StripeWebhookEvent): {
    stripeCustomerId: string
    email: string
    name?: string
  } | null {
    let customer: any = null

    switch (event.type) {
      case "checkout.session.completed":
        customer = event.data.object.customer_details || event.data.object.customer
        return {
          stripeCustomerId: event.data.object.customer as string,
          email: customer?.email || event.data.object.customer_email,
          name: customer?.name || event.data.object.customer_details?.name,
        }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        return {
          stripeCustomerId: event.data.object.customer as string,
          email: "", // Will need to fetch from Stripe API
          name: "",
        }

      default:
        return null
    }
  }

  static extractSubscriptionData(event: StripeWebhookEvent): {
    stripeSubscriptionId: string
    stripeCustomerId: string
    stripePriceId?: string
    status: string
  } | null {
    switch (event.type) {
      case "checkout.session.completed":
        return {
          stripeSubscriptionId: event.data.object.subscription as string,
          stripeCustomerId: event.data.object.customer as string,
          stripePriceId: event.data.object.line_items?.data[0]?.price?.id,
          status: "active",
        }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        return {
          stripeSubscriptionId: event.data.object.id,
          stripeCustomerId: event.data.object.customer as string,
          stripePriceId: event.data.object.items?.data[0]?.price?.id,
          status: event.data.object.status,
        }

      default:
        return null
    }
  }

  static async getCustomer(customerId: string): Promise<Stripe.Customer> {
    return (await stripe.customers.retrieve(customerId)) as Stripe.Customer
  }

  static async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return await stripe.subscriptions.retrieve(subscriptionId)
  }

  static async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    return await stripe.subscriptions.update(subscriptionId, params)
  }

  static async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return await stripe.subscriptions.cancel(subscriptionId)
  }

  static async listCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
    })
    return subscriptions.data
  }
}
