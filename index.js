require("dotenv").config()

const fastify = require("fastify")({ logger: true })

// Register routes
fastify.register(require("./routes/users"))
fastify.register(require("./routes/qr"))

// Health check
fastify.get("/", async () => {
  return { message: "Backend working 🚀" }
})

const start = async () => {
  try {
    await fastify.listen({
      port: process.env.PORT || 3000,
      host: "0.0.0.0"
    })

    console.log("Server running 🚀")
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()