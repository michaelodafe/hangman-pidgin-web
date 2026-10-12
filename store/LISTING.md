# Hangman Pidgin — store listing (Vatar developer dashboard)

**Game name:** Hangman Pidgin

**Category:** Word / Puzzle

**Short description (max 120 chars):**
Guess di Naija Pidgin word before di man hang! 150 words of slang, food and Lagos life — learn wetin each one mean.

**Long description:**
Hangman Pidgin na the classic hangman game, but every word na Naija Pidgin and Lagos slang — from *wahala* and *japa* to *danfo*, *puffpuff* and *owambe*.

- Guess the word one letter at a time. The clue tells you if na Slang, Food, People, Lagos or Things.
- Six wrong letters and the man hangs — you lose one of your 5 lives.
- Every word you solve gives 10 points, plus 2 for every wrong guess you still had left.
- After every word you see wetin e mean, so you dey learn as you play.
- One free hint every word. Need more? A Hint Pack gives you 5 extra hints to use any time.
- Climb the Lagos Life leaderboard and show your padi say you sabi Pidgin pass am.

Built phone-first for touch, with sound you can switch off. No ads, no outside payments, no personal data.

**Icon:** `store/icon-512.png` (512 × 512 PNG)

**Screenshots (375 × 812 @2x, portrait):**
1. `store/screenshot-1.png` — home
2. `store/screenshot-2.png` — guessing a word
3. `store/screenshot-3.png` — word solved, with its meaning
4. `store/screenshot-4.png` — leaderboard
5. `store/screenshot-5.png` — how to play

## Product to add in the dashboard

| productId | Name | Type | Price | What it does |
| --- | --- | --- | --- | --- |
| `hints_5` | Hint Pack (5 hints) | Consumable | ₦100 | Adds 5 hints to the player's saved balance. Each hint reveals one letter. |

The price label in the game comes from `public/config.js` (`productPrice`), so keep it in step with the dashboard price.
