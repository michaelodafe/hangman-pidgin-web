// POST /api/claim { session, purchaseId } → { hints, granted }
// The game calls this after Vatar.purchase() resolves, from onPurchase, and for every Vatar.purchases() left undelivered.
import { deliver, json, preflight, readBody, whoIs } from "../lib/vatar.mjs"

export default async (req) => {
  if (req.method === "OPTIONS") return preflight()
  if (req.method !== "POST") return json(405, { error: "method" })
  const { session, purchaseId } = await readBody(req)
  const me = await whoIs(session)
  if (!me) return json(401, { error: "bad_session" })
  const r = await deliver(purchaseId, me.playerId)
  if (r.http !== 200) return json(r.http, { error: r.error })
  return json(200, { hints: r.hints, granted: r.granted })
}

export const config = { path: "/api/claim" }
