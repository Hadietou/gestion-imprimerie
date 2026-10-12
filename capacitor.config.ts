import type { CapacitorConfig } from '@capacitor/cli'

// Application Android (Capacitor) : l'application web compilée (dist/) dans une coque native.
// ⚠ appId devient définitif dès la première publication sur le Play Store.
const config: CapacitorConfig = {
  appId: 'com.hadietou.bsdimprimerie',
  appName: 'BSD Imprimerie',
  webDir: 'dist',
  android: {
    // Fond affiché avant le chargement de l'application
    backgroundColor: '#f4f6fa',
  },
}

export default config
