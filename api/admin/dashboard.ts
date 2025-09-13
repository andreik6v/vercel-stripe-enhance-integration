// Admin dashboard endpoint for monitoring
import { type NextRequest, NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database"
import { SubscriptionManager } from "@/lib/subscription-manager"
import { EnhanceService } from "@/lib/enhance"

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [subscriptionSummary, recentWebhooks, failedWebhooks, enhanceConnectionStatus] = await Promise.all([
      SubscriptionManager.getSubscriptionSummary(),
      DatabaseService.getRecentWebhookLogs(20),
      DatabaseService.getFailedWebhooks(),
      EnhanceService.testConnection(),
    ])

    return NextResponse.json({
      subscriptions: subscriptionSummary,
      webhooks: {
        recent: recentWebhooks,
        failed: failedWebhooks,
        failedCount: failedWebhooks.length,
      },
      services: {
        enhance: enhanceConnectionStatus ? "connected" : "disconnected",
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Dashboard endpoint error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
