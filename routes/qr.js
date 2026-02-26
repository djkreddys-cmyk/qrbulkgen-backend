module.exports = async function (fastify, opts) {

  const { PrismaClient } = require("@prisma/client")
  const prisma = new PrismaClient()
  const QRCodeLib = require("qrcode")
  const { nanoid } = require("nanoid")

// 🔹 Generate Single QR
fastify.post("/generate-dynamic-qr", async (request, reply) => {
  const { originalUrl, userId } = request.body;

  // ✅ Validation
  if (!originalUrl) {
    return reply.code(400).send({ message: "URL is required" });
  }

  if (!userId) {
    return reply.code(400).send({ message: "userId required" });
  }

  // Optional: ensure URL has protocol
  const formattedUrl = originalUrl.startsWith("http")
    ? originalUrl
    : `https://${originalUrl}`;

  const shortCode = nanoid(8);

  await prisma.qRCode.create({
    data: {
      type: "DYNAMIC",            // Backend decides
      shortCode,
      destination: formattedUrl,  // Stored cleanly
      userId: Number(userId),
    },
  });

  const shortUrl = `${process.env.APP_URL}/s/${shortCode}`;
  const qrImage = await QRCodeLib.toDataURL(shortUrl);

  return { qr: qrImage, shortUrl };
});
  // 🔹 Stats Route
  fastify.get("/qr/:code/stats", async (request) => {
    return prisma.qRCode.findUnique({
      where: { shortCode: request.params.code },
      include: { scans: true }
    })
  })

  // 🔹 Redirect + Analytics
  fastify.get("/s/:code", async (request, reply) => {
    const { code } = request.params

    const record = await prisma.qRCode.findUnique({
      where: { shortCode: code }
    })

    if (!record) {
      return reply.code(404).send({ message: "QR not found" })
    }

    // Increment counter
    await prisma.qRCode.update({
      where: { shortCode: code },
      data: { scanCount: { increment: 1 } }
    })

    // Save analytics
    await prisma.qRScan.create({
      data: {
        qrCodeId: record.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"]
      }
    })

    return reply.redirect(record.destination)
  })

  // 🔹 Bulk Generate
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