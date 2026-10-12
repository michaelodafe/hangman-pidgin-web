// POST /api/vatar-webhook  (purchase.paid, signed with the webhook signing secret)
// A nudge, not proof: deliver() checks the purchase with Vatar's API before giving anything.
import { deliver, signed } from "../lib/vatar.mjs"

const seen = new Set()

export default async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 })
  const raw = Buffer.from(await req.arrayBuffer())
  if (!signed(raw, req.headers.get("x-vatar-signature"))) return new Response(null, { status: 401 })
  let evt
  try {
    evt = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (seen.has(evt.id)) return new Response(null, { status: 200 })
  if (evt.type === "purchase.paid" && evt.data && evt.data.purchaseId) {
    const r = await deliver(evt.data.purchaseId, null)
    // 404 is normal for the dashboard's "Send test webhook" (its purchase id isn't a real one)
    if (r.http >= 500) return new Response(null, { status: 502 }) // Vatar retries later
  }
  seen.add(evt.id)
  return new Response(null, { status: 200 })
}

export const config = { path: "/api/vatar-webhook" }
