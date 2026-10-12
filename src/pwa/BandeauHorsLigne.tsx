import { useEnLigne } from './reseau'

// Bandeau « hors connexion » (navigateur et application Android).

export default function BandeauHorsLigne() {
  const enLigne = useEnLigne()
  if (enLigne) return null
  return (
    <div className="bandeaux-pwa" role="status" aria-live="polite">
      <div className="bandeau-pwa hors-ligne">
        <span aria-hidden="true">📡</span>
        Hors connexion : les données ne peuvent pas être chargées ni enregistrées. Vérifiez internet.
      </div>
    </div>
  )
}
