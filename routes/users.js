module.exports = async function (fastify, opts) {
  const { PrismaClient } = require("@prisma/client")
  const prisma = new PrismaClient()

  // Create user
  fastify.post("/users", async (request) => {
    const { email, name } = request.body

    return await prisma.user.create({
      data: { email, name }
    })
  })

  // Get all users
  fastify.get("/users", async () => {
    return await prisma.user.findMany()
  })

  // Delete user
  fastify.delete("/users/:id", async (request) => {
    const { id } = request.params

    await prisma.user.delete({
      where: { id: Number(id) }
    })

    return { message: "User deleted successfully" }
  })

  // Update user
  fastify.put("/users/:id", async (request) => {
    const { id } = request.params
    const { email, name } = request.body

    return await prisma.user.update({
      where: { id: Number(id) },
      data: { email, name }
    })
  })
}

const bcrypt = require("bcrypt")
const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

module.exports = async function (fastify, opts) {

  // 🔥 REGISTER USER
  fastify.post("/register", async (request, reply) => {
    const { name, email, password } = request.body

    if (!name || !email || !password) {
      return reply.code(400).send({ message: "All fields required" })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return reply.code(400).send({ message: "Email already exists" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword
      }
    })

    return {
      message: "User created successfully",
      user: {
        id: user.id,
        email: user.email
      }
    }
  })

}