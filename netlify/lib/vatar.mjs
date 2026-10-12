// Shared server code: Vatar API calls, hint balances (Netlify Blobs), JSON + CORS replies.
// Secrets come from the environment and never reach the game:
//   VATAR_SECRET          vtr_test_… in the sandbox, vtr_live_… once approved
//   VATAR_WEBHOOK_SECRET  vtr_whsec_test_… / vtr_whsec_live_…
import crypto from "node:crypto"
import { getStore } from "@netlify/blobs"

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

// ── hint balances (Netlify Blobs), append-only so nothing can be given twice or lost to a race:
//   <mode>/<playerId>/grant/<purchaseId>~<hints>   one per purchase: writing it again changes nothing
//   <mode>/<playerId>/use/<time>-<random>          one per hint spent
//   balance = sum of grants − number of uses
const store = () => getStore({ name: "hangman-hints", consistency: "strong" })
const prefix = (mode, playerId) => `${mode}/${encodeURIComponent(playerId)}/`

export async function balance(mode, playerId) {
  const s = store()
  const p = prefix(mode, playerId)
  const [grants, uses] = await Promise.all([s.list({ prefix: p + "grant/" }), s.list({ prefix: p + "use/" })])
  const got = grants.blobs.reduce((n, b) => n + (Number(b.key.split("~").pop()) || 0), 0)
  return Math.max(0, got - uses.blobs.length)
}

/** Spends one hint if the player has one → { spent, hints } */
export async function spend(mode, playerId) {
  const have = await balance(mode, playerId)
  if (have <= 0) return { spent: false, hints: 0 }
  await store().set(prefix(mode, playerId) + `use/${Date.now()}-${crypto.randomBytes(4).toString("hex")}`, "1")
  return { spent: true, hints: have - 1 }
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

  // give first (keyed by the purchase id), then mark delivered
  let granted = 0
  if (p.status === "paid") {
    const s = store()
    const k = prefix(p.mode, p.playerId) + `grant/${p.id}~${HINTS_PER_PACK}`
    if (!(await s.getMetadata(k))) {
      const w = await s.set(k, String(Date.now()), { onlyIfNew: true })
      if (!w || w.modified !== false) granted = HINTS_PER_PACK
    }
    const d = await vatar(`/purchases/${encodeURIComponent(p.id)}/deliver`, {})
    if (d.http !== 200 && d.http !== 409) console.error("deliver failed", p.id, d.http, d.error)
  }
  return { http: 200, hints: await balance(p.mode, p.playerId), granted }
}

/** X-Vatar-Signature: "sha256=" + hex HMAC-SHA256 of the raw body, keyed with the webhook signing secret */
export function signed(raw, header) {
  const secret = process.env.VATAR_WEBHOOK_SECRET
  if (!secret) return false
  const want = Buffer.from("sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex"))
  const got = Buffer.from(String(header ?? ""))
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}
