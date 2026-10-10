import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { LIBELLES_STATUTS_DEVIS, listerDevis, statutAffiche, type DevisResume, type StatutDevis } from '../../lib/devis'
import { formaterMontant } from '../../lib/format'
import { useParametres } from '../../parametres/ParametresContext'

const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const FILTRES: (StatutDevis | 'tous')[] = ['tous', 'brouillon', 'envoye', 'accepte', 'refuse', 'expire']

export default function ListeDevis() {
  const { profil } = useAuth()
  const devise = useParametres().parametres?.devise ?? ''
  const [devis, setDevis] = useState<DevisResume[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<StatutDevis | 'tous'>('tous')

  useEffect(() => {
    let actuel = true
    listerDevis()
      .then((d) => actuel && setDevis(d))
      .catch((e: Error) => actuel && setErreur(e.message))
      .finally(() => actuel && setChargement(false))
    return () => {
      actuel = false
    }
  }, [])

  const peutCreer = profil?.role === 'gerant' || profil?.role === 'accueil'
  const termes = normaliser(recherche).split(/\s+/).filter(Boolean)
  const visibles = devis.filter((d) => {
    if (filtre !== 'tous' && statutAffiche(d) !== filtre) return false
    const cible = normaliser(`${d.numero} ${d.client?.nom ?? ''} ${d.objet ?? ''}`)
    return termes.every((t) => cible.includes(t))
  })
  const compte = (s: StatutDevis) => devis.filter((d) => statutAffiche(d) === s).length

  return (
    <>
      <div className="barre-actions">
        <input
          type="search"
          className="champ-recherche"
          placeholder="Rechercher : n°, client, objet…"
          aria-label="Rechercher un devis"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <span />
        {peutCreer && (
          <Link to="/devis/nouveau" className="bouton bouton-principal">
            + Nouveau devis
          </Link>
        )}
      </div>

      <div className="pastilles filtres" role="group" aria-label="Filtrer par statut">
        {FILTRES.map((f) => {
          const n = f === 'tous' ? devis.length : compte(f)
          if (f !== 'tous' && n === 0) return null
          return (
            <button
              key={f}
              type="button"
              className={`pastille ${filtre === f ? 'selectionne' : ''}`}
              aria-pressed={filtre === f}
              onClick={() => setFiltre(f)}
            >
              {f === 'tous' ? 'Tous' : LIBELLES_STATUTS_DEVIS[f]} ({n})
            </button>
          )
        })}
      </div>

      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="texte-doux">Chargement…</p>}
      {!chargement && !erreur && visibles.length === 0 && (
        <div className="vide">
          <p>{devis.length === 0 ? 'Aucun devis pour le moment.' : 'Aucun devis ne correspond.'}</p>
        </div>
      )}

      <ul className="liste-cartes">
        {visibles.map((d) => {
          const statut = statutAffiche(d)
          return (
            <li key={d.id}>
              <Link to={`/devis/${d.id}`} className="carte carte-devis">
                <div className="carte-corps">
                  <div className="carte-titre">
                    <strong>{d.numero}</strong>
                    <span className={`badge badge-statut statut-${statut}`}>{LIBELLES_STATUTS_DEVIS[statut]}</span>
                  </div>
                  <div>{d.client?.nom}</div>
                  <div className="texte-doux petit">
                    {[new Date(d.date_devis).toLocaleDateString('fr-FR'), d.objet].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="montant-carte">
                  <strong>{formaterMontant(d.total_ttc, devise)}</strong>
                  {d.total_ttc !== d.total_ht && <span className="texte-doux petit">TTC</span>}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
