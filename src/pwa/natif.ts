import { Capacitor } from '@capacitor/core'

// Comportements propres à l'application Android (Capacitor).
// Bouton « Retour » du téléphone : écran précédent, et ne quitte l'application
// que depuis le tout premier écran.
if (Capacitor.isNativePlatform()) {
  import('@capacitor/app').then(({ App }) => {
    App.addListener('backButton', ({ canGoBack }) => {
      // Une fenêtre (devis, paiement…) ouverte se ferme d'abord
      const fenetre = document.querySelector<HTMLDialogElement>('dialog[open]')
      if (fenetre) fenetre.close()
      else if (canGoBack) window.history.back()
      else App.exitApp()
    })
  })
}
