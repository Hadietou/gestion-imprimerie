// Visuels de la fiche Play Store : icône 512×512 et image de présentation 1024×500.
// Usage : node assets/generer-play-store.mjs  → fichiers dans ../Play Store/
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const sortie = '../Play Store'
mkdirSync(sortie, { recursive: true })
const imprimante = '<rect x="16" y="14" width="32" height="14" rx="2" fill="#fff"/><rect x="10" y="26" width="44" height="20" rx="4" fill="#bfdbfe"/><rect x="18" y="38" width="28" height="14" rx="2" fill="#fff"/><circle cx="46" cy="32" r="2.5" fill="#1d4ed8"/>'

// Icône : carré plein (Google arrondit lui-même les coins)
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512"><rect width="64" height="64" fill="#1d4ed8"/><g transform="translate(32 33) scale(0.8) translate(-32 -33)">${imprimante}</g></svg>`))
  .png().toFile(`${sortie}/icone-512.png`)

// Image de présentation
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
  <rect width="1024" height="500" fill="url(#f)"/>
  <g transform="translate(90 130) scale(3.75)"><rect width="64" height="64" rx="14" fill="#2563eb"/>${imprimante}</g>
  <text x="400" y="225" font-family="Segoe UI, Arial, sans-serif" font-size="68" font-weight="700" fill="#fff">BSD Imprimerie</text>
  <text x="402" y="285" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#bfdbfe">Devis · Commandes · Factures · Stock</text>
  <text x="402" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="#dbeafe">Toute la gestion de l’imprimerie au même endroit</text>
</svg>`)).flatten().png().toFile(`${sortie}/presentation-1024x500.png`)
console.log('ok')
