// Icônes et écrans de démarrage Android, à toutes les densités, depuis assets/*.png
// (générés par assets/generer-sources.mjs). Remplace les images par défaut de Capacitor.
//   node assets/generer-android.mjs
import sharp from 'sharp'
import { readdirSync, writeFileSync } from 'node:fs'

const res = 'android/app/src/main/res'
const densites = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

for (const [d, f] of Object.entries(densites)) {
  const icone = Math.round(48 * f)
  const premierPlan = Math.round(108 * f)
  await sharp('assets/icon-only.png').resize(icone, icone).png().toFile(`${res}/mipmap-${d}/ic_launcher.png`)
  // Icône ronde : masque circulaire
  const rond = Buffer.from(`<svg width="${icone}" height="${icone}"><circle cx="${icone / 2}" cy="${icone / 2}" r="${icone / 2}"/></svg>`)
  await sharp('assets/icon-only.png').resize(icone, icone).composite([{ input: rond, blend: 'dest-in' }]).png().toFile(`${res}/mipmap-${d}/ic_launcher_round.png`)
  await sharp('assets/icon-foreground.png').resize(premierPlan, premierPlan).png().toFile(`${res}/mipmap-${d}/ic_launcher_foreground.png`)
}

// Écrans de démarrage : on recadre l'image carrée (logo centré) à chaque format
for (const dossier of readdirSync(res).filter((n) => n.startsWith('drawable'))) {
  const chemin = `${res}/${dossier}/splash.png`
  try {
    const { width, height } = await sharp(chemin).metadata()
    const cote = Math.max(width, height)
    await sharp('assets/splash.png')
      .resize(cote, cote)
      .extract({ left: Math.round((cote - width) / 2), top: Math.round((cote - height) / 2), width, height })
      .png()
      .toFile(chemin + '.tmp')
    const { renameSync } = await import('node:fs')
    renameSync(chemin + '.tmp', chemin)
  } catch {
    // dossier sans splash.png
  }
}

// Fond de l'icône adaptative : bleu de la marque
writeFileSync(`${res}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1D4ED8</color>\n</resources>\n')
console.log('icônes et écrans Android générés')
