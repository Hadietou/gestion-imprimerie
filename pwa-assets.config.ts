import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Icônes de l'application installable, générées depuis public/favicon.svg :
// npx pwa-assets-generator
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Icônes « maskable » (Android) et Apple : fond bleu de la marque, marge de sécurité
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#1d4ed8' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#1d4ed8' } },
  },
  images: ['public/favicon.svg'],
})
