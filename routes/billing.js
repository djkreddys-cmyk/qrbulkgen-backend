const Stripe = require("stripe")

module.exports = async function (fastify, opts) {

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
  const { PrismaClient } = require("@prisma/client")
  const prisma = new PrismaClient()

  // Create checkout session
  fastify.post(
    "/create-checkout-session",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {

      const userId = request.user.userId

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: `${process.env.APP_URL}/dashboard?success=true`,
        cancel_url: `${process.env.APP_URL}/dashboard?canceled=true`,
        metadata: {
          userId: userId.toString()
        }
      })

      return { url: session.url }
    }
  )
  fastify.post("/stripe-webhook", async (request, reply) => {

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
  const sig = request.headers["stripe-signature"]

  let event

  try {
    event = stripe.webhooks.constructEvent(
      request.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    return reply.code(400).send(`Webhook Error: ${err.message}`)
  }

  // Payment successful
  if (event.type === "checkout.session.completed") {
    const session = event.data.object
    const userId = Number(session.metadata.userId)

    await prisma.user.update({
      where: { id: userId },
      data: { plan: "PRO" }
    })
  }

  return reply.send({ received: true })
})
}