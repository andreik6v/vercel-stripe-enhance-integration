// Centralized logging service with structured logging
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, any>
  error?: Error
  requestId?: string
}

export class Logger {
  private static instance: Logger
  private logLevel: LogLevel

  private constructor() {
    this.logLevel = this.getLogLevelFromEnv()
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  private getLogLevelFromEnv(): LogLevel {
    const level = process.env.LOG_LEVEL?.toUpperCase()
    switch (level) {
      case "DEBUG":
        return LogLevel.DEBUG
      case "INFO":
        return LogLevel.INFO
      case "WARN":
        return LogLevel.WARN
      case "ERROR":
        return LogLevel.ERROR
      default:
        return LogLevel.INFO
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel
  }

  private formatLog(entry: LogEntry): string {
    const { timestamp, level, message, context, error, requestId } = entry
    const levelName = LogLevel[level]

    let logMessage = `[${timestamp}] [${levelName}]`

    if (requestId) {
      logMessage += ` [${requestId}]`
    }

    logMessage += ` ${message}`

    if (context && Object.keys(context).length > 0) {
      logMessage += ` | Context: ${JSON.stringify(context)}`
    }

    if (error) {
      logMessage += ` | Error: ${error.message}`
      if (error.stack) {
        logMessage += ` | Stack: ${error.stack}`
      }
    }

    return logMessage
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error,
    requestId?: string,
  ): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error,
      requestId,
    }

    const formattedLog = this.formatLog(entry)

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedLog)
        break
      case LogLevel.INFO:
        console.info(formattedLog)
        break
      case LogLevel.WARN:
        console.warn(formattedLog)
        break
      case LogLevel.ERROR:
        console.error(formattedLog)
        break
    }
  }

  debug(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.DEBUG, message, context, undefined, requestId)
  }

  info(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.INFO, message, context, undefined, requestId)
  }

  warn(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.WARN, message, context, undefined, requestId)
  }

  error(message: string, error?: Error, context?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.ERROR, message, context, error, requestId)
  }

  webhookReceived(eventType: string, eventId: string, source: string, requestId?: string): void {
    this.info(
      "Webhook received",
      {
        eventType,
        eventId,
        source,
      },
      requestId,
    )
  }

  webhookProcessing(eventType: string, eventId: string, requestId?: string): void {
    this.info(
      "Webhook processing started",
      {
        eventType,
        eventId,
      },
      requestId,
    )
  }

  webhookSuccess(eventType: string, eventId: string, processingTime: number, requestId?: string): void {
    this.info(
      "Webhook processed successfully",
      {
        eventType,
        eventId,
        processingTimeMs: processingTime,
      },
      requestId,
    )
  }

  webhookError(eventType: string, eventId: string, error: Error, requestId?: string): void {
    this.error(
      "Webhook processing failed",
      error,
      {
        eventType,
        eventId,
      },
      requestId,
    )
  }

  apiCallStart(service: string, method: string, endpoint: string, requestId?: string): void {
    this.debug(
      "API call started",
      {
        service,
        method,
        endpoint,
      },
      requestId,
    )
  }

  apiCallSuccess(service: string, method: string, endpoint: string, responseTime: number, requestId?: string): void {
    this.info(
      "API call successful",
      {
        service,
        method,
        endpoint,
        responseTimeMs: responseTime,
      },
      requestId,
    )
  }

  apiCallError(service: string, method: string, endpoint: string, error: Error, requestId?: string): void {
    this.error(
      "API call failed",
      error,
      {
        service,
        method,
        endpoint,
      },
      requestId,
    )
  }
}

export const logger = Logger.getInstance()
