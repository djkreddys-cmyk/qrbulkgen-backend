import express from "express"
import prisma from "../lib/prisma.js"
import { buildRedirect } from "../utils/redirectBuilder.js"

const router = express.Router()

router.get("/qr/:id", async (req, res) => {

  const { id } = req.params

  try {

    const qr = await prisma.qrcode.findUnique({
      where: { shortCode: id }
    })

    if (!qr) {
      return res.status(404).json({
        redirectUrl: "https://google.com"
      })
    }

    const url = buildRedirect(qr)

    res.json({
      redirectUrl: url
    })

  } catch (error) {

    res.status(500).json({
      redirectUrl: "https://google.com"
    })

  }

})

export default router