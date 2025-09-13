// Request context for tracking requests across the system
import { randomUUID } from "crypto"

export class RequestContext {
  private static contexts = new Map<string, RequestContext>()

  public readonly id: string
  public readonly startTime: Date
  public metadata: Record<string, any> = {}

  private constructor(id?: string) {
    this.id = id || randomUUID()
    this.startTime = new Date()
  }

  static create(id?: string): RequestContext {
    const context = new RequestContext(id)
    RequestContext.contexts.set(context.id, context)
    return context
  }

  static get(id: string): RequestContext | undefined {
    return RequestContext.contexts.get(id)
  }

  static cleanup(id: string): void {
    RequestContext.contexts.delete(id)
  }

  setMetadata(key: string, value: any): void {
    this.metadata[key] = value
  }

  getMetadata(key: string): any {
    return this.metadata[key]
  }

  getDuration(): number {
    return Date.now() - this.startTime.getTime()
  }
}
