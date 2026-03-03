module.exports = async function (fastify, opts) {
  const { PrismaClient } = require("@prisma/client")
  const bcrypt = require("bcrypt")
  const jwt = require("jsonwebtoken")
  const prisma = new PrismaClient()

  // 🔹 CREATE USER (basic)
  fastify.post("/users", async (request) => {
    const { email, name } = request.body

    return await prisma.user.create({
      data: { email, name }
    })
  })

  // 🔹 GET ALL USERS
  fastify.get("/users", async () => {
    return await prisma.user.findMany()
  })

  // 🔹 UPDATE USER
  fastify.put("/users/:id", async (request) => {
    const { id } = request.params
    const { email, name } = request.body

    return await prisma.user.update({
      where: { id: Number(id) },
      data: { email, name }
    })
  })

  // 🔹 DELETE USER
  fastify.delete("/users/:id", async (request) => {
    const { id } = request.params

    await prisma.user.delete({
      where: { id: Number(id) }
    })

    return { message: "User deleted successfully" }
  })

  // 🔥 REGISTER USER (secure with password)
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
  // 🔐 LOGIN
  fastify.post("/login", async (request, reply) => {
    const { email, password } = request.body

    if (!email || !password) {
      return reply.code(400).send({ message: "Email and password required" })
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return reply.code(400).send({ message: "Invalid credentials" })
    }

    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      return reply.code(400).send({ message: "Invalid credentials" })
    }

    const token = fastify.jwt.sign(
      { userId: user.id },
      { expiresIn: "7d" }
    )

    return {
      message: "Login successful",
      token
    }
  })
}