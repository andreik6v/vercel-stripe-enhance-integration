// Admin endpoint for customer management
import { type NextRequest, NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database"
import { EnhanceService } from "@/lib/enhance"

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get("email")
    const customerId = searchParams.get("customerId")

    if (email) {
      const customer = await DatabaseService.findCustomerByEmail(email)
      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 })
      }

      const subscriptions = await DatabaseService.getCustomerSubscriptions(customer.id)

      return NextResponse.json({
        customer,
        subscriptions,
      })
    }

    if (customerId) {
      const customer = await DatabaseService.findCustomerByStripeId(customerId)
      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 })
      }

      const subscriptions = await DatabaseService.getCustomerSubscriptions(customer.id)

      return NextResponse.json({
        customer,
        subscriptions,
      })
    }

    return NextResponse.json({ error: "Email or customerId parameter required" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Customer lookup error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { customerId, email, name, organizationName } = body

    if (!customerId) {
      return NextResponse.json({ error: "customerId required" }, { status: 400 })
    }

    const customer = await DatabaseService.findCustomerByStripeId(customerId)
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    const updatedEnhanceCustomer = await EnhanceService.updateCustomer(customer.enhance_customer_id, {
      email,
      name,
      organizationName,
    })

    const updatedCustomer = await DatabaseService.updateCustomer(customer.id, {
      email: email || customer.email,
      name: name || customer.name,
    })

    return NextResponse.json({
      success: true,
      customer: updatedCustomer,
    })
  } catch (error) {
    console.error("[v0] Customer update error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
