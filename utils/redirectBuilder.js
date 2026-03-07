export function buildRedirect(qr) {

  if (!qr) return "https://google.com"

  let data = {}

  try {
    data = typeof qr.data === "string" ? JSON.parse(qr.data) : qr.data
  } catch {
    data = {}
  }

  switch (qr.type) {

    case "URL":
      return data.url || "https://google.com"

    case "TEXT":
      return `https://example.com/text?data=${encodeURIComponent(data.text || "")}`

    case "EMAIL":
      return `mailto:${data.email || ""}`

    case "PHONE":
      return `tel:${data.phone || ""}`

    case "SMS":
      return `sms:${data.phone || ""}?body=${encodeURIComponent(data.message || "")}`

    case "LOCATION":
      return `https://maps.google.com/?q=${data.lat || ""},${data.lng || ""}`

    case "YOUTUBE":
      return data.url || "https://youtube.com"

    case "APP_STORE":
      return data.url || "https://apps.apple.com"

    case "RATING":
      return data.url || "https://google.com"

    case "FEEDBACK":
      return data.url || "https://google.com"

    case "IMAGE_GALLERY":
      return `${process.env.APP_URL}/gallery/${qr.id}`

    case "WIFI":
      return `WIFI:T:${data.security};S:${data.ssid};P:${data.password};;`

    case "EVENT":
      return data.url || "https://google.com"

    default:
      return "https://google.com"

  }

}