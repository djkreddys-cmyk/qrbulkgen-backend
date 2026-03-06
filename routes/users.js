module.exports = async function (fastify, opts) {

  const bcrypt = require("bcrypt")
  const crypto = require("crypto")
  const prisma = require("../lib/prisma")
  const { Resend } = require("resend")
  const resend = new Resend(process.env.RESEND_API_KEY)

  // 🔹 UPDATE USER
  fastify.put(
    "/users/:id",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {

      const { id } = request.params
      const { name } = request.body

      if (Number(id) !== request.user.userId) {
        return reply.code(403).send({ message: "Forbidden" })
      }

      return prisma.user.update({
        where: { id: Number(id) },
        data: { name }
      })
    }
  )

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
      {
        userId: user.id,
        email: user.email,
        role: "user"
      },
      { expiresIn: "7d" }
    )

    return {
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan
      }
    }
  })

  // 🔐 GET CURRENT USER
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request) => {

      const userId = request.user.userId

      return prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          plan: true,
          createdAt: true
        }
      })
    }
  )
fastify.post("/forgot-password", async (request, reply) => {

  const { email } = request.body

  if (!email) {
    return reply.code(400).send({ message: "Email is required" })
  }

  const user = await prisma.user.findUnique({
    where: { email }
  })

  if (!user) {
    return { message: "If email exists, reset link sent" }
  }

  const token = crypto.randomBytes(32).toString("hex")

  await prisma.user.update({
    where: { email },
    data: {
      resetToken: token,
      resetTokenExpiry: new Date(Date.now() + 3600000) // 1 hour
    }
  })
  const resetLink = `https://qrbulkgen.com/reset-password/${token}`
  await resend.emails.send({
  from: "QRBulkGen <noreply@qrbulkgen.com>",
  to: email,
  subject: "Reset your password",
  html: `
    <h2>Reset your password</h2>
    <p>Click below to reset your password:</p>
    <a href="${resetLink}">${resetLink}</a>
  `
})

  return {
  message: "Password reset email sent"
  }
})
  
fastify.post("/reset-password", async (request, reply) => {

  const { token, password } = request.body

  if (!token || !password) {
    return reply.code(400).send({ message: "Invalid request" })
  }

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: {
        gt: new Date()
      }
    }
  })

  if (!user) {
    return reply.code(400).send({ message: "Invalid or expired token" })
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null
    }
  })

  return {
    message: "Password updated successfully"
  }
})
}
