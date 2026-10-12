// npm test · runs the Vercel handlers against a fake Vatar API, with an in-memory hint store.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import http from "node:http"

const SECRET = "vtr_test_fake"
const WHSEC = "vtr_whsec_test_fake"
const purchases = {
  pur1: { id: "pur1", productId: "hints_5", playerId: "t_A", status: "paid", mode: "test" },
  pur2: { id: "pur2", productId: "hints_5", playerId: "t_B", status: "paid", mode: "test" },
  pur3: { id: "pur3", productId: "hints_5", playerId: "t_A", status: "refunded", mode: "test" },
}
const delivered = []
let fake, claim, hints, use, webhook

before(async () => {
  fake = http.createServer((req, res) => {
    let b = ""
    req.on("data", (c) => (b += c))
    req.on("end", () => {
      const send = (s, o) => res.writeHead(s, { "Content-Type": "application/json" }).end(JSON.stringify(o))
      if (req.headers.authorization !== `Bearer ${SECRET}`) return send(401, { error: "bad_secret" })
      if (req.url === "/session/verify") {
        const { session } = JSON.parse(b)
        return session.startsWith("ok_") ? send(200, { playerId: session.slice(3), exp: Date.now() + 9e5, mode: "test" }) : send(401, { error: "invalid_token" })
      }
      let m = req.url.match(/^\/purchases\/(\w+)\/deliver$/)
      if (m) {
        purchases[m[1]].status = "delivered"
        delivered.push(m[1])
        return send(200, { id: m[1], status: "delivered" })
      }
      m = req.url.match(/^\/purchases\/(\w+)$/)
      return m && purchases[m[1]] ? send(200, purchases[m[1]]) : send(404, { error: "not_found" })
    })
  })
  await new Promise((ok) => fake.listen(0, ok))
  Object.assign(process.env, {
    VATAR_API_BASE: `http://localhost:${fake.address().port}`,
    VATAR_SECRET: SECRET,
    VATAR_WEBHOOK_SECRET: WHSEC,
    HP_MEMORY_STORE: "1",
  })
  claim = (await import("../api/claim.js")).POST
  hints = (await import("../api/hints/index.js")).POST
  use = (await import("../api/hints/use.js")).POST
  webhook = (await import("../api/vatar-webhook.js")).POST
})
after(() => fake.close())

const post = async (fn, body) => {
  const r = await fn(new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }))
  return { status: r.status, body: await r.json().catch(() => null) }
}
const hook = (evt, sig) => {
  const raw = JSON.stringify(evt)
  const s = sig ?? "sha256=" + crypto.createHmac("sha256", WHSEC).update(raw).digest("hex")
  return webhook(new Request("http://x/api", { method: "POST", body: raw, headers: { "x-vatar-signature": s } }))
}

test("purchases are checked, given once, and delivered", async () => {
  assert.equal((await post(claim, { session: "bad", purchaseId: "pur1" })).status, 401)
  assert.deepEqual(await post(claim, { session: "ok_t_A", purchaseId: "pur1" }), { status: 200, body: { hints: 5, granted: 5 } })
  assert.deepEqual((await post(claim, { session: "ok_t_A", purchaseId: "pur1" })).body, { hints: 5, granted: 0 })
  assert.equal((await post(claim, { session: "ok_t_A", purchaseId: "pur2" })).status, 403) // someone else's
  assert.equal((await post(claim, { session: "ok_t_A", purchaseId: "pur3" })).status, 409) // refunded
  assert.equal((await post(claim, { session: "ok_t_A", purchaseId: "nope" })).status, 404)
  assert.equal((await post(claim, { session: "ok_t_A", purchaseId: "../x" })).status, 400)
  assert.deepEqual(delivered, ["pur1"])
})

test("hints are spent one at a time and never below zero", async () => {
  assert.deepEqual((await post(hints, { session: "ok_t_A" })).body, { hints: 5 })
  assert.deepEqual((await post(use, { session: "ok_t_A" })).body, { hints: 4 })
  assert.equal((await post(use, { session: "ok_t_B" })).status, 409)
})

test("the webhook needs a valid signature and delivers too", async () => {
  const evt = { id: "evt_1", type: "purchase.paid", data: { purchaseId: "pur2" } }
  assert.equal((await hook(evt, "sha256=00")).status, 401)
  assert.equal((await hook(evt)).status, 200)
  assert.deepEqual((await post(hints, { session: "ok_t_B" })).body, { hints: 5 })
  assert.deepEqual((await post(claim, { session: "ok_t_B", purchaseId: "pur2" })).body, { hints: 5, granted: 0 })
  assert.equal((await hook({ id: "evt_2", type: "purchase.paid", data: { purchaseId: "fake" } })).status, 200) // dashboard test webhook
})
