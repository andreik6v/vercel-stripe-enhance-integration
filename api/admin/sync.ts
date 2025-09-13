// Admin endpoint for manual subscription synchronization
import { type NextRequest, NextResponse } from "next/server"
import { SubscriptionManager } from "@/lib/subscription-manager"

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { subscriptionId } = body

    if (subscriptionId) {
      await SubscriptionManager.syncSingleSubscription(subscriptionId)
      return NextResponse.json({
        success: true,
        message: `Synced subscription ${subscriptionId}`,
      })
    } else {
      const result = await SubscriptionManager.syncAllSubscriptions()
      return NextResponse.json(result)
    }
  } catch (error) {
    console.error("[v0] Sync endpoint error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
