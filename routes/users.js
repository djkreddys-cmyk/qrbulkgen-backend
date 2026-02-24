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