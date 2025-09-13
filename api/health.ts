// Health check endpoint for monitoring system status
import { type NextRequest, NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database"
import { EnhanceService } from "@/lib/enhance"
import { logger } from "@/lib/logger"
import { RequestContext } from "@/lib/request-context"

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy"
  timestamp: string
  version: string
  uptime: number
  services: {
    database: ServiceHealth
    enhance: ServiceHealth
    stripe: ServiceHealth
  }
  metrics: {
    totalSubscriptions: number
    activeSubscriptions: number
    failedWebhooks: number
    recentErrors: number
  }
}

interface ServiceHealth {
  status: "healthy" | "degraded" | "unhealthy"
  responseTime?: number
  lastCheck: string
  error?: string
}

const startTime = Date.now()

export async function GET(request: NextRequest) {
  const requestContext = RequestContext.create()
  const requestId = requestContext.id

  try {
    logger.info("Health check requested", {}, requestId)

    const healthCheck: HealthCheckResult = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "1.0.0",
      uptime: Date.now() - startTime,
      services: {
        database: await checkDatabaseHealth(requestId),
        enhance: await checkEnhanceHealth(requestId),
        stripe: await checkStripeHealth(requestId),
      },
      metrics: await getSystemMetrics(requestId),
    }

    const serviceStatuses = Object.values(healthCheck.services).map((s) => s.status)

    if (serviceStatuses.includes("unhealthy")) {
      healthCheck.status = "unhealthy"
    } else if (serviceStatuses.includes("degraded")) {
      healthCheck.status = "degraded"
    }

    const httpStatus = healthCheck.status === "healthy" ? 200 : healthCheck.status === "degraded" ? 200 : 503

    logger.info(
      "Health check completed",
      {
        overallStatus: healthCheck.status,
        databaseStatus: healthCheck.services.database.status,
        enhanceStatus: healthCheck.services.enhance.status,
      },
      requestId,
    )

    return NextResponse.json(healthCheck, { status: httpStatus })
  } catch (error) {
    logger.error("Health check failed", error as Error, {}, requestId)

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Health check system failure",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 },
    )
  } finally {
    RequestContext.cleanup(requestId)
  }
}

async function checkDatabaseHealth(requestId: string): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    await DatabaseService.testConnection()

    const responseTime = Date.now() - startTime

    return {
      status: responseTime < 1000 ? "healthy" : "degraded",
      responseTime,
      lastCheck: new Date().toISOString(),
    }
  } catch (error) {
    logger.error("Database health check failed", error as Error, {}, requestId)

    return {
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown database error",
    }
  }
}

async function checkEnhanceHealth(requestId: string): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    const isConnected = await EnhanceService.testConnection()
    const responseTime = Date.now() - startTime

    return {
      status: isConnected ? (responseTime < 2000 ? "healthy" : "degraded") : "unhealthy",
      responseTime,
      lastCheck: new Date().toISOString(),
      error: isConnected ? undefined : "Enhance API connection failed",
    }
  } catch (error) {
    logger.error("Enhance health check failed", error as Error, {}, requestId)

    return {
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown Enhance API error",
    }
  }
}

async function checkStripeHealth(requestId: string): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    const hasSecretKey = !!process.env.STRIPE_SECRET_KEY
    const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET

    if (!hasSecretKey || !hasWebhookSecret) {
      return {
        status: "unhealthy",
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        error: "Missing Stripe configuration",
      }
    }

    return {
      status: "healthy",
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
    }
  } catch (error) {
    logger.error("Stripe health check failed", error as Error, {}, requestId)

    return {
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown Stripe error",
    }
  }
}

async function getSystemMetrics(requestId: string): Promise<{
  totalSubscriptions: number
  activeSubscriptions: number
  failedWebhooks: number
  recentErrors: number
}> {
  try {
    const [subscriptionSummary, failedWebhooks] = await Promise.all([
      DatabaseService.getSubscriptionSummary(),
      DatabaseService.getFailedWebhooks(),
    ])

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentErrors = failedWebhooks.filter((webhook) => new Date(webhook.created_at) > oneDayAgo).length

    return {
      totalSubscriptions: subscriptionSummary.total,
      activeSubscriptions: subscriptionSummary.active,
      failedWebhooks: failedWebhooks.length,
      recentErrors,
    }
  } catch (error) {
    logger.error("Failed to get system metrics", error as Error, {}, requestId)

    return {
      totalSubscriptions: 0,
      activeSubscriptions: 0,
      failedWebhooks: 0,
      recentErrors: 0,
    }
  }
}
