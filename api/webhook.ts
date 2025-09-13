// Main webhook handler for Stripe events with enhanced error handling
import { type NextRequest, NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database"
import { StripeService } from "@/lib/stripe"
import { EnhanceService } from "@/lib/enhance"
import { logger } from "@/lib/logger"
import { ErrorHandler, AppError, ErrorCategory, ErrorSeverity } from "@/lib/error-handler"
import { RequestContext } from "@/lib/request-context"

export async function POST(request: NextRequest) {
  const requestContext = RequestContext.create()
  const requestId = requestContext.id

  try {
    logger.info("Webhook request received", {}, requestId)

    const body = await request.text()
    const signature = request.headers.get("stripe-signature")

    if (!signature) {
      throw new AppError("Missing stripe-signature header", ErrorCategory.VALIDATION, ErrorSeverity.LOW)
    }

    let event
    try {
      event = StripeService.verifyWebhookSignature(body, signature)
      logger.webhookReceived(event.type, event.id, "stripe", requestId)
    } catch (error) {
      throw new AppError(
        `Webhook signature verification failed: ${error}`,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
      )
    }

    const idempotencyKey = `stripe_${event.id}`
    if (await DatabaseService.webhookExists(idempotencyKey)) {
      logger.info("Webhook already processed", { eventId: event.id }, requestId)
      return NextResponse.json({ received: true, message: "Event already processed" })
    }

    await ErrorHandler.withRetry(
      async () => {
        await DatabaseService.logWebhook({
          idempotency_key: idempotencyKey,
          source: "stripe",
          event_type: event.type,
          payload_json: event,
          status: "received",
        })
      },
      3,
      1000,
      requestId,
    )

    await DatabaseService.updateWebhookStatus(idempotencyKey, "processing")
    logger.webhookProcessing(event.type, event.id, requestId)

    const startTime = Date.now()

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event, idempotencyKey, requestId)
          break

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event, idempotencyKey, requestId)
          break

        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event, idempotencyKey, requestId)
          break

        default:
          logger.info(`Unhandled event type: ${event.type}`, { eventId: event.id }, requestId)
      }

      await DatabaseService.updateWebhookStatus(idempotencyKey, "success")

      const processingTime = Date.now() - startTime
      logger.webhookSuccess(event.type, event.id, processingTime, requestId)

      return NextResponse.json({ received: true })
    } catch (processingError) {
      await ErrorHandler.handleWebhookError(processingError as Error, idempotencyKey, event.type, requestId)
      throw processingError
    }
  } catch (error) {
    const appError = ErrorHandler.categorizeError(error as Error, { requestId })
    logger.error("Webhook processing failed", appError, {}, requestId)

    const statusCode = appError.category === ErrorCategory.VALIDATION ? 400 : 500

    return NextResponse.json(
      {
        error: "Webhook processing failed",
        message: appError.message,
        retryable: appError.retryable,
      },
      { status: statusCode },
    )
  } finally {
    RequestContext.cleanup(requestId)
  }
}

