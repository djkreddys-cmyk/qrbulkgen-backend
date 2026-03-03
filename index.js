require("dotenv").config()

const fastify = require("fastify")({ logger: true })
const cors = require("@fastify/cors")
fastify.register(require("./routes/billing"))

// ✅ CORS
fastify.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
})

// ✅ JWT
const jwt = require("@fastify/jwt")

fastify.register(jwt, {
  secret: process.env.JWT_SECRET
})

// ✅ ADD THIS (VERY IMPORTANT)
fastify.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ message: "Unauthorized" })
  }
})

// ✅ Register routes AFTER JWT
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
      host: "0.0.0.0",
    })

    console.log("Server running 🚀")
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()