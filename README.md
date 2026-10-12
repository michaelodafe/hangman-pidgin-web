# Hangman Pidgin (web)

Hangman with Naija Pidgin words, rebuilt for the web as a [Vatar Games](https://lagoslife.app/developers/docs) game for **Lagos Life**.
It's a remake of the original Flutter app ([michaelodafe/hangman_pidgin](https://github.com/michaelodafe/hangman_pidgin)).

- Plain HTML/CSS/JS, no build step. Phone-first (375 × 812, touch), works offline from the SDK as a guest.
- Vatar SDK: player name, leaderboard (`submitScore` / `leaderboard`), `onPause` / `onResume`, and one product, a **Hint Pack** (`hints_5`).
- A small server (Netlify Functions) checks every purchase with Vatar's API, gives the hints once per purchase, marks it delivered, and keeps each player's hint balance (Netlify Blobs).

## Layout

```
public/                 the game (what gets hosted)
  index.html  style.css  game.js  words.js  config.js  fonts/  icon-192.png
netlify/functions/      the server
  claim.mjs             POST /api/claim         { session, purchaseId } → { hints, granted }
  hints.mjs             POST /api/hints(/use)   { session } → { hints }
  webhook.mjs           POST /api/vatar-webhook (purchase.paid, signature checked)
netlify/lib/vatar.mjs   Vatar API calls, purchase delivery, hint balances
netlify.toml            publish dir + the frame-ancestors header Vatar requires
store/                  icon, screenshots and listing text for the dashboard
dev/                    local test tools (never deployed)
```

## Run it locally

```bash
python3 dev/serve.py
```

- http://localhost:8765/frame.html?mock=1 — in a phone frame, with a **mock** Vatar SDK and mock server (fake player, leaderboard, purchases)
- http://localhost:8765/ — the real page, which plays as a guest because it isn't inside Lagos Life

`./dev/shots.sh` re-renders the store screenshots (needs Chrome and the dev server running).

## Deploy (Netlify: game + server + headers in one place)

1. Create the site from this repo (`netlify init`, or "Import from Git" in Netlify). Publish dir and functions come from `netlify.toml`.
2. In the site's environment variables, set:
   - `VATAR_SECRET` — your `vtr_test_…` secret (later `vtr_live_…`)
   - `VATAR_WEBHOOK_SECRET` — your `vtr_whsec_test_…` secret (later `vtr_whsec_live_…`)
3. Redeploy. The game is at `https://<site>.netlify.app/`, the webhook at `https://<site>.netlify.app/api/vatar-webhook`.

Netlify sends the required header for every page:
`Content-Security-Policy: frame-ancestors https://lagoslife.app https://www.lagoslife.app https://naijalife.app https://www.naijalife.app https://lagoslife.eliysites.com`

GitHub Pages also serves `public/` from the `gh-pages` branch (update it with `git subtree push --prefix public origin gh-pages`), but Pages can't run the server or send that header, so the shop is turned off there. Use the Netlify address for Lagos Life. If you ever host the game somewhere other than the server, set `api` in `public/config.js` to the server's full URL.

## Submitting to Lagos Life

1. **Get your keys** at https://lagoslife.app/developers/keys: game name *Hangman Pidgin*, HTTPS address = the Netlify URL, webhook = `<url>/api/vatar-webhook`, one-line description from `store/LISTING.md`.
2. Put the test secrets in Netlify's environment variables (above) and redeploy.
3. In the dashboard, add the product `hints_5` (consumable, ₦100, "Hint Pack (5 hints)").
4. Open your sandbox (`/developers/sandbox/<draft>`), play, and buy a Hint Pack with **Pay (test)**. That ticks: SDK init, test purchase, verified by your server, marked delivered. Click **Send test webhook** too.
5. Add the icon, screenshots, category and descriptions from `store/`, agree to the Developer Agreement and **Submit for review**.
6. After approval, swap in the live secrets (`vtr_live_…`, `vtr_whsec_live_…`) on Netlify and redeploy.

## Review checklist notes

- Loads inside the frame (frame-ancestors header), small and fast: no framework, about 35 KB of fonts.
- Plays at 375 × 812 portrait by touch; no hover-only controls. A physical keyboard works too.
- `onPause` / `onResume` (and the tab going to the background) pause the game, its score timer and its sound. Sound only starts after the first tap and can be muted.
- Every purchase is checked on the server (`GET /purchases/{id}`, same player, not refunded), given once per purchase id, then marked delivered. Undelivered purchases are picked up again from `Vatar.purchases()` on every launch, and by the webhook.
- No ads, no outside payment links, no logins, no personal data. Players are known only by the session token and `player.id`, never cookies.

## Credits

Original Hangman Pidgin Flutter app by Michael Odafe, built on Reza Tavasoli's MIT-licensed Flutter hangman. Fonts: Patrick Hand and Fira Mono (SIL Open Font License).