async function handleCheckoutCompleted(event: any, idempotencyKey: string, requestId: string) {
  return await ErrorHandler.withRetry(
    async () => {
      const customerData = StripeService.extractCustomerData(event)
      const subscriptionData = StripeService.extractSubscriptionData(event)

      if (!customerData || !subscriptionData) {
        throw new AppError(
          "Failed to extract customer or subscription data from checkout event",
          ErrorCategory.BUSINESS_LOGIC,
          ErrorSeverity.HIGH,
        )
      }

      logger.info(
        "Processing checkout completion",
        {
          customerId: customerData.stripeCustomerId,
          subscriptionId: subscriptionData.stripeSubscriptionId,
        },
        requestId,
      )

      let customer = await DatabaseService.findCustomerByStripeId(customerData.stripeCustomerId)

      if (!customer) {
        if (!customerData.email) {
          const stripeCustomer = await StripeService.getCustomer(customerData.stripeCustomerId)
          customerData.email = stripeCustomer.email!
          customerData.name = stripeCustomer.name || undefined
        }

        const enhanceCustomer = await EnhanceService.createCustomer({
          email: customerData.email,
          name: customerData.name || customerData.email.split("@")[0],
          organizationName: customerData.name || customerData.email.split("@")[0],
        })

        customer = await DatabaseService.createCustomer({
          enhance_customer_id: enhanceCustomer.id,
          stripe_customer_id: customerData.stripeCustomerId,
          email: customerData.email,
          name: customerData.name,
        })
      }

      const planMapping = await DatabaseService.findPlanMapping("stripe", subscriptionData.stripePriceId!)
      if (!planMapping) {
        throw new AppError(
          `No plan mapping found for Stripe price: ${subscriptionData.stripePriceId}`,
          ErrorCategory.BUSINESS_LOGIC,
          ErrorSeverity.HIGH,
        )
      }

      const enhanceSubscription = await EnhanceService.createSubscription({
        customerId: customer.enhance_customer_id,
        planId: planMapping.enhance_plan_id,
      })

      await DatabaseService.createSubscription({
        customer_id: customer.id,
        enhance_subscription_id: enhanceSubscription.id,
        stripe_subscription_id: subscriptionData.stripeSubscriptionId,
        enhance_plan_id: planMapping.enhance_plan_id,
        status: "active",
      })

      logger.info(
        "Successfully created subscription",
        {
          customerEmail: customer.email,
          enhanceSubscriptionId: enhanceSubscription.id,
        },
        requestId,
      )
    },
    3,
    2000,
    requestId,
  )
}

async function handleSubscriptionDeleted(event: any, idempotencyKey: string, requestId: string) {
  return await ErrorHandler.withRetry(
    async () => {
      const subscriptionData = StripeService.extractSubscriptionData(event)

      if (!subscriptionData) {
        throw new AppError(
          "Failed to extract subscription data from deletion event",
          ErrorCategory.BUSINESS_LOGIC,
          ErrorSeverity.HIGH,
        )
      }

      const subscription = await DatabaseService.findSubscriptionByStripeId(subscriptionData.stripeSubscriptionId)
      if (!subscription) {
        logger.warn(
          "Subscription not found for deletion",
          {
            stripeSubscriptionId: subscriptionData.stripeSubscriptionId,
          },
          requestId,
        )
        return
      }

      await EnhanceService.suspendSubscription(subscription.enhance_subscription_id)
      await DatabaseService.updateSubscriptionStatus(subscription.id, "canceled")

      logger.info(
        "Successfully canceled subscription",
        {
          enhanceSubscriptionId: subscription.enhance_subscription_id,
        },
        requestId,
      )
    },
    3,
    2000,
    requestId,
  )
}

async function handleSubscriptionUpdated(event: any, idempotencyKey: string, requestId: string) {
  return await ErrorHandler.withRetry(
    async () => {
      const subscriptionData = StripeService.extractSubscriptionData(event)

      if (!subscriptionData) {
        throw new AppError(
          "Failed to extract subscription data from update event",
          ErrorCategory.BUSINESS_LOGIC,
          ErrorSeverity.HIGH,
        )
      }

      const subscription = await DatabaseService.findSubscriptionByStripeId(subscriptionData.stripeSubscriptionId)
      if (!subscription) {
        logger.info(
          "Subscription not found for update, skipping",
          {
            stripeSubscriptionId: subscriptionData.stripeSubscriptionId,
          },
          requestId,
        )
        return
      }

      let newStatus: "active" | "suspended" | "canceled"
      switch (subscriptionData.status) {
        case "active":
          newStatus = "active"
          await EnhanceService.reactivateSubscription(subscription.enhance_subscription_id)
          break
        case "past_due":
        case "unpaid":
          newStatus = "suspended"
          await EnhanceService.suspendSubscription(subscription.enhance_subscription_id)
          break
        case "canceled":
        case "incomplete_expired":
          newStatus = "canceled"
          await EnhanceService.suspendSubscription(subscription.enhance_subscription_id)
          break
        default:
          logger.info(
            `Unhandled subscription status: ${subscriptionData.status}`,
            {
              subscriptionId: subscription.enhance_subscription_id,
            },
            requestId,
          )
          return
      }

      await DatabaseService.updateSubscriptionStatus(subscription.id, newStatus)

      logger.info(
        "Successfully updated subscription status",
        {
          enhanceSubscriptionId: subscription.enhance_subscription_id,
          newStatus,
        },
        requestId,
      )
    },
    3,
    2000,
    requestId,
  )
}
