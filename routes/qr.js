module.exports = async function (fastify, opts) {

  const { PrismaClient } = require("@prisma/client")
  const prisma = new PrismaClient()
  const QRCodeLib = require("qrcode")
  const { nanoid } = require("nanoid")

  fastify.post("/generate-dynamic-qr", async (request) => {
    const { type, destination } = request.body

    const shortCode = nanoid(6)

    await prisma.qRCode.create({
      data: { type, shortCode, destination }
    })

    const shortUrl = `${process.env.APP_URL}/s/${shortCode}`
    const qrImage = await QRCodeLib.toDataURL(shortUrl)

    return { qr: qrImage, shortUrl }
  })

  fastify.get("/qr/:code/stats", async (request) => {
    return prisma.qRCode.findUnique({
      where: { shortCode: request.params.code }
    })
  })

  // ✅ ADD THIS ROUTE
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

    return reply.redirect(record.destination)
  })

}