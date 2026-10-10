import { useSyncExternalStore } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Bandeaux en bas de l'écran : nouvelle version disponible, connexion perdue.

const sAbonnerReseau = (f: () => void) => {
  window.addEventListener('online', f)
  window.addEventListener('offline', f)
  return () => {
    window.removeEventListener('online', f)
    window.removeEventListener('offline', f)
  }
}

export default function BandeauxPwa() {
  const enLigne = useSyncExternalStore(sAbonnerReseau, () => navigator.onLine)
  const {
    needRefresh: [miseAJour, setMiseAJour],
    updateServiceWorker,
  } = useRegisterSW({
    // Vérifie une nouvelle version toutes les heures quand l'application reste ouverte
    onRegisteredSW(_url, enregistrement) {
      if (enregistrement) setInterval(() => enregistrement.update(), 60 * 60 * 1000)
    },
  })

  if (enLigne && !miseAJour) return null

  return (
    <div className="bandeaux-pwa" role="status" aria-live="polite">
      {!enLigne && (
        <div className="bandeau-pwa hors-ligne">
          <span aria-hidden="true">📡</span>
          Hors connexion : les données ne peuvent pas être chargées ni enregistrées. Vérifiez internet.
        </div>
      )}
      {miseAJour && (
        <div className="bandeau-pwa mise-a-jour">
          <span>Une nouvelle version de l’application est disponible.</span>
          <span className="espace" />
          <button type="button" className="bouton" onClick={() => setMiseAJour(false)}>
            Plus tard
          </button>
          <button type="button" className="bouton bouton-principal" onClick={() => updateServiceWorker(true)}>
            Mettre à jour
          </button>
        </div>
      )}
    </div>
  )
}
