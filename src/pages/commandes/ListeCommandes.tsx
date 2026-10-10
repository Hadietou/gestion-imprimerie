import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { LIBELLES_STATUTS_COMMANDE, enRetard, listerCommandes, totalCommande, type CommandeResume } from '../../lib/commandes'
import { formaterMontant } from '../../lib/format'
import { useParametres } from '../../parametres/ParametresContext'

const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

type Filtre = 'en_cours' | 'livre' | 'annule' | 'toutes'
const LIBELLES_FILTRES: Record<Filtre, string> = { en_cours: 'En cours', livre: 'Livrées', annule: 'Annulées', toutes: 'Toutes' }

const dateCourte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })

export default function ListeCommandes() {
  const { profil } = useAuth()
  const devise = useParametres().parametres?.devise ?? ''
  const [commandes, setCommandes] = useState<CommandeResume[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('en_cours')

  useEffect(() => {
    let actuel = true
    listerCommandes()
      .then((c) => actuel && setCommandes(c))
      .catch((e: Error) => actuel && setErreur(e.message))
      .finally(() => actuel && setChargement(false))
    return () => {
      actuel = false
    }
  }, [])

  const voitPrix = profil?.role !== 'atelier'
  const dansFiltre = (c: CommandeResume, f: Filtre) =>
    f === 'toutes' || (f === 'en_cours' ? c.statut !== 'livre' && c.statut !== 'annule' : c.statut === f)
  const termes = normaliser(recherche).split(/\s+/).filter(Boolean)
  const visibles = commandes
    .filter((c) => dansFiltre(c, filtre))
    .filter((c) => termes.every((t) => normaliser(`${c.numero} ${c.client?.nom ?? ''} ${c.objet ?? ''}`).includes(t)))
    // En cours : urgentes, puis par date de livraison prévue
    .sort((a, b) =>
      filtre === 'en_cours'
        ? Number(b.urgent) - Number(a.urgent) ||
          (a.date_livraison_prevue ?? '9999').localeCompare(b.date_livraison_prevue ?? '9999') ||
          b.id - a.id
        : b.id - a.id,
    )

  return (
    <>
      <div className="barre-actions">
        <input
          type="search"
          className="champ-recherche"
          placeholder="Rechercher : n°, client, objet…"
          aria-label="Rechercher une commande"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <span />
        {(profil?.role === 'gerant' || profil?.role === 'accueil') && (
          <Link to="/devis/nouveau" className="bouton bouton-principal" title="Une commande se crée à partir d’un devis">
            + Nouvelle commande (devis)
          </Link>
        )}
      </div>

      <div className="pastilles filtres" role="group" aria-label="Filtrer les commandes">
        {(Object.keys(LIBELLES_FILTRES) as Filtre[]).map((f) => (
          <button key={f} type="button" className={`pastille ${filtre === f ? 'selectionne' : ''}`} aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
            {LIBELLES_FILTRES[f]} ({commandes.filter((c) => dansFiltre(c, f)).length})
          </button>
        ))}
      </div>

      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="texte-doux">Chargement…</p>}
      {!chargement && !erreur && visibles.length === 0 && (
        <div className="vide">
          <p>
            {commandes.length === 0
              ? 'Aucune commande. Une commande se crée depuis un devis (bouton « Créer la commande »).'
              : 'Aucune commande ne correspond.'}
          </p>
        </div>
      )}

      <ul className="liste-cartes">
        {visibles.map((c) => (
          <li key={c.id}>
            <Link to={`/commandes/${c.id}`} className={`carte carte-devis ${enRetard(c) ? 'carte-alerte' : ''}`}>
              <div className="carte-corps">
                <div className="carte-titre">
                  <strong>{c.numero}</strong>
                  <span className={`badge badge-statut cmd-${c.statut}`}>{LIBELLES_STATUTS_COMMANDE[c.statut]}</span>
                  {c.urgent && <span className="badge statut-refuse">🔥 Urgent</span>}
                </div>
                <div>{c.client?.nom}</div>
                <div className="texte-doux petit">
                  {[
                    c.objet,
                    c.date_livraison_prevue &&
                      (enRetard(c) ? `⚠ en retard — prévue le ${dateCourte(c.date_livraison_prevue)}` : `livraison le ${dateCourte(c.date_livraison_prevue)}`),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {voitPrix && (
                <div className="montant-carte">
                  <strong>{formaterMontant(totalCommande(c.lignes, c.remise_pct, c.taux_tva).ttc, devise)}</strong>
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
