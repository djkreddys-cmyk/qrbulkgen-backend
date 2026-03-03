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

    const { type, data, expiresAt } = request.body
    const userId = request.user.userId

    // Get user ONCE
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return reply.code(404).send({ message: "User not found" })
    }

    // 🔒 Expiry is PRO only
    if (expiresAt && user.plan === "FREE") {
      return reply.code(403).send({
        message: "Expiry feature is available only for PRO users."
      })
    }

    // 📊 Free plan QR limit
    if (user.plan === "FREE") {
      const qrCount = await prisma.qRCode.count({
        where: { userId }
      })

      if (qrCount >= 100) {
        return reply.code(403).send({
          message: "Free plan limit reached. Upgrade to PRO."
        })
      }
    }

    if (!type) {
      return reply.code(400).send({ message: "Type is required" })
    }

    let formattedValue

    switch (type) {
      case "URL":
        formattedValue = data.url.startsWith("http")
          ? data.url
          : `https://${data.url}`
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
        userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    })

    const shortUrl = `${process.env.APP_URL}/s/${shortCode}`
    const qr = await QRCodeLib.toDataURL(shortUrl)

    return { qr, shortUrl }
  }
)
    // 🔹 Redirect
  fastify.get("/s/:code", async (request, reply) => {
  const { code } = request.params

  const record = await prisma.qRCode.findUnique({
  where: { shortCode: code },
  select: {
    id: true,
    type: true,
    destination: true,
    isActive: true,
    expiresAt: true
  }
})

  if (!record) {
    return reply.code(404).send({ message: "QR not found" })
  }

  // 🔒 Check if manually disabled
  if (!record.isActive) {
    return reply.code(410).send({ message: "QR is disabled" })
  }

  // ⏳ Check expiry time
  if (record.expiresAt && new Date() > new Date(record.expiresAt)) {
    return reply.code(410).send({ message: "QR expired" })
  }

  // 📊 Increment scan count
  await prisma.qRCode.update({
    where: { shortCode: code },
    data: { scanCount: { increment: 1 } }
  })

  // 📈 Save analytics
  await prisma.qRScan.create({
    data: {
      qrCodeId: record.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"]
    }
  })

  // 📝 TEXT special render
  if (record.type === "TEXT") {
    return reply.type("text/html").send(`
      <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;">
        <h2>${record.destination}</h2>
      </body>
      </html>
    `)
  }

  // 🌍 Default redirect
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
    const user = await prisma.user.findUnique({
  where: { id: userId }
})

if (user.plan === "FREE") {
  const totalExisting = await prisma.qRCode.count({
    where: { userId }
  })

  if (totalExisting + links.length > 100) {
    return reply.code(403).send({
      message: "Free plan limit reached. Upgrade to PRO."
    })
  }
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
  async (request) => {

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

    const totalScans = await prisma.qRScan.count({
      where: {
        qrCode: { userId }
      }
    })

    const activeQrs = await prisma.qRCode.count({
      where: { userId, isActive: true }
    })

    const expiredQrs = await prisma.qRCode.count({
      where: {
        userId,
        expiresAt: {
        not: null,
        lt: new Date()
        }
      }
    })

    return {
      page,
      total,
      totalPages: Math.ceil(total / limit),
      totalScans,
      activeQrs,
      expiredQrs,
      data: qrs
    }
  }
)
}