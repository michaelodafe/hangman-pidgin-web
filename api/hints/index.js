// POST /api/hints { session } → { hints }   this player's bought hints
import { balance, json, preflight, readBody, whoIs } from "../../lib/vatar.js"

export const OPTIONS = preflight

export async function POST(req) {
  const { session } = await readBody(req)
  const me = await whoIs(session)
  if (!me) return json(401, { error: "bad_session" })
  return json(200, { hints: await balance(me.mode, me.playerId) })
}
