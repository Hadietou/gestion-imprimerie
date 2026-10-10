import { useSyncExternalStore } from 'react'

// Installation de l'application (PWA).
// Chrome / Edge / Android envoient « beforeinstallprompt » très tôt, parfois avant
// l'affichage de React : on le capte dès le chargement du module (importé dans main.tsx)
// et on le garde pour le bouton « Installer l'application ».
// iPhone / iPad : pas d'événement, installation via Partager → « Sur l'écran d'accueil ».

interface EvenementInstallation extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let invitation: EvenementInstallation | null = null
const abonnes = new Set<() => void>()
const prevenir = () => abonnes.forEach((f) => f())

const dejaInstallee = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // on affiche notre propre bouton
    invitation = e as EvenementInstallation
    prevenir()
  })
  window.addEventListener('appinstalled', () => {
    invitation = null
    prevenir()
  })
}

const sAbonner = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

export function useInstallation() {
  const disponible = useSyncExternalStore(sAbonner, () => invitation !== null)
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return {
    /** Le navigateur propose l'installation : afficher le bouton */
    peutInstaller: disponible && !dejaInstallee(),
    /** L'application tourne déjà en mode installé */
    installee: dejaInstallee(),
    ios,
    installer: async () => {
      if (!invitation) return
      await invitation.prompt()
      await invitation.userChoice
      invitation = null
      prevenir()
    },
  }
}
