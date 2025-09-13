// Subscription management service that coordinates between Stripe and Enhance
import { DatabaseService } from "./database"
import { EnhanceService } from "./enhance"
import { StripeService } from "./stripe"

export interface SubscriptionSyncResult {
  success: boolean
  message: string
  errors?: string[]
}

export class SubscriptionManager {
  static async syncAllSubscriptions(): Promise<SubscriptionSyncResult> {
    const errors: string[] = []
    let syncedCount = 0

    try {
      const subscriptions = await DatabaseService.getAllActiveSubscriptions()

      for (const subscription of subscriptions) {
        try {
          await this.syncSingleSubscription(subscription.stripe_subscription_id!)
          syncedCount++
        } catch (error) {
          const errorMsg = `Failed to sync subscription ${subscription.stripe_subscription_id}: ${error}`
          console.error(`[v0] ${errorMsg}`)
          errors.push(errorMsg)
        }
      }

      return {
        success: errors.length === 0,
        message: `Synced ${syncedCount} subscriptions${errors.length > 0 ? ` with ${errors.length} errors` : ""}`,
        errors: errors.length > 0 ? errors : undefined,
      }
    } catch (error) {
      return {
        success: false,
        message: `Sync failed: ${error}`,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      }
    }
  }

  static async syncSingleSubscription(stripeSubscriptionId: string): Promise<void> {
    const dbSubscription = await DatabaseService.findSubscriptionByStripeId(stripeSubscriptionId)
    if (!dbSubscription) {
      throw new Error(`Subscription not found in database: ${stripeSubscriptionId}`)
    }

    const stripeSubscription = await StripeService.getSubscription(stripeSubscriptionId)

    const enhanceSubscription = await EnhanceService.getSubscription(dbSubscription.enhance_subscription_id)

    let targetStatus: "active" | "suspended" | "canceled"
    switch (stripeSubscription.status) {
      case "active":
        targetStatus = "active"
        break
      case "past_due":
      case "unpaid":
        targetStatus = "suspended"
        break
      case "canceled":
      case "incomplete_expired":
        targetStatus = "canceled"
        break
      default:
        console.log(`[v0] Unknown Stripe status: ${stripeSubscription.status}, skipping sync`)
        return
    }

    if (enhanceSubscription.status !== targetStatus) {
      switch (targetStatus) {
        case "active":
          await EnhanceService.reactivateSubscription(dbSubscription.enhance_subscription_id)
          break
        case "suspended":
          await EnhanceService.suspendSubscription(dbSubscription.enhance_subscription_id)
          break
        case "canceled":
          await EnhanceService.cancelSubscription(dbSubscription.enhance_subscription_id)
          break
      }
    }

    if (dbSubscription.status !== targetStatus) {
      await DatabaseService.updateSubscriptionStatus(dbSubscription.id, targetStatus)
    }

    console.log(`[v0] Synced subscription ${stripeSubscriptionId}: ${targetStatus}`)
  }

  static async changePlan(stripeSubscriptionId: string, newStripePriceId: string): Promise<void> {
    const dbSubscription = await DatabaseService.findSubscriptionByStripeId(stripeSubscriptionId)
    if (!dbSubscription) {
      throw new Error(`Subscription not found: ${stripeSubscriptionId}`)
    }

    const newPlanMapping = await DatabaseService.findPlanMapping("stripe", newStripePriceId)
    if (!newPlanMapping) {
      throw new Error(`No plan mapping found for Stripe price: ${newStripePriceId}`)
    }

    await EnhanceService.changeSubscriptionPlan(dbSubscription.enhance_subscription_id, newPlanMapping.enhance_plan_id)

    await DatabaseService.updateSubscriptionPlan(dbSubscription.id, newPlanMapping.enhance_plan_id)

    console.log(`[v0] Changed plan for subscription ${stripeSubscriptionId} to ${newPlanMapping.enhance_plan_id}`)
  }

  static async getSubscriptionSummary(): Promise<{
    total: number
    active: number
    suspended: number
    canceled: number
  }> {
    return await DatabaseService.getSubscriptionSummary()
  }
}
