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
//Update Route
fastify.put("/users/:id", async (request) => {
  const { id } = request.params
  const { email, name } = request.body

  const updatedUser = await prisma.user.update({
    where: { id: Number(id) },
    data: {
      email,
      name
    }
  })

  return updatedUser
})

const QRCodeLib = require("qrcode")
const { nanoid } = require("nanoid")

//Generate Dynamic QR
fastify.post("/generate-dynamic-qr", async (request) => {
  const { type, destination } = request.body

  if (!destination) {
    return { error: "Destination is required" }
  }

  const shortCode = nanoid(6)

  await prisma.qRCode.create({
    data: {
      type,
      shortCode,
      destination
    }
  })

  const shortUrl = `https://qrbulkgen-backend-production.up.railway.app/s/${shortCode}`

  const qrImage = await QRCodeLib.toDataURL(shortUrl)

  return {
    qr: qrImage,
    shortUrl
  }
})
// Redirect Route (Very Important)
fastify.get("/s/:code", async (request, reply) => {
  const { code } = request.params

  const record = await prisma.qRCode.findUnique({
    where: { shortCode: code }
  })

  if (!record) {
    return reply.code(404).send({ message: "QR not found" })
  }

  // Increment scan count
  await prisma.qRCode.update({
    where: { shortCode: code },
    data: { scanCount: { increment: 1 } }
  })

  return reply.redirect(record.destination)
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