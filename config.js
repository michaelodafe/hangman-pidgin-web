// Hangman Pidgin settings.
// api: where the game's own server lives (purchase checks + hint balance).
//   "/api" when the game and the server share a host (Netlify, see netlify.toml).
//   A full URL, e.g. "https://hangman-pidgin.netlify.app/api", when the game is hosted elsewhere (GitHub Pages).
window.HP_CONFIG = {
  api: "/api",
  product: "hints_5", // productId in the Vatar developer dashboard (consumable)
  productHints: 5, // hints one purchase gives (must match the server's HINTS_PER_PACK)
  productPrice: "₦100", // label only: the real price always comes from Vatar's pay sheet
}
