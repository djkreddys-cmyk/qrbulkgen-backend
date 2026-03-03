module.exports = async function (fastify, opts) {

  const { PrismaClient } = require("@prisma/client")
  const prisma = new PrismaClient()
  const QRCodeLib = require("qrcode")
  const { nanoid } = require("nanoid")

// 🔹 Generate Single QR
fastify.post("/generate-dynamic-qr", async (request, reply) => {
  const { type, data, userId } = request.body;

  if (!type) {
    return reply.code(400).send({ message: "Type is required" });
  }

  if (!userId) {
    return reply.code(400).send({ message: "userId required" });
  }

  let formattedValue;

  switch (type) {
    case "URL":
      formattedValue = data.url;
      if (!formattedValue.startsWith("http")) {
        formattedValue = `https://${formattedValue}`;
      }
      break;

    case "TEXT":
      formattedValue = data.text;
      break;

    case "EMAIL":
      formattedValue = `mailto:${data.email}`;
      break;

    case "WHATSAPP":
      formattedValue = `https://wa.me/${data.phone}`;
      break;

    case "PHONE":
      formattedValue = `tel:${data.phone}`;
      break;

    default:
      return reply.code(400).send({ message: "Invalid QR type" });
  }

  const shortCode = nanoid(8);

  await prisma.qRCode.create({
    data: {
      type,
      shortCode,
      destination: formattedValue,
      userId: Number(userId),
    },
  });

  const shortUrl = `${process.env.APP_URL}/s/${shortCode}`;
  const qr = await QRCodeLib.toDataURL(shortUrl);

  return { qr, shortUrl };
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
  const { code } = request.params;

  const record = await prisma.qRCode.findUnique({
    where: { shortCode: code }
  });

  if (!record) {
    return reply.code(404).send({ message: "QR not found" });
  }

  // Increment counter
  await prisma.qRCode.update({
    where: { shortCode: code },
    data: { scanCount: { increment: 1 } }
  });

  // Save analytics
  await prisma.qRScan.create({
    data: {
      qrCodeId: record.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"]
    }
  });

  // 👇 TEXT QR Special Handling
  if (record.type === "TEXT") {
    return reply.type("text/html").send(`
      <html>
        <head>
          <title>QR Text</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body {
              font-family: Arial, sans-serif;
              display:flex;
              justify-content:center;
              align-items:center;
              height:100vh;
              background:#f5f5f5;
              margin:0;
            }
            .card {
              background:white;
              padding:40px;
              border-radius:10px;
              box-shadow:0 10px 25px rgba(0,0,0,0.1);
              font-size:24px;
              font-weight:bold;
              text-align:center;
              max-width:90%;
              word-wrap:break-word;
            }
          </style>
        </head>
        <body>
          <div class="card">
            ${record.destination}
          </div>
        </body>
      </html>
    `);
  }

  // Default redirect for other types
  return reply.redirect(record.destination);
});

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