import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import {
  calculerTotaux,
  chargerDevis,
  chargerReferentielsDevis,
  enregistrerDevis,
  type DevisComplet,
} from '../../lib/devis'
import { creerCommandeDepuisDevis, modifierCommande } from '../../lib/commandes'
import { formaterMontant } from '../../lib/format'
import type { Client, Finition, Produit } from '../../lib/types'
import { useParametres } from '../../parametres/ParametresContext'
import ChoixClient from './ChoixClient'
import {
  erreurLigne,
  ligneVide,
  lignesDepuisDevis,
  resumerObjet,
  totalLigne,
  versEnregistrement,
  versNombre,
  type LigneEdition,
} from './edition'
import LigneDevis from './LigneDevis'

interface Referentiels {
  clients: Client[]
  produits: Produit[]
  finitions: Finition[]
}

const aujourdhui = () => new Date().toISOString().slice(0, 10)
const texte = (n: number) => String(n).replace('.', ',')

// Création (/devis/nouveau, éventuellement ?copie=ID) ou modification (/devis/:id/modifier).
// modeCommande (/commandes/nouvelle) : commande directe, sans passer par l'envoi d'un devis.
// Le devis est créé en coulisse (déjà accepté) puis transformé en commande.
export default function EditeurDevis({ modeCommande = false }: { modeCommande?: boolean }) {
  const { id } = useParams()
  const [parametresUrl] = useSearchParams()
  const idCopie = parametresUrl.get('copie')
  const { parametres } = useParametres()
  const [donnees, setDonnees] = useState<{ ref: Referentiels; devis: DevisComplet | null } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let actuel = true
    const source = id ?? idCopie
    Promise.all([chargerReferentielsDevis(), source ? chargerDevis(Number(source)) : Promise.resolve(null)])
      .then(([ref, devis]) => actuel && setDonnees({ ref, devis }))
      .catch((e: Error) => actuel && setErreur(e.message))
    return () => {
      actuel = false
    }
  }, [id, idCopie])

  if (erreur) return <p className="alerte alerte-erreur" role="alert">{erreur}</p>
  if (!donnees || !parametres) return <p className="texte-doux">Chargement…</p>

  const { devis } = donnees
  if (devis && id && (devis.statut === 'accepte' || devis.statut === 'refuse')) {
    return (
      <div className="vide">
        <p>
          Le devis {devis.numero} est {devis.statut === 'accepte' ? 'accepté' : 'refusé'} : il ne peut plus être modifié.
        </p>
        <p>
          <Link to={`/devis/${devis.id}`}>Retour au devis</Link> — ou dupliquez-le pour en faire un nouveau.
        </p>
      </div>
    )
  }

  return (
    <Formulaire
      key={`${id ?? 'nouveau'}-${idCopie ?? ''}`}
      referentiels={donnees.ref}
      source={devis}
      modification={Boolean(id)}
      tauxTvaDefaut={versNombre(parametres.taux_tva) || 0}
      validiteDefaut={versNombre(parametres.validite_devis_j) || 30}
      devise={parametres.devise}
      modeCommande={modeCommande}
    />
  )
}

