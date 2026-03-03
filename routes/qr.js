module.exports = async function (fastify, opts) {

  const { PrismaClient } = require("@prisma/client")
  const prisma = new PrismaClient()
  const QRCodeLib = require("qrcode")
  const { nanoid } = require("nanoid")
  const bcrypt = require("bcrypt")

  // 🔹 Generate QR
  fastify.post(
  "/generate-dynamic-qr",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const { type, data } = request.body
    const userId = request.user.userId

    if (!type) return reply.code(400).send({ message: "Type is required" })
    if (!userId) return reply.code(400).send({ message: "userId required" })

    let formattedValue

    switch (type) {
      case "URL":
        formattedValue = data.url
        if (!formattedValue.startsWith("http")) {
          formattedValue = `https://${formattedValue}`
        }
        break
      case "TEXT":
        formattedValue = data.text
        break
      case "EMAIL":
        formattedValue = `mailto:${data.email}`
        break
      case "WHATSAPP":
        formattedValue = `https://wa.me/${data.phone}`
        break
      case "PHONE":
        formattedValue = `tel:${data.phone}`
        break
      default:
        return reply.code(400).send({ message: "Invalid QR type" })
    }

    const shortCode = nanoid(8)

    await prisma.qRCode.create({
      data: {
        type,
        shortCode,
        destination: formattedValue,
        userId: Number(userId),
      },
    })

    const shortUrl = `${process.env.APP_URL}/s/${shortCode}`
    const qr = await QRCodeLib.toDataURL(shortUrl)

    return { qr, shortUrl }
  })

    // 🔹 Redirect
  fastify.get("/s/:code", async (request, reply) => {
    const { code } = request.params

    const record = await prisma.qRCode.findUnique({
      where: { shortCode: code }
    })

    if (!record) {
      return reply.code(404).send({ message: "QR not found" })
    }

    await prisma.qRCode.update({
      where: { shortCode: code },
      data: { scanCount: { increment: 1 } }
    })

    await prisma.qRScan.create({
      data: {
        qrCodeId: record.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"]
      }
    })

    if (record.type === "TEXT") {
      return reply.type("text/html").send(`
        <html>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;">
          <h2>${record.destination}</h2>
        </body>
        </html>
      `)
    }

    return reply.redirect(record.destination)
  })

  // 🔹 Bulk
  fastify.post(
  "/bulk-generate",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const { links } = request.body
    const userId = request.user.userId

    if (!links || !Array.isArray(links)) {
      return reply.code(400).send({ message: "links must be an array" })
    }

      const created = await Promise.all(
      links.map(async (destination) => {
        const shortCode = nanoid(8)
        return prisma.qRCode.create({
          data: {
            type: "url",
            shortCode,
            destination,
            userId: Number(userId)
          }
        })
      })
    )

    return {
      message: "Bulk QR generation successful",
      count: created.length
    }
  })

  //QR Stats with auth
fastify.get(
  "/qr/:code/stats",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const userId = request.user.userId
    const { code } = request.params

    const qr = await prisma.qRCode.findUnique({
      where: { shortCode: code },
      include: { scans: true }
    })

    if (!qr) {
      return reply.code(404).send({ message: "QR not found" })
    }

    if (qr.userId !== userId) {
      return reply.code(403).send({ message: "Forbidden" })
    }

    return qr
  }
)
// Delete QR with auth
fastify.delete(
  "/qr/:code",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const userId = request.user.userId
    const { code } = request.params

    const qr = await prisma.qRCode.findUnique({
      where: { shortCode: code }
    })

    if (!qr) {
      return reply.code(404).send({ message: "QR not found" })
    }

    if (qr.userId !== userId) {
      return reply.code(403).send({ message: "Forbidden" })
    }

    await prisma.qRCode.delete({
      where: { shortCode: code }
    })

    return { message: "QR deleted successfully" }
  }
)
// Update QR with auth
fastify.put(
  "/qr/:code",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const userId = request.user.userId
    const { code } = request.params
    const { destination } = request.body

    const qr = await prisma.qRCode.findUnique({
      where: { shortCode: code }
    })

    if (!qr) {
      return reply.code(404).send({ message: "QR not found" })
    }

    if (qr.userId !== userId) {
      return reply.code(403).send({ message: "Forbidden" })
    }

    const updated = await prisma.qRCode.update({
      where: { shortCode: code },
      data: { destination }
    })

    return updated
  }
)
// Get user's QR codes with pagination
fastify.get(
  "/my-qrs",
  { preHandler: [fastify.authenticate] },
  async (request, reply) => {
    const userId = request.user.userId
    const page = Number(request.query.page) || 1
    const limit = 5
    const skip = (page - 1) * limit

    const qrs = await prisma.qRCode.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" }
    })

    const total = await prisma.qRCode.count({
      where: { userId }
    })

    return {
      page,
      total,
      totalPages: Math.ceil(total / limit),
      data: qrs
    }
  }
)
}
