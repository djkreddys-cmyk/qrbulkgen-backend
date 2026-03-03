const Stripe = require("stripe")

module.exports = async function (fastify, opts) {

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const { PrismaClient } = require("@prisma/client")
  const prisma = new PrismaClient()

  // ===============================
  // 🔹 CREATE CHECKOUT SESSION
  // ===============================

  fastify.post(
    "/create-checkout-session",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {

      const userId = request.user.userId

      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      let customerId = user.stripeCustomerId

      // If no Stripe customer yet, create one
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email
        })

        customerId = customer.id

        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: customerId }
        })
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1
          }
        ],
        success_url: "http://localhost:5173/dashboard?success=true",
        cancel_url: "http://localhost:5173/dashboard?canceled=true"
      })

      return { url: session.url }
    }
  )

  // ===============================
  // 🔹 BILLING STATUS
  // ===============================

  fastify.get(
    "/status",
    { preHandler: [fastify.authenticate] },
    async (request) => {

      const userId = request.user.userId

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          plan: true,
          stripeSubscriptionId: true
        }
      })

      return {
        plan: user.plan,
        subscribed: !!user.stripeSubscriptionId
      }
    }
  )
// ===============================
// 🔹 STRIPE WEBHOOK (CRITICAL)
// ===============================

fastify.post(
  "/webhook",
  {
    config: {
      rawBody: true
    }
  },
  async (request, reply) => {

    let event

    try {
      event = stripe.webhooks.constructEvent(
        request.rawBody,
        request.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      )
    } catch (err) {
      console.error("Webhook signature failed:", err.message)
      return reply.code(400).send(`Webhook Error: ${err.message}`)
    }

    // ======================================
    // ✅ SUBSCRIPTION ACTIVATED (UPGRADE)
    // ======================================
    if (event.type === "checkout.session.completed") {

      const session = event.data.object
      const subscriptionId = session.subscription
      const customerId = session.customer

      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          plan: "PRO",
          stripeSubscriptionId: subscriptionId
        }
      })

      console.log("User upgraded to PRO")
    }

    // ======================================
    // 🔴 AUTO DOWNGRADE (CRITICAL)
    // ======================================
    if (
      event.type === "customer.subscription.deleted" ||
      event.type === "invoice.payment_failed" ||
      event.type === "customer.subscription.updated"
    ) {

      const subscription = event.data.object

      // If subscription is canceled or unpaid
      if (
        subscription.status === "canceled" ||
        subscription.status === "unpaid" ||
        subscription.status === "incomplete_expired"
      ) {

        await prisma.user.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            plan: "FREE",
            stripeSubscriptionId: null
          }
        })

        console.log("User downgraded to FREE")
      }
    }

    return reply.send({ received: true })
  }
)
}