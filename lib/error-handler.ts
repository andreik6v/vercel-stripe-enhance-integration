// Centralized error handling with categorization and recovery strategies
import { logger } from "./logger"
import { DatabaseService } from "./database"

export enum ErrorCategory {
  VALIDATION = "validation",
  AUTHENTICATION = "authentication",
  EXTERNAL_API = "external_api",
  DATABASE = "database",
  BUSINESS_LOGIC = "business_logic",
  SYSTEM = "system",
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface ErrorContext {
  category: ErrorCategory
  severity: ErrorSeverity
  retryable: boolean
  webhookId?: string
  customerId?: string
  subscriptionId?: string
  requestId?: string
}

export class AppError extends Error {
  public readonly category: ErrorCategory
  public readonly severity: ErrorSeverity
  public readonly retryable: boolean
  public readonly context: Record<string, any>
  public readonly timestamp: Date

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    retryable = false,
    context: Record<string, any> = {},
  ) {
    super(message)
    this.name = "AppError"
    this.category = category
    this.severity = severity
    this.retryable = retryable
    this.context = context
    this.timestamp = new Date()
  }
}

export class ErrorHandler {
  static async handleWebhookError(
    error: Error,
    idempotencyKey: string,
    eventType: string,
    requestId?: string,
  ): Promise<void> {
    const appError = this.categorizeError(error, { webhookId: idempotencyKey })

    logger.webhookError(eventType, idempotencyKey, appError, requestId)

    await DatabaseService.updateWebhookStatus(idempotencyKey, "error", `${appError.category}: ${appError.message}`)

    if (appError.severity === ErrorSeverity.CRITICAL) {
      await this.sendCriticalAlert(appError, requestId)
    }
  }

  static async handleApiError(
    error: Error,
    service: string,
    operation: string,
    context: Record<string, any> = {},
    requestId?: string,
  ): Promise<never> {
    const appError = this.categorizeError(error, context)

    logger.apiCallError(service, "POST", operation, appError, requestId)

    await this.logErrorToDatabase(appError, requestId)

    throw appError
  }

  static categorizeError(error: Error, context: Record<string, any> = {}): AppError {
    if (error instanceof AppError) {
      return error
    }

    const message = error.message.toLowerCase()

    if (message.includes("fetch") || message.includes("network") || message.includes("timeout")) {
      return new AppError(error.message, ErrorCategory.EXTERNAL_API, ErrorSeverity.HIGH, true, context)
    }

    if (message.includes("database") || message.includes("sql") || message.includes("connection")) {
      return new AppError(error.message, ErrorCategory.DATABASE, ErrorSeverity.HIGH, true, context)
    }

    if (message.includes("unauthorized") || message.includes("forbidden") || message.includes("token")) {
      return new AppError(error.message, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, false, context)
    }

    if (message.includes("validation") || message.includes("invalid") || message.includes("required")) {
      return new AppError(error.message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, false, context)
    }

    return new AppError(error.message, ErrorCategory.SYSTEM, ErrorSeverity.MEDIUM, false, context)
  }

  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000,
    requestId?: string,
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error
        const appError = this.categorizeError(lastError)

        logger.warn(
          `Operation failed, attempt ${attempt}/${maxRetries}`,
          {
            error: appError.message,
            retryable: appError.retryable,
          },
          requestId,
        )

        if (!appError.retryable) {
          throw appError
        }

        if (attempt === maxRetries) {
          break
        }

        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw this.categorizeError(lastError!, { attempts: maxRetries })
  }

  private static async logErrorToDatabase(error: AppError, requestId?: string): Promise<void> {
    try {
      logger.debug(
        "Error logged to monitoring system",
        {
          category: error.category,
          severity: error.severity,
          retryable: error.retryable,
          context: error.context,
        },
        requestId,
      )
    } catch (logError) {
      logger.error("Failed to log error to database", logError as Error, {}, requestId)
    }
  }

  private static async sendCriticalAlert(error: AppError, requestId?: string): Promise<void> {
    try {
      logger.error(
        "CRITICAL ERROR ALERT",
        error,
        {
          category: error.category,
          severity: error.severity,
          context: error.context,
        },
        requestId,
      )

      console.error("🚨 CRITICAL ERROR ALERT 🚨", {
        message: error.message,
        category: error.category,
        timestamp: error.timestamp,
        context: error.context,
        requestId,
      })
    } catch (alertError) {
      logger.error("Failed to send critical alert", alertError as Error, {}, requestId)
    }
  }
}
