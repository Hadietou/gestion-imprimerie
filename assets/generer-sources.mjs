// Images sources des icônes et de l'écran de démarrage Android (à partir du logo).
// node assets/generer-sources.mjs  puis  npx @capacitor/assets generate --android
import sharp from 'sharp'

const imprimante = '<rect x="16" y="14" width="32" height="14" rx="2" fill="#fff"/><rect x="10" y="26" width="44" height="20" rx="4" fill="#bfdbfe"/><rect x="18" y="38" width="28" height="14" rx="2" fill="#fff"/><circle cx="46" cy="32" r="2.5" fill="#1d4ed8"/>'
const svg = (contenu, fond = '') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024">${fond}${contenu}</svg>`)
// Icône adaptative : le premier plan reste dans la zone sûre (≈ 60 % centraux)
const reduit = `<g transform="translate(32 33) scale(0.62) translate(-32 -33)">${imprimante}</g>`

await sharp(svg(imprimante, '<rect width="64" height="64" fill="#1d4ed8"/>')).png().toFile('assets/icon-only.png')
await sharp(svg(reduit)).png().toFile('assets/icon-foreground.png')
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#1d4ed8' } }).png().toFile('assets/icon-background.png')
const logo = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="640" height="640"><rect width="64" height="64" rx="14" fill="#1d4ed8"/>${imprimante}</svg>`)).png().toBuffer()
for (const [nom, fond] of [['splash', '#f4f6fa'], ['splash-dark', '#0f1420']]) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: fond } }).composite([{ input: logo, gravity: 'center' }]).png().toFile(`assets/${nom}.png`)
}
console.log('sources générées')