function Formulaire({
  referentiels,
  source,
  modification,
  tauxTvaDefaut,
  validiteDefaut,
  devise,
  modeCommande,
}: {
  referentiels: Referentiels
  source: DevisComplet | null
  modification: boolean
  tauxTvaDefaut: number
  validiteDefaut: number
  devise: string
  modeCommande: boolean
}) {
  const navigate = useNavigate()
  const { profil } = useAuth()
  const { produits, finitions } = referentiels

  // Le client d'un devis existant peut avoir été désactivé : on le garde dans la liste
  const clients =
    source && !referentiels.clients.some((c) => c.id === source.client_id)
      ? [...referentiels.clients, source.client]
      : referentiels.clients

  const [client, setClient] = useState<Client | null>(source ? source.client : null)
  const [date, setDate] = useState(modification && source ? source.date_devis : aujourdhui())
  const [validite, setValidite] = useState(String(source?.validite_jours ?? validiteDefaut))
  const [remise, setRemise] = useState(texte(source?.remise_pct ?? 0))
  const [tvaActive, setTvaActive] = useState(source ? source.taux_tva > 0 : tauxTvaDefaut > 0)
  const [taux, setTaux] = useState(texte(source && source.taux_tva > 0 ? source.taux_tva : tauxTvaDefaut))
  const [notes, setNotes] = useState(source?.notes ?? '')
  const [lignes, setLignes] = useState<LigneEdition[]>(source ? lignesDepuisDevis(source) : [ligneVide()])
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  // Vrai : après l'enregistrement, ouvrir la création de la commande (commande directe au comptoir)
  const creerCommandeApres = useRef(false)
  // Commande directe : livraison, urgence, BAT, acompte
  const [livraison, setLivraison] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [batNecessaire, setBatNecessaire] = useState(false)
  const [acompte, setAcompte] = useState('')

  if (profil && !['gerant', 'accueil'].includes(profil.role)) {
    return <p className="alerte alerte-erreur">Seuls le gérant et l’accueil peuvent modifier les devis.</p>
  }

  const remisePct = Math.min(Math.max(versNombre(remise) || 0, 0), 100)
  const tauxTva = tvaActive ? Math.max(versNombre(taux) || 0, 0) : 0
  const totaux = calculerTotaux(lignes.map(totalLigne), remisePct, tauxTva)
  // Objet du devis : résumé automatique des produits saisis
  const objetAuto = resumerObjet(lignes)

  function choisirClient(c: Client | null) {
    setClient(c)
    // La remise habituelle du client devient la remise du devis
    if (c) setRemise(texte(c.remise_pct))
    setErreurs((e) => ({ ...e, client: '' }))
  }

  const modifierLigne = (i: number, l: LigneEdition) => {
    setLignes((ls) => ls.map((x, j) => (j === i ? l : x)))
    setErreurs((e) => ({ ...e, [l.cle]: '' }))
  }

  async function valider(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const nouvelles: Record<string, string> = {}
    if (!client) nouvelles.client = 'Choisissez le client.'
    if (lignes.length === 0) nouvelles.lignes = 'Ajoutez au moins une ligne.'
    for (const l of lignes) {
      const err = erreurLigne(l, produits)
      if (err) nouvelles[l.cle] = err
    }
    const jours = versNombre(validite)
    if (!Number.isInteger(jours) || jours < 1) nouvelles.validite = 'Nombre de jours invalide.'
    const montantAcompte = acompte.trim() ? versNombre(acompte) : 0
    if (modeCommande && !(montantAcompte >= 0)) nouvelles.acompte = 'Montant invalide.'
    setErreurs(nouvelles)
    if (Object.values(nouvelles).some(Boolean)) {
      setMessage('Corrigez les points signalés.')
      return
    }

    setEnvoi(true)
    try {
      const nouvelId = await enregistrerDevis(
        {
          id: modification && source ? source.id : null,
          client_id: client!.id,
          date_devis: date,
          validite_jours: jours,
          objet: objetAuto,
          remise_pct: remisePct,
          taux_tva: tauxTva,
          notes: notes.trim(),
        },
        lignes.map(versEnregistrement),
      )
      if (modeCommande) {
        // Devis accepté → commande, puis BAT / acompte
        const idCommande = await creerCommandeDepuisDevis(nouvelId, livraison || null, urgent)
        const complements: Parameters<typeof modifierCommande>[1] = {}
        if (!batNecessaire) complements.statut = 'bat_valide'
        if (montantAcompte > 0) complements.acompte = montantAcompte
        if (Object.keys(complements).length > 0) await modifierCommande(idCommande, complements)
        navigate(`/commandes/${idCommande}`)
        return
      }
      navigate(`/devis/${nouvelId}${creerCommandeApres.current ? '?commande=1' : ''}`)
    } catch (err) {
      setMessage((err as Error).message)
      setEnvoi(false)
    }
  }

  return (
    <form className="formulaire editeur-devis" onSubmit={valider} noValidate>
      {source && !modification && (
        <p className="alerte alerte-succes">Copie du devis {source.numero} : vérifiez les informations puis enregistrez.</p>
      )}

      <section className="carte">
        <h2 className="titre-carte">{modeCommande ? 'Nouvelle commande' : modification && source ? `Devis ${source.numero}` : 'Nouveau devis'}</h2>
        {modeCommande && (
          <p className="texte-doux petit">
            Commande directe (prix discuté avec le client) : un devis accepté est créé automatiquement et reste consultable.
          </p>
        )}
        <div className="grille-champs">
          <div className="champ-large champ-personnalise">
            <span className="libelle-champ">
              Client<span className="obligatoire" aria-hidden="true"> *</span>
            </span>
            <ChoixClient clients={clients} client={client} onChange={choisirClient} erreur={erreurs.client} />
          </div>
          <div className="champ-large champ-personnalise">
            <span className="libelle-champ">Objet (résumé automatique des produits)</span>
            <p className={`objet-auto ${objetAuto ? '' : 'texte-doux'}`}>
              {objetAuto || 'Se remplit tout seul avec les produits ajoutés ci-dessous.'}
            </p>
          </div>
          <label htmlFor="date">
            <span>{modeCommande ? 'Date de la commande' : 'Date du devis'}</span>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label htmlFor="validite" hidden={modeCommande}>
            <span>Validité</span>
            <span className="champ-suffixe">
              <input id="validite" inputMode="numeric" value={validite} aria-invalid={erreurs.validite ? true : undefined} onChange={(e) => setValidite(e.target.value)} />
              <span>jours</span>
            </span>
            {erreurs.validite && <small className="texte-erreur">{erreurs.validite}</small>}
          </label>
        </div>
      </section>

      <section>
        <h2 className="titre-section">Produits et travaux</h2>
        <p className="texte-doux petit aide-section">
          Une ligne par produit commandé (ex. 500 cartes de visite, une bâche de 3 × 1 m). Choisissez le produit, indiquez la
          quantité : le prix se calcule avec la grille de prix ; vous pouvez ajouter des finitions ou modifier le prix.
        </p>
        <ol className="liste-cartes lignes-devis">
          {lignes.map((l, i) => (
            <LigneDevis
              key={l.cle}
              numero={i + 1}
              ligne={l}
              produits={produits}
              finitions={finitions}
              devise={devise}
              erreur={erreurs[l.cle]}
              onChange={(nl) => modifierLigne(i, nl)}
              onSupprimer={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
            />
          ))}
        </ol>
        {erreurs.lignes && <p className="texte-erreur petit">{erreurs.lignes}</p>}
        <button type="button" className="bouton ajout-ligne" onClick={() => setLignes((ls) => [...ls, ligneVide()])}>
          <span className="ajout-ligne-plus" aria-hidden="true">
            +
          </span>
          {lignes.length === 0 ? 'Ajouter un produit' : 'Ajouter un autre produit'}
        </button>
      </section>

      {modeCommande && (
        <section className="carte">
          <h2 className="titre-carte">Livraison et acompte</h2>
          <div className="grille-champs">
            <label htmlFor="livraison">
              <span>Livraison prévue le</span>
              <input id="livraison" type="date" value={livraison} onChange={(e) => setLivraison(e.target.value)} />
            </label>
            <label htmlFor="acompte">
              <span>Acompte reçu</span>
              <span className="champ-suffixe">
                <input id="acompte" inputMode="decimal" placeholder="0" value={acompte} aria-invalid={erreurs.acompte ? true : undefined} onChange={(e) => setAcompte(e.target.value)} />
                <span>{devise}</span>
              </span>
              {erreurs.acompte && <small className="texte-erreur">{erreurs.acompte}</small>}
            </label>
            <label className="case-a-cocher champ-large">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
              Commande urgente (en tête de la file de l’atelier)
            </label>
            <label className="case-a-cocher champ-large">
              <input type="checkbox" checked={batNecessaire} onChange={(e) => setBatNecessaire(e.target.checked)} />
              BAT à faire valider par le client avant la production
            </label>
            {!batNecessaire && <small className="texte-doux champ-large">Sans BAT : la commande part directement dans la file de production.</small>}
          </div>
        </section>
      )}

      <section className="carte">
        <div className="grille-champs">
          <label htmlFor="remise">
            <span>{modeCommande ? 'Remise' : 'Remise sur le devis'}</span>
            <span className="champ-suffixe">
              <input id="remise" inputMode="decimal" value={remise} onChange={(e) => setRemise(e.target.value)} />
              <span>%</span>
            </span>
          </label>
          <div className="champ-personnalise">
            <label className="case-a-cocher">
              <input type="checkbox" checked={tvaActive} onChange={(e) => setTvaActive(e.target.checked)} />
              Appliquer la TVA
            </label>
            {tvaActive ? (
              <span className="champ-suffixe">
                <input aria-label="Taux de TVA" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} />
                <span>%</span>
              </span>
            ) : (
              <small className="texte-doux">Devis sans TVA : le total HT est le montant à payer.</small>
            )}
          </div>
          <label className="champ-large" htmlFor="notes">
            <span>{modeCommande ? 'Remarques (consignes, conditions…)' : 'Remarques (imprimées sur le devis)'}</span>
            <textarea id="notes" rows={2} placeholder="Ex. Délai : 5 jours ouvrés après validation du BAT." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        <dl className="totaux">
          {totaux.remise > 0 && (
            <>
              <dt>Sous-total HT</dt>
              <dd>{formaterMontant(totaux.brut, devise)}</dd>
              <dt>Remise {texte(remisePct)} %</dt>
              <dd>− {formaterMontant(totaux.remise, devise)}</dd>
            </>
          )}
          <dt>Total HT</dt>
          <dd>{formaterMontant(totaux.totalHt, devise)}</dd>
          {tauxTva > 0 && (
            <>
              <dt>TVA {texte(tauxTva)} %</dt>
              <dd>{formaterMontant(totaux.totalTva, devise)}</dd>
              <dt className="total-final">Total TTC</dt>
              <dd className="total-final">{formaterMontant(totaux.totalTtc, devise)}</dd>
            </>
          )}
        </dl>
      </section>

      <div className="barre-enregistrement">
        {message && <p className="alerte alerte-erreur" role="alert">{message}</p>}
        <span className="espace" />
        <button
          type="button"
          className="bouton"
          onClick={() => navigate(modeCommande ? '/commandes' : source && modification ? `/devis/${source.id}` : '/devis')}
        >
          Annuler
        </button>
        {modeCommande ? (
          <button type="submit" className="bouton bouton-principal" disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Enregistrer la commande'}
          </button>
        ) : (
          <>
            <button type="submit" className="bouton" disabled={envoi} onClick={() => (creerCommandeApres.current = true)}>
              Enregistrer et créer la commande
            </button>
            <button type="submit" className="bouton bouton-principal" disabled={envoi} onClick={() => (creerCommandeApres.current = false)}>
              {envoi ? 'Enregistrement…' : 'Enregistrer le devis'}
            </button>
          </>
        )}
      </div>
    </form>
  )
}
