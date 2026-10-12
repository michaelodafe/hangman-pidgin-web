// Shared server code: Vatar API calls, purchase delivery, hint balances (Upstash Redis), JSON + CORS replies.
// Secrets come from the environment and never reach the game:
//   VATAR_SECRET          vtr_test_… in the sandbox, vtr_live_… once approved
//   VATAR_WEBHOOK_SECRET  vtr_whsec_test_… / vtr_whsec_live_…
//   KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + _TOKEN)  set by Vercel's Upstash integration
import crypto from "node:crypto"
import { Redis } from "@upstash/redis"

export const API = process.env.VATAR_API_BASE || "https://lagoslife.app/api/games/v1"
export const PRODUCT = process.env.HINT_PRODUCT_ID || "hints_5"
export const HINTS_PER_PACK = Number(process.env.HINTS_PER_PACK || 5)

const CORS = {
  "Access-Control-Allow-Origin": "*", // auth is the signed session token in the body, never cookies
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}
export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } })
export const preflight = () => new Response(null, { status: 204, headers: CORS })

export async function vatar(path, body) {
  const r = await fetch(API + path, {
    method: body ? "POST" : "GET",
    body: body && JSON.stringify(body),
    headers: { Authorization: `Bearer ${process.env.VATAR_SECRET}`, "Content-Type": "application/json" },
  })
  return { http: r.status, ...(await r.json().catch(() => ({}))) }
}

// Verified sessions, cached until they expire (fewer API calls when a player uses several hints).
const sessions = new Map()
export async function whoIs(session) {
  if (typeof session !== "string" || session.length > 4096) return null
  const hit = sessions.get(session)
  if (hit && hit.exp > Date.now() + 5000) return hit
  const me = await vatar("/session/verify", { session })
  if (me.http !== 200) return null
  if (sessions.size > 5000) sessions.clear()
  sessions.set(session, me)
  return me
}

export async function readBody(req) {
  try {
    const b = await req.json()
    return b && typeof b === "object" ? b : {}
  } catch {
    return {}
  }
}

// ── hint balances ──
//   hp:<mode>:<playerId>:hints    the player's bought hints left
//   hp:<mode>:<playerId>:claimed  set of purchase ids already given (so each is given once)
// Both changes happen in one Lua script, so the game and the webhook claiming at once can't give twice.
const GRANT = `if redis.call('SADD', KEYS[1], ARGV[1]) == 1 then return {1, redis.call('INCRBY', KEYS[2], ARGV[2])} end
return {0, tonumber(redis.call('GET', KEYS[2]) or '0')}`
const SPEND = `local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n > 0 then return {1, redis.call('DECR', KEYS[1])} end
return {0, 0}`

let redis
function db() {
  if (redis) return redis
  if (process.env.HP_MEMORY_STORE === "1") return (redis = memoryStore()) // local tests only
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error("No Redis configured: add Upstash Redis to the Vercel project")
  return (redis = new Redis({ url, token }))
}
const k = (mode, playerId, what) => `hp:${mode}:${playerId}:${what}`

export async function balance(mode, playerId) {
  return Number((await db().get(k(mode, playerId, "hints"))) || 0)
}
/** → { spent, hints } */
export async function spend(mode, playerId) {
  const [ok, n] = await db().eval(SPEND, [k(mode, playerId, "hints")], [])
  return { spent: ok === 1, hints: Number(n) }
}
/** → { granted, hints } */
async function grantOnce(mode, playerId, purchaseId, n) {
  const [ok, hints] = await db().eval(GRANT, [k(mode, playerId, "claimed"), k(mode, playerId, "hints")], [purchaseId, String(n)])
  return { granted: ok === 1 ? n : 0, hints: Number(hints) }
}

/**
 * Checks a purchase with Vatar and gives its hints exactly once per purchase id, then marks it delivered.
 * forPlayer: the verified player asking (null when called from the webhook, which names the player itself).
 * → { http, error?, hints?, granted? }
 */
export async function deliver(purchaseId, forPlayer) {
  if (typeof purchaseId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(purchaseId)) return { http: 400, error: "bad_request" }
  const p = await vatar(`/purchases/${encodeURIComponent(purchaseId)}`)
  if (p.http !== 200) return { http: p.http === 404 ? 404 : 502, error: p.error || "purchase_check_failed" }
  if (forPlayer && p.playerId !== forPlayer) return { http: 403, error: "not_yours" }
  if (p.status === "refunded") return { http: 409, error: "refunded" }
  if (p.productId !== PRODUCT) return { http: 400, error: "unknown_product" }
  if (p.status !== "paid") return { http: 200, hints: await balance(p.mode, p.playerId), granted: 0 }

  const r = await grantOnce(p.mode, p.playerId, p.id, HINTS_PER_PACK) // give first, then mark delivered
  const d = await vatar(`/purchases/${encodeURIComponent(p.id)}/deliver`, {})
  if (d.http !== 200 && d.http !== 409) console.error("deliver failed", p.id, d.http, d.error)
  return { http: 200, ...r }
}

/** X-Vatar-Signature: "sha256=" + hex HMAC-SHA256 of the raw body, keyed with the webhook signing secret */
export function signed(raw, header) {
  const secret = process.env.VATAR_WEBHOOK_SECRET
  if (!secret) return false
  const want = Buffer.from("sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex"))
  const got = Buffer.from(String(header ?? ""))
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}

// In-memory stand-in for the two scripts above (HP_MEMORY_STORE=1, local tests only: nothing is kept).
function memoryStore() {
  const m = new Map()
  return {
    async get(key) {
      return m.get(key) ?? null
    },
    async eval(script, keys, args) {
      if (script === SPEND) {
        const n = m.get(keys[0]) || 0
        if (n <= 0) return [0, 0]
        m.set(keys[0], n - 1)
        return [1, n - 1]
      }
      const set = m.get(keys[0]) || new Set()
      m.set(keys[0], set)
      if (set.has(args[0])) return [0, m.get(keys[1]) || 0]
      set.add(args[0])
      m.set(keys[1], (m.get(keys[1]) || 0) + Number(args[1]))
      return [1, m.get(keys[1])]
    },
  }
}
