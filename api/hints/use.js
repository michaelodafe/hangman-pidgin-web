// POST /api/hints/use { session } → { hints }   spend one (409 none_left)
import { json, preflight, readBody, spend, whoIs } from "../../lib/vatar.js"

export const OPTIONS = preflight

export async function POST(req) {
  const { session } = await readBody(req)
  const me = await whoIs(session)
  if (!me) return json(401, { error: "bad_session" })
  const r = await spend(me.mode, me.playerId)
  return r.spent ? json(200, { hints: r.hints }) : json(409, { error: "none_left", hints: 0 })
}
