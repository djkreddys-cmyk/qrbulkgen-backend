require("dotenv").config()

const fastify = require("fastify")({ logger: true })
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

// Test route
fastify.get("/", async (request, reply) => {
  return { message: "Backend working 🚀" }
})

// Create user route
fastify.post("/users", async (request, reply) => {
  const { email, name } = request.body

  const user = await prisma.user.create({
    data: { email, name }
  })

  return user
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

// Create user
fastify.get("/users", async () => {
  const users = await prisma.user.findMany()
  return users
})

//User deleted
fastify.delete("/users/:id", async (request) => {
  const { id } = request.params

  await prisma.user.delete({
    where: { id: Number(id) }
  })

  return { message: "User deleted successfully" }
})