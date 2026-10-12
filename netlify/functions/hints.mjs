// POST /api/hints { session }      → { hints }   this player's bought hints
// POST /api/hints/use { session }  → { hints }   spend one (409 none_left)
import { balance, json, preflight, readBody, spend, whoIs } from "../lib/vatar.mjs"

export default async (req) => {
  if (req.method === "OPTIONS") return preflight()
  if (req.method !== "POST") return json(405, { error: "method" })
  const { session } = await readBody(req)
  const me = await whoIs(session)
  if (!me) return json(401, { error: "bad_session" })
  if (!new URL(req.url).pathname.endsWith("/use")) return json(200, { hints: await balance(me.mode, me.playerId) })
  const r = await spend(me.mode, me.playerId)
  return r.spent ? json(200, { hints: r.hints }) : json(409, { error: "none_left", hints: 0 })
}

export const config = { path: ["/api/hints", "/api/hints/use"] }
