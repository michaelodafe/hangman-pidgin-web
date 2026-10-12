// Hangman Pidgin · a Vatar Games (Lagos Life) web game. No build step.
;(function () {
  "use strict"

  const CFG = window.HP_CONFIG
  const WORDS = window.WORDS
  const LIVES = 5
  const MAX_MISSES = 6
  const SCORE_GAP = 20500 // Vatar keeps one score a player every 20 s
  const $ = (id) => document.getElementById(id)
  const V = window.Vatar // undefined if the SDK failed to load: the game still plays as a guest

  // ───────── storage (may be blocked inside the frame: never rely on it) ─────────
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("hp:" + k)
        return v == null ? d : JSON.parse(v)
      } catch (e) {
        return d
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("hp:" + k, JSON.stringify(v))
      } catch (e) {}
    },
  }

  // ───────── state ─────────
  const S = {
    player: null, // { id, name, avatar } from Vatar
    mode: null, // "live" | "test" | null (guest)
    server: false, // our server answered: purchases and saved hints work
    hints: 0, // bought hints (server is the source of truth)
    lives: LIVES,
    score: 0,
    solved: 0,
    bag: [],
    word: "",
    cat: "",
    meaning: "",
    guessed: new Set(),
    hinted: new Set(),
    misses: 0,
    freeHint: true,
    roundOver: true,
    playing: false,
    paused: false,
    muted: store.get("muted", false),
  }

  // ───────── sound (Web Audio, created on the first tap only) ─────────
  let ctx = null
  function audio() {
    if (S.muted || S.paused) return null
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)()
      } catch (e) {
        return null
      }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {})
    return ctx
  }
  function tone(freq, start, dur, type, vol) {
    const a = audio()
    if (!a) return
    const t = a.currentTime + start
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = type || "sine"
    o.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(a.destination)
    o.start(t)
    o.stop(t + dur + 0.02)
  }
  const sfx = {
    tap: () => tone(660, 0, 0.06, "triangle", 0.08),
    hit: () => { tone(620, 0, 0.09, "triangle"); tone(930, 0.07, 0.12, "triangle") },
    miss: () => tone(150, 0, 0.22, "sawtooth", 0.1),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.22, "triangle")),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.14, 0.3, "sine", 0.16)),
    coin: () => { tone(988, 0, 0.08, "square", 0.06); tone(1319, 0.08, 0.25, "square", 0.06) },
  }
  function paintSound() {
    document.querySelectorAll(".snd").forEach((el) => (el.textContent = S.muted ? "🔇" : "🔊"))
  }
  function toggleSound() {
    S.muted = !S.muted
    store.set("muted", S.muted)
    if (S.muted && ctx) ctx.suspend().catch(() => {})
    paintSound()
    sfx.tap()
  }

  // ───────── helpers ─────────
  let toastTimer = 0
  function toast(msg, ms) {
    const t = $("toast")
    t.textContent = msg
    t.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (t.hidden = true), ms || 2600)
  }
  function show(screen) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === screen))
  }
  function open(id) {
    $(id).hidden = false
  }
  function close(id) {
    $(id).hidden = true
  }
  const openOverlays = () => [...document.querySelectorAll(".overlay")].some((o) => !o.hidden)
  const bestKey = () => "best:" + (S.player ? S.player.id : "guest")
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const ERR = {
    cancelled: "No wahala, maybe next time.",
    payment_failed: "Payment no go through. Try again?",
    not_for_sale: "Hint packs no dey for sale right now.",
    busy: "Pay sheet don already open.",
    rate_limited: "Small small! Try again in a moment.",
    signed_out: "Sign in to Lagos Life first.",
    not_framed: "Open Hangman Pidgin inside Lagos Life to buy hints.",
    off: "The game is turned off right now.",
    timeout: "Network slow. Try again.",
  }
  const errMsg = (e) => ERR[e && e.code] || "Something went wrong. Try again."

  // ───────── our server (purchase checks, saved hints) ─────────
  async function api(path, body) {
    if (!V || !S.mode) throw new Error("guest")
    const { session } = await V.session()
    const r = await fetch(CFG.api + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ session }, body || {})),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      const e = new Error(data.error || "http_" + r.status)
      e.status = r.status
      e.data = data
      throw e
    }
    return data
  }
  function setHints(n) {
    S.hints = Math.max(0, n | 0)
    paintHint()
  }
  async function loadHints() {
    try {
      const d = await api("/hints")
      S.server = true
      setHints(d.hints)
    } catch (e) {
      S.server = false
    }
  }
  const claiming = new Set()
  async function claim(p) {
    if (!p || !p.purchaseId || claiming.has(p.purchaseId)) return
    claiming.add(p.purchaseId)
    try {
      const d = await api("/claim", { purchaseId: p.purchaseId })
      S.server = true
      setHints(d.hints)
      if (d.granted) {
        sfx.coin()
        toast("+" + d.granted + " hints added 💡")
      }
      return d
    } catch (e) {
      // still paid and not delivered: Vatar.purchases() hands it back next time
      toast("Payment received. Your hints go show soon — reopen the game if dem no show.", 4000)
    } finally {
      claiming.delete(p.purchaseId)
    }
  }
  function buy() {
    if (!V || !S.mode) return toast(ERR.not_framed)
    const btn = $("buyBtn")
    btn.disabled = true
    $("shopNote").textContent = ""
    V.purchase(CFG.product)
      .then((p) => claim(p))
      .then((d) => {
        close("shopOv")
        if (d && !d.granted) {
          sfx.coin() // already given by the webhook
          toast("💡 You now get " + S.hints + " hints")
        }
      })
      .catch((e) => ($("shopNote").textContent = errMsg(e)))
      .finally(() => (btn.disabled = false))
  }
  function openShop() {
    $("shopCount").textContent = CFG.productHints
    $("shopHave").textContent = S.hints
    $("buyBtn").textContent = "Get " + CFG.productHints + " hints · " + CFG.productPrice
    const can = !!(V && S.mode && S.server)
    $("buyBtn").disabled = !can
    $("shopNote").textContent = can ? "" : S.mode ? "Shop no dey available right now. Try again later." : ERR.not_framed
    open("shopOv")
  }

  // ───────── leaderboard ─────────
  let pendingScore = 0
  let lastSent = 0
  let scoreTimer = 0
  function queueScore(n) {
    if (!V || !S.mode || n <= 0) return
    pendingScore = Math.max(pendingScore, n)
    flushScore()
  }
  function flushScore() {
    clearTimeout(scoreTimer)
    if (!pendingScore || S.paused) return
    const wait = lastSent + SCORE_GAP - Date.now()
    if (wait > 0) return (scoreTimer = setTimeout(flushScore, wait))
    const n = pendingScore
    pendingScore = 0
    lastSent = Date.now()
    V.submitScore(n).catch((e) => {
      pendingScore = Math.max(pendingScore, n)
      if (e.code === "too_soon" || e.code === "rate_limited" || e.code === "timeout") scoreTimer = setTimeout(flushScore, SCORE_GAP)
    })
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";")
  }
  function openBoard() {
    const body = $("boardBody")
    open("boardOv")
    const best = store.get(bestKey(), 0)
    if (!V || !S.mode) {
      body.innerHTML = `<div class="note">Your best: <b>${best}</b><br>Play inside Lagos Life to join the leaderboard.</div>`
      return
    }
    body.innerHTML = `<div class="note">Loading…</div>`
    V.leaderboard()
      .then(({ top, me }) => {
        if (!top.length) {
          body.innerHTML = `<div class="note">Nobody don score yet. Be the first!</div>`
          return
        }
        const rows = top
          .map((r) => {
            const mine = me && me.rank === r.rank
            return `<div class="r${mine ? " me" : ""}"><span>${r.rank}</span><span>${esc(r.name)}</span><b>${r.score}</b></div>`
          })
          .join("")
        const meRow = me ? `<div class="note">You: ${esc(me.label)} · best ${me.score}</div>` : `<div class="note">Finish a game to get on the board.</div>`
        body.innerHTML = meRow + rows
      })
      .catch((e) => (body.innerHTML = `<div class="note">${esc(errMsg(e))}</div>`))
  }

  // ───────── game ─────────
  const ALPHA = "abcdefghijklmnopqrstuvwxyz"
  function buildKeys() {
    const k = $("keys")
    k.innerHTML = ""
    for (const ch of ALPHA) {
      const b = document.createElement("button")
      b.className = "key"
      b.textContent = ch
      b.dataset.ch = ch
      b.setAttribute("aria-label", ch.toUpperCase())
      b.addEventListener("click", () => guess(ch))
      k.appendChild(b)
    }
    const m = $("misses")
    m.innerHTML = ""
    for (let i = 0; i < MAX_MISSES; i++) m.appendChild(document.createElement("i"))
  }

  function nextWord() {
    if (!S.bag.length) S.bag = shuffle(WORDS.map((_, i) => i))
    const [w, c, m] = WORDS[S.bag.pop()]
    S.word = w.toLowerCase()
    S.cat = c
    S.meaning = m
    S.guessed = new Set()
    S.hinted = new Set()
    S.misses = 0
    S.freeHint = true
    S.roundOver = false
    $("man").setAttribute("class", "")
    document.querySelectorAll(".key").forEach((b) => {
      b.className = "key"
      b.disabled = false
    })
    $("clue").textContent = c
    $("len").textContent = S.word.length + " letters"
    setStatus("Pick a letter")
    paintWord()
    paintMan()
    paintHint()
  }

  function newGame() {
    S.lives = LIVES
    S.score = 0
    S.solved = 0
    S.playing = true
    paintHud()
    show("game")
    nextWord()
  }

  function guess(ch, viaHint) {
    if (S.roundOver || S.paused || openOverlays() || S.guessed.has(ch)) return
    S.guessed.add(ch)
    const key = document.querySelector(`.key[data-ch="${ch}"]`)
    if (key) key.disabled = true
    if (S.word.includes(ch)) {
      if (viaHint) S.hinted.add(ch)
      if (key) key.classList.add("hit")
      sfx.hit()
      paintWord(ch)
      if ([...S.word].every((c) => S.guessed.has(c))) return endRound(true)
      setStatus(viaHint ? "Hint: " + ch.toUpperCase() : pick(["Correct!", "Na so!", "Sharp!", "You sabi am!", "Oya, continue!"]), "good")
    } else {
      S.misses++
      if (key) key.classList.add("miss")
      sfx.miss()
      paintMan(true)
      if (S.misses >= MAX_MISSES) return endRound(false)
      setStatus(pick(["E no dey there", "Wrong o!", "Chai!", "Try another one", "Nawa o!"]) + ` · ${MAX_MISSES - S.misses} left`, "bad")
    }
  }

  function useHint() {
    if (S.roundOver || S.paused) return
    if (!S.freeHint && S.hints <= 0) return openShop()
    const left = [...new Set(S.word)].filter((c) => !S.guessed.has(c))
    if (!left.length) return
    if (S.freeHint) S.freeHint = false
    else {
      setHints(S.hints - 1)
      api("/hints/use")
        .then((d) => setHints(d.hints))
        .catch((e) => e.data && typeof e.data.hints === "number" && setHints(e.data.hints))
    }
    paintHint()
    guess(left[Math.floor(Math.random() * left.length)], true)
  }

  function endRound(won) {
    S.roundOver = true
    paintWord()
    const man = $("man")
    let pts = 0
    if (won) {
      pts = 10 + 2 * (MAX_MISSES - S.misses)
      S.score += pts
      S.solved++
      man.setAttribute("class", "won")
      sfx.win()
      queueScore(S.score)
    } else {
      S.lives--
      man.setAttribute("class", "lost")
      sfx.lose()
    }
    paintHud(won)
    setTimeout(() => {
      if (!S.playing) return
      if (!won && S.lives <= 0) return gameOver()
      const ov = $("roundOv")
      ov.classList.toggle("lost", !won)
      $("roundEmoji").textContent = won ? pick(["🎉", "🔥", "💯", "🙌🏾"]) : "😩"
      $("roundTitle").textContent = won ? pick(["Correct!", "You too much!", "Gbam!", "Na you sabi!"]) : "E don cast!"
      $("roundWord").textContent = S.word
      $("roundCat").textContent = "Wetin e mean · " + S.cat
      $("roundMeaning").textContent = S.meaning
      $("roundPoints").textContent = won ? "+" + pts + " points" : "−1 life · " + S.lives + " left"
      open("roundOv")
    }, won ? 650 : 900)
  }

  function gameOver() {
    S.playing = false
    const prev = store.get(bestKey(), 0)
    const best = Math.max(prev, S.score)
    store.set(bestKey(), best)
    $("finalScore").textContent = S.score
    $("finalStats").textContent = `${S.solved} word${S.solved === 1 ? "" : "s"} solved`
    $("finalBest").textContent = S.score > prev && S.score > 0 ? "🏅 New personal best!" : `Your best: ${best}`
    queueScore(S.score)
    open("overOv")
    paintHomeFoot()
  }

  function goHome() {
    S.playing = false
    S.roundOver = true
    ;["roundOv", "overOv"].forEach(close)
    show("home")
    paintHomeFoot()
  }

  // ───────── painting ─────────
  const pick = (a) => a[Math.floor(Math.random() * a.length)]
  function setStatus(t, cls) {
    const s = $("status")
    s.textContent = t
    s.className = "status" + (cls ? " " + cls : "")
  }
  function paintWord(justGuessed) {
    const el = $("word")
    const n = S.word.length
    const avail = Math.min(el.clientWidth || window.innerWidth - 24, 496)
    const gap = n > 9 ? 4 : 6
    const tw = Math.max(20, Math.min(40, Math.floor((avail - gap * (n - 1)) / n)))
    el.style.setProperty("--tw", tw + "px")
    el.style.setProperty("--gap", gap + "px")
    el.innerHTML = ""
    for (const c of S.word) {
      const t = document.createElement("div")
      t.className = "tile"
      if (S.guessed.has(c)) {
        t.textContent = c
        if (S.hinted.has(c)) t.classList.add("hinted")
        if (c === justGuessed) t.classList.add("show")
      } else if (S.roundOver) {
        t.textContent = c
        t.classList.add("missed")
      }
      el.appendChild(t)
    }
  }
  function paintMan(shake) {
    document.querySelectorAll("#man .part").forEach((p, i) => p.classList.toggle("on", i < S.misses))
    document.querySelectorAll("#misses i").forEach((d, i) => d.classList.toggle("x", i < S.misses))
    if (shake) {
      const m = $("man")
      m.classList.remove("shake")
      void m.getBoundingClientRect()
      m.classList.add("shake")
    }
  }
  function paintHud(bump) {
    $("lives").textContent = S.lives
    $("score").textContent = S.score
    if (bump) {
      const s = $("score")
      s.classList.remove("bump")
      void s.offsetWidth
      s.classList.add("bump")
    }
  }
  function paintHint() {
    const btn = $("hintBtn")
    const badge = $("hintBadge")
    const avail = (S.freeHint ? 1 : 0) + S.hints
    badge.textContent = S.freeHint ? (S.hints ? "1+" + S.hints : "1") : S.hints ? S.hints : "+"
    btn.classList.toggle("empty", avail === 0)
    btn.setAttribute("aria-label", avail ? `Use a hint (${avail} left)` : "Get more hints")
    btn.disabled = S.roundOver
  }
  function paintHomeFoot() {
    const best = store.get(bestKey(), 0)
    const parts = []
    if (best) parts.push("Your best: " + best)
    if (S.hints) parts.push("💡 " + S.hints + " hints")
    $("homeFoot").textContent = parts.join(" · ")
  }

  // ───────── pause / resume (Vatar, or the tab going to the background) ─────────
  function pause() {
    if (S.paused) return
    S.paused = true
    clearTimeout(scoreTimer)
    if (ctx) ctx.suspend().catch(() => {})
    if (S.playing) open("pauseOv")
  }
  function resume() {
    if (!S.paused) return
    S.paused = false
    close("pauseOv")
    if (ctx && !S.muted) ctx.resume().catch(() => {})
    flushScore()
  }

  // ───────── wiring ─────────
  function wire() {
    buildKeys()
    paintSound()
    $("startBtn").onclick = () => {
      sfx.tap()
      newGame()
    }
    $("boardBtn").onclick = openBoard
    $("overBoard").onclick = openBoard
    $("howBtn").onclick = () => open("howOv")
    $("homeBtn").onclick = goHome
    $("overHome").onclick = goHome
    $("soundHome").onclick = toggleSound
    $("soundGame").onclick = toggleSound
    $("hintBtn").onclick = useHint
    $("buyBtn").onclick = buy
    $("nextBtn").onclick = () => {
      close("roundOv")
      sfx.tap()
      nextWord()
    }
    $("againBtn").onclick = () => {
      close("overOv")
      newGame()
    }
    document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => (b.closest(".overlay").hidden = true)))
    // physical keyboard (desktop testing, tablets with keyboards)
    document.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (!$("roundOv").hidden && (k === "enter" || k === " ")) return $("nextBtn").click()
      if ($("game").classList.contains("active") && /^[a-z]$/.test(k)) guess(k)
    })
    document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()))
    window.addEventListener("resize", () => S.word && paintWord())
    document.addEventListener("pointerdown", () => audio(), { once: true })
  }

  function startVatar() {
    if (!V) return guest()
    V.onPause(pause)
    V.onResume(resume)
    V.onPurchase(claim)
    V.init()
      .then(({ player, mode }) => {
        S.player = player
        S.mode = mode
        $("hello").textContent = `Hi ${player.name} 👋🏾` + (mode === "test" ? " · TEST" : "")
        paintHomeFoot()
        return loadHints().then(() => V.purchases())
      })
      .then((list) => (list || []).forEach(claim))
      .then(paintHomeFoot)
      .catch((e) => {
        if (!S.mode) guest(e)
      })
  }
  function guest(e) {
    S.mode = null
    $("hello").textContent = e && e.code === "signed_out" ? "Hi! Sign in to save your score" : "Hi! 👋🏾 Playing as guest"
    paintHomeFoot()
  }

  wire()
  startVatar()
})()
