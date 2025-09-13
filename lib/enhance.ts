// Enhance API integration service
export interface EnhanceCustomer {
  id: string
  email: string
  name: string
  organizationName: string
  createdAt: string
}

export interface EnhanceSubscription {
  id: string
  customerId: string
  planId: string
  status: "active" | "suspended" | "canceled"
  createdAt: string
}

export interface EnhancePlan {
  id: string
  name: string
  features: string[]
}

export class EnhanceService {
  private static readonly BASE_URL = process.env.ENHANCE_API_URL || "https://api.enhance.com"
  private static readonly API_TOKEN = process.env.ENHANCE_API_TOKEN!
  private static readonly ORG_ID = process.env.ENHANCE_ORG_ID!

  private static async makeRequest<T>(endpoint: string, options: RequestInit = {}, retries = 3): Promise<T> {
    const url = `${this.BASE_URL}${endpoint}`

    const defaultHeaders = {
      Authorization: `Bearer ${this.API_TOKEN}`,
      "Content-Type": "application/json",
      "X-Organization-ID": this.ORG_ID,
    }

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[v0] Enhance API request: ${options.method || "GET"} ${url} (attempt ${attempt})`)

        const response = await fetch(url, config)

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Enhance API error (${response.status}): ${errorText}`)
        }

        const data = await response.json()
        console.log(`[v0] Enhance API success: ${options.method || "GET"} ${url}`)
        return data
      } catch (error) {
        console.error(`[v0] Enhance API attempt ${attempt} failed:`, error)

        if (attempt === retries) {
          throw error
        }

        const delay = Math.pow(2, attempt) * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw new Error("All retry attempts failed")
  }

  static async createCustomer(data: {
    email: string
    name: string
    organizationName: string
  }): Promise<EnhanceCustomer> {
    const password = this.generateSecurePassword()

    const payload = {
      email: data.email,
      name: data.name,
      organization_name: data.organizationName,
      password: password,
      send_welcome_email: true,
    }

    const response = await this.makeRequest<{
      customer: EnhanceCustomer
    }>("/customers", {
      method: "POST",
      body: JSON.stringify(payload),
    })

    console.log(`[v0] Created Enhance customer: ${response.customer.id} for ${data.email}`)
    return response.customer
  }

  static async createSubscription(data: {
    customerId: string
    planId: string
  }): Promise<EnhanceSubscription> {
    const payload = {
      customer_id: data.customerId,
      plan_id: data.planId,
      auto_provision: true,
    }

    const response = await this.makeRequest<{
      subscription: EnhanceSubscription
    }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    })

    console.log(`[v0] Created Enhance subscription: ${response.subscription.id} for customer ${data.customerId}`)
    return response.subscription
  }

  static async suspendSubscription(subscriptionId: string): Promise<void> {
    await this.makeRequest(`/subscriptions/${subscriptionId}/suspend`, {
      method: "POST",
    })

    console.log(`[v0] Suspended Enhance subscription: ${subscriptionId}`)
  }

  static async reactivateSubscription(subscriptionId: string): Promise<void> {
    await this.makeRequest(`/subscriptions/${subscriptionId}/reactivate`, {
      method: "POST",
    })

    console.log(`[v0] Reactivated Enhance subscription: ${subscriptionId}`)
  }

  static async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.makeRequest(`/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    })

    console.log(`[v0] Canceled Enhance subscription: ${subscriptionId}`)
  }

  static async getCustomer(customerId: string): Promise<EnhanceCustomer> {
    const response = await this.makeRequest<{
      customer: EnhanceCustomer
    }>(`/customers/${customerId}`)

    return response.customer
  }

  static async getSubscription(subscriptionId: string): Promise<EnhanceSubscription> {
    const response = await this.makeRequest<{
      subscription: EnhanceSubscription
    }>(`/subscriptions/${subscriptionId}`)

    return response.subscription
  }

  static async getPlans(): Promise<EnhancePlan[]> {
    const response = await this.makeRequest<{
      plans: EnhancePlan[]
    }>("/plans")

    return response.plans
  }

  static async updateCustomer(
    customerId: string,
    data: {
      email?: string
      name?: string
      organizationName?: string
    },
  ): Promise<EnhanceCustomer> {
    const payload: any = {}

    if (data.email) payload.email = data.email
    if (data.name) payload.name = data.name
    if (data.organizationName) payload.organization_name = data.organizationName

    const response = await this.makeRequest<{
      customer: EnhanceCustomer
    }>(`/customers/${customerId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    })

    console.log(`[v0] Updated Enhance customer: ${customerId}`)
    return response.customer
  }

  static async changeSubscriptionPlan(subscriptionId: string, newPlanId: string): Promise<EnhanceSubscription> {
    const payload = {
      plan_id: newPlanId,
    }

    const response = await this.makeRequest<{
      subscription: EnhanceSubscription
    }>(`/subscriptions/${subscriptionId}/change-plan`, {
      method: "POST",
      body: JSON.stringify(payload),
    })

    console.log(`[v0] Changed plan for subscription ${subscriptionId} to ${newPlanId}`)
    return response.subscription
  }

  private static generateSecurePassword(): string {
    const length = 16
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    let password = ""

    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }

    return password
  }

  static async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest("/health")
      return true
    } catch (error) {
      console.error("[v0] Enhance API connection test failed:", error)
      return false
    }
  }
}
