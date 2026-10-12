// POST /api/claim { session, purchaseId } → { hints, granted }
// The game calls this after Vatar.purchase() resolves, from onPurchase, and for every Vatar.purchases() left undelivered.
import { deliver, json, preflight, readBody, whoIs } from "../lib/vatar.js"

export const OPTIONS = preflight

export async function POST(req) {
  const { session, purchaseId } = await readBody(req)
  const me = await whoIs(session)
  if (!me) return json(401, { error: "bad_session" })
  const r = await deliver(purchaseId, me.playerId)
  if (r.http !== 200) return json(r.http, { error: r.error })
  return json(200, { hints: r.hints, granted: r.granted })
}
