import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import {
  LIBELLES_STATUTS_DEVIS,
  changerStatut,
  chargerDevis,
  statutAffiche,
  supprimerDevis,
  type DevisComplet,
  type StatutDevis,
} from '../../lib/devis'
import { useParametres } from '../../parametres/ParametresContext'
import Fenetre from '../../components/Fenetre'
import { commandeDuDevis, creerCommandeDepuisDevis } from '../../lib/commandes'
import DocumentDevis from './DocumentDevis'

// demi : moitié haute d'une feuille A4, découpée ensuite au milieu ; A4 : page entière
type Impression = 'demi' | 'A4'
const HAUTEUR_DEMI_PAGE_MM = 148.5
const PX_PAR_MM = 96 / 25.4

// Fiche d'un devis : document imprimable + actions (statut, modifier, dupliquer…)

export default function FicheDevis() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profil } = useAuth()
  const { parametres } = useParametres()
  const [devis, setDevis] = useState<DevisComplet | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [action, setAction] = useState(false)
  const [version, setVersion] = useState(0)
  // Moitié haute d'une feuille A4, sauf choix contraire pour ce devis
  const [impression, setImpression] = useState<Impression>('demi')
  const [depasse, setDepasse] = useState(false)
  const zoneDocument = useRef<HTMLDivElement>(null)
  const [parametresUrl] = useSearchParams()
  const [commandeLiee, setCommandeLiee] = useState<{ id: number; numero: string } | null>(null)
  // ?commande=1 : arrivée depuis « Enregistrer et créer la commande » de l'éditeur
  const [creationCommande, setCreationCommande] = useState(() => parametresUrl.get('commande') === '1')

  useEffect(() => {
    let actuel = true
    Promise.all([chargerDevis(Number(id)), commandeDuDevis(Number(id)).catch(() => null)])
      .then(([d, c]) => {
        if (!actuel) return
        setDevis(d)
        setCommandeLiee(c)
      })
      .catch((e: Error) => actuel && setErreur(e.message))
    return () => {
      actuel = false
    }
  }, [id, version])

  // Nom du fichier PDF proposé par le navigateur = titre de la page
  useEffect(() => {
    if (!devis) return
    const titre = document.title
    document.title = `${devis.numero} ${devis.client.nom}`
    return () => {
      document.title = titre
    }
  }, [devis])

  // Le devis tient-il dans la demi-page ? (mesuré en continu sur le document affiché)
  useEffect(() => {
    const doc = zoneDocument.current?.querySelector<HTMLElement>('.document')
    if (!doc || impression === 'A4') return
    // Hauteur fixe de 148,5 mm : scrollHeight inclut ce qui déborde
    const observateur = new ResizeObserver(() => setDepasse(doc.scrollHeight / PX_PAR_MM > HAUTEUR_DEMI_PAGE_MM + 0.5))
    observateur.observe(doc)
    return () => observateur.disconnect()
  }, [impression, devis])

  if (erreur) return <p className="alerte alerte-erreur" role="alert">{erreur}</p>
  if (!devis || !parametres) return <p className="texte-doux">Chargement…</p>

  const peutModifier = profil?.role === 'gerant' || profil?.role === 'accueil'
  const statut = statutAffiche(devis)
  const modifiable = peutModifier && (devis.statut === 'brouillon' || devis.statut === 'envoye')

  async function passerA(nouveau: StatutDevis) {
    setAction(true)
    setErreur(null)
    try {
      await changerStatut(devis!.id, nouveau)
      setVersion((v) => v + 1)
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setAction(false)
    }
  }

  async function supprimer() {
    if (!confirm(`Supprimer définitivement le devis ${devis!.numero} ?`)) return
    setAction(true)
    try {
      await supprimerDevis(devis!.id)
      navigate('/devis')
    } catch (e) {
      setErreur((e as Error).message)
      setAction(false)
    }
  }

  return (
    <>
      <div className="barre-fiche no-print">
        <Link to="/devis" className="bouton bouton-discret">
          ← Tous les devis
        </Link>
        <span className={`badge badge-statut statut-${statut}`}>{LIBELLES_STATUTS_DEVIS[statut]}</span>
        {commandeLiee && (
          <Link to={`/commandes/${commandeLiee.id}`} className="bouton bouton-succes">
            📦 Commande {commandeLiee.numero} →
          </Link>
        )}
        <span className="espace" />
        <div className="pastilles filtres choix-format" role="group" aria-label="Format d’impression">
          {(
            [
              ['demi', 'Demi-page A4'],
              ['A4', 'Page entière'],
            ] as const
          ).map(([valeur, libelle]) => (
            <button
              key={valeur}
              type="button"
              className={`pastille ${impression === valeur ? 'selectionne' : ''}`}
              aria-pressed={impression === valeur}
              onClick={() => setImpression(valeur)}
            >
              {libelle}
            </button>
          ))}
        </div>
        <button type="button" className="bouton bouton-principal" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
        {modifiable && (
          <Link to={`/devis/${devis.id}/modifier`} className="bouton">
            Modifier
          </Link>
        )}
        {peutModifier && (
          <Link to={`/devis/nouveau?copie=${devis.id}`} className="bouton">
            Dupliquer
          </Link>
        )}
      </div>

      {peutModifier && (
        <div className="barre-statut no-print">
          <span className="texte-doux petit">Suivi :</span>
          {devis.statut === 'brouillon' && (
            <button type="button" className="bouton" disabled={action} onClick={() => passerA('envoye')}>
              Marquer comme envoyé au client
            </button>
          )}
          {(devis.statut === 'brouillon' || devis.statut === 'envoye') && (
            <>
              <button type="button" className="bouton bouton-succes" disabled={action} onClick={() => setCreationCommande(true)}>
                ✓ Accepté — créer la commande
              </button>
              <button type="button" className="bouton" disabled={action} onClick={() => passerA('refuse')}>
                ✕ Refusé
              </button>
            </>
          )}
          {devis.statut === 'accepte' && !commandeLiee && (
            <button type="button" className="bouton bouton-succes" disabled={action} onClick={() => setCreationCommande(true)}>
              Créer la commande
            </button>
          )}
          {(devis.statut === 'accepte' || devis.statut === 'refuse') && !commandeLiee && (
            <button type="button" className="bouton" disabled={action} onClick={() => passerA('envoye')}>
              Rouvrir le devis
            </button>
          )}
          {profil?.role === 'gerant' && (
            <button type="button" className="bouton bouton-danger" disabled={action} onClick={supprimer}>
              Supprimer
            </button>
          )}
        </div>
      )}

      {erreur && <p className="alerte alerte-erreur no-print" role="alert">{erreur}</p>}

      {impression !== 'A4' && depasse && (
        <p className="alerte alerte-attention no-print" role="status">
          Ce devis dépasse la demi-page : choisissez « Page entière » pour l’imprimer.
        </p>
      )}

      <div ref={zoneDocument} className={`feuille feuille-${impression}`}>
        <DocumentDevis devis={devis} parametres={parametres} format={impression} />
      </div>

      {creationCommande && peutModifier && !commandeLiee && (
        <FenetreCreationCommande
          numeroDevis={devis.numero}
          onFermer={() => setCreationCommande(false)}
          onCreer={async (dateLivraison, urgent) => {
            const idCommande = await creerCommandeDepuisDevis(devis.id, dateLivraison, urgent)
            navigate(`/commandes/${idCommande}`)
          }}
        />
      )}
    </>
  )
}

// Le devis accepté devient une commande : livraison prévue et urgence
function FenetreCreationCommande({
  numeroDevis,
  onFermer,
  onCreer,
}: {
  numeroDevis: string
  onFermer: () => void
  onCreer: (dateLivraison: string | null, urgent: boolean) => Promise<void>
}) {
  const [dateLivraison, setDateLivraison] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function valider(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    try {
      await onCreer(dateLivraison || null, urgent)
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  return (
    <Fenetre titre="Créer la commande" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p>
          Le devis <strong>{numeroDevis}</strong> passe à « accepté » et devient une commande : ses lignes et finitions sont
          transmises à l’atelier après le BAT.
        </p>
        <label htmlFor="cmd-livraison">
          <span>Livraison prévue le</span>
          <input id="cmd-livraison" type="date" value={dateLivraison} onChange={(e) => setDateLivraison(e.target.value)} />
        </label>
        <label className="case-a-cocher">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Commande urgente
        </label>
        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
        <div className="actions-formulaire">
          <span className="espace" />
          <button type="button" className="bouton" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className="bouton bouton-principal" disabled={envoi}>
            {envoi ? 'Création…' : 'Créer la commande'}
          </button>
        </div>
      </form>
    </Fenetre>
  )
}
