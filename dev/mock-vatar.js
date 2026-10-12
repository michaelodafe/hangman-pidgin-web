// DEV ONLY. A fake Vatar SDK + fake game server so the UI can be tried locally (dev/serve.py ?mock=1).
// Never shipped: the real game loads https://lagoslife.app/sdk/vatar-games-v1.js.
;(function () {
  const on = { pause: [], resume: [], purchase: [] }
  const listen = (k) => (fn) => (on[k].push(fn), () => (on[k] = on[k].filter((f) => f !== fn)))
  let best = 0
  let hints = 0
  const claimed = new Set()
  const wait = (ms, v) => new Promise((ok) => setTimeout(() => ok(v), ms))
  const fail = (code) => Object.assign(new Error("Vatar: " + code), { code })
  window.Vatar = {
    version: "mock",
    init: () => wait(300, { player: { id: "t_dev", name: "Tolu", avatar: null }, session: "dev", mode: location.search.includes("shot=") ? "live" : "test" }),
    session: () => wait(20, { session: "dev", exp: Date.now() + 9e5 }),
    purchase: (id) => (window.__mockFail ? wait(400).then(() => Promise.reject(fail(window.__mockFail))) : wait(600, { purchaseId: "pur_" + Date.now(), productId: id })),
    purchases: () => wait(50, []),
    submitScore: (n) => (console.log("[mock] submitScore", n), (best = Math.max(best, n)), wait(50, { best, accepted: true })),
    leaderboard: () =>
      wait(200, {
        top: [
          { rank: 1, name: "Chioma", score: Math.max(240, best) },
          { rank: 2, name: "Tolu", score: best },
          { rank: 3, name: "Emeka", score: 96 },
          { rank: 4, name: "Aisha", score: 64 },
        ],
        me: { rank: 2, label: "#2", score: best },
      }),
    onPurchase: listen("purchase"),
    onPause: listen("pause"),
    onResume: listen("resume"),
  }
  window.__mock = { pause: () => on.pause.forEach((f) => f()), resume: () => on.resume.forEach((f) => f()) }

  // fake game server
  const realFetch = window.fetch.bind(window)
  window.fetch = async (url, opts) => {
    const u = String(url)
    if (!u.includes("/api/")) return realFetch(url, opts)
    const body = JSON.parse((opts && opts.body) || "{}")
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })
    await wait(150)
    if (u.endsWith("/api/claim")) {
      if (claimed.has(body.purchaseId)) return reply(200, { hints, granted: 0 })
      claimed.add(body.purchaseId)
      hints += 5
      return reply(200, { hints, granted: 5 })
    }
    if (u.endsWith("/api/hints/use")) return hints > 0 ? reply(200, { hints: --hints }) : reply(409, { error: "none_left", hints: 0 })
    if (u.endsWith("/api/hints")) return reply(200, { hints })
    return reply(404, { error: "not_found" })
  }
})()

// DEV ONLY: ?mock=1&shot=N sets up a scene for store screenshots (dev/shots.sh)
;(function () {
  const shot = new URLSearchParams(location.search).get("shot")
  if (!shot) return
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
  const press = (s) => [...s].forEach((key) => document.dispatchEvent(new KeyboardEvent("keydown", { key })))
  const useWord = (w) => window.WORDS.splice(0, window.WORDS.length, w)
  window.addEventListener("load", async () => {
    await sleep(500)
    const $ = (id) => document.getElementById(id)
    if (shot === "2") { useWord(["jollof", "Food", "The best rice — Naija own, of course"]); $("startBtn").click(); press("oxle") }
    if (shot === "3") { useWord(["wahala", "Slang", "Trouble, problem, stress"]); $("startBtn").click(); press("awkhl") }
    if (shot === "4") { await window.Vatar.submitScore(186); $("boardBtn").click() }
    if (shot === "5") { useWord(["agbaya", "People", "Grown person wey dey behave like pikin"]); $("startBtn").click(); press("aeioutsr") }
    if (shot === "6") $("howBtn").click()
  })
})()
