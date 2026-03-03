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

  // 🔹 Stats
  fastify.get("/qr/:code/stats", async (request) => {
    return prisma.qRCode.findUnique({
      where: { shortCode: request.params.code },
      include: { scans: true }
    })
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
  fastify.post("/bulk-generate", async (request, reply) => {
    const { links, userId } = request.body

    if (!links || !Array.isArray(links)) {
      return reply.code(400).send({ message: "links must be an array" })
    }

    if (!userId) {
      return reply.code(400).send({ message: "userId is required" })
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

}
