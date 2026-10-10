import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import DocumentDevis from './DocumentDevis'

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

  useEffect(() => {
    let actuel = true
    chargerDevis(Number(id))
      .then((d) => actuel && setDevis(d))
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
        <span className="espace" />
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
              <button type="button" className="bouton bouton-succes" disabled={action} onClick={() => passerA('accepte')}>
                ✓ Accepté par le client
              </button>
              <button type="button" className="bouton" disabled={action} onClick={() => passerA('refuse')}>
                ✕ Refusé
              </button>
            </>
          )}
          {(devis.statut === 'accepte' || devis.statut === 'refuse') && (
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

      <DocumentDevis devis={devis} parametres={parametres} />
    </>
  )
}
