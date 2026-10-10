import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Fenetre from '../../components/Fenetre'
import { LIBELLES_MODES_PAIEMENT, type ModePaiement } from '../../lib/depenses'
import {
  LIBELLES_STATUTS_FACTURE,
  annulerFacture,
  chargerFacture,
  enregistrerPaiement,
  resteAPayer,
  supprimerPaiement,
  type Facture,
} from '../../lib/factures'
import { formaterMontant } from '../../lib/format'
import { useParametres } from '../../parametres/ParametresContext'
import BoutonEnvoyer from '../../components/BoutonEnvoyer'
import { estApplicationNative } from '../../lib/partage'
import DocumentFacture from './DocumentFacture'

// Fiche d'une facture : document imprimable, paiements, annulation.

type Impression = 'demi' | 'A4'
const HAUTEUR_DEMI_PAGE_MM = 148.5
const PX_PAR_MM = 96 / 25.4
const dateCourte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR')

export default function FicheFacture() {
  const { id } = useParams()
  const { profil } = useAuth()
  const { parametres } = useParametres()
  const [facture, setFacture] = useState<Facture | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [paiement, setPaiement] = useState(false)
  const [impression, setImpression] = useState<Impression>('demi')
  const [depasse, setDepasse] = useState(false)
  const zoneDocument = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let actuel = true
    chargerFacture(Number(id))
      .then((f) => actuel && setFacture(f))
      .catch((e: Error) => actuel && setErreur(e.message))
    return () => {
      actuel = false
    }
  }, [id, version])

  // Nom du fichier PDF proposé par le navigateur = titre de la page
  useEffect(() => {
    if (!facture) return
    const titre = document.title
    document.title = `${facture.numero} ${facture.client.nom}`
    return () => {
      document.title = titre
    }
  }, [facture])

  useEffect(() => {
    const doc = zoneDocument.current?.querySelector<HTMLElement>('.document')
    if (!doc || impression === 'A4') return
    const observateur = new ResizeObserver(() => setDepasse(doc.scrollHeight / PX_PAR_MM > HAUTEUR_DEMI_PAGE_MM + 0.5))
    observateur.observe(doc)
    return () => observateur.disconnect()
  }, [impression, facture])

  if (erreur && !facture) return <p className="alerte alerte-erreur" role="alert">{erreur}</p>
  if (!facture || !parametres) return <p className="texte-doux">Chargement…</p>

  const f = facture
  const devise = parametres.devise
  const role = profil?.role
  const encaisse = role === 'gerant' || role === 'accueil' || role === 'compta'
  const peutAnnuler = (role === 'gerant' || role === 'compta') && f.statut !== 'annulee'
  const reste = resteAPayer(f)

  // Message accompagnant le PDF envoyé au client
  const messageClient = [
    `Bonjour ${f.client.contact || f.client.nom},`,
    `Veuillez trouver ci-joint la facture ${f.numero} d’un montant de ${formaterMontant(Number(f.total_ttc), devise)}.`,
    reste > 0
      ? `Reste à payer : ${formaterMontant(reste, devise)}${f.date_echeance ? `, avant le ${new Date(`${f.date_echeance}T12:00:00`).toLocaleDateString('fr-FR')}` : ''}.`
      : 'Cette facture est entièrement réglée. Merci !',
    reste > 0 && parametres.coordonnees_bancaires ? `Règlement : ${parametres.coordonnees_bancaires.split('\n')[0]}` : '',
    'Merci pour votre confiance.',
    [parametres.nom_imprimerie, parametres.telephone].filter(Boolean).join(' — '),
  ]
    .filter(Boolean)
    .join('\n')
  const proprietesEnvoi = {
    zone: zoneDocument,
    format: impression,
    numero: f.numero,
    client: f.client.nom,
    telephone: f.client.telephone,
    indicatif: parametres.indicatif_telephone,
    message: messageClient,
  }

  async function annuler() {
    if (!confirm(`Annuler la facture ${f.numero} ? Elle restera visible (annulée) ; la commande pourra être refacturée.`)) return
    try {
      await annulerFacture(f.id)
      setVersion((v) => v + 1)
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  async function retirerPaiement(idPaiement: number) {
    if (!confirm('Supprimer ce paiement ?')) return
    try {
      await supprimerPaiement(idPaiement)
      setVersion((v) => v + 1)
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  return (
    <>
      <div className="barre-fiche no-print">
        <Link to="/factures" className="bouton bouton-discret">
          ← Toutes les factures
        </Link>
        <span className={`badge badge-statut fac-${f.statut}`}>{LIBELLES_STATUTS_FACTURE[f.statut]}</span>
        {f.commande_id && f.commande && (
          <Link to={`/commandes/${f.commande_id}`} className="bouton bouton-discret">
            Commande {f.commande.numero}
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
            <button key={valeur} type="button" className={`pastille ${impression === valeur ? 'selectionne' : ''}`} aria-pressed={impression === valeur} onClick={() => setImpression(valeur)}>
              {libelle}
            </button>
          ))}
        </div>
        {estApplicationNative() ? (
          <BoutonEnvoyer {...proprietesEnvoi} impression />
        ) : (
          <button type="button" className="bouton bouton-principal" onClick={() => window.print()}>
            Imprimer / PDF
          </button>
        )}
        <BoutonEnvoyer {...proprietesEnvoi} />
      </div>

      {/* Paiements */}
      <section className="carte resume-paiement no-print">
        <div className="resume-stock">
          <div>
            <span className="texte-doux petit">Montant de la facture</span>
            <strong className="total-mois">{formaterMontant(Number(f.total_ttc), devise)}</strong>
          </div>
          <div>
            <span className="texte-doux petit">Déjà réglé</span>
            <strong className="total-mois texte-succes">{formaterMontant(Number(f.montant_paye), devise)}</strong>
          </div>
          <div>
            <span className="texte-doux petit">Reste à payer</span>
            <strong className={`total-mois ${reste > 0 ? 'texte-erreur' : ''}`}>{formaterMontant(reste, devise)}</strong>
          </div>
        </div>
        {encaisse && f.statut !== 'annulee' && reste > 0 && (
          <button type="button" className="bouton bouton-principal" onClick={() => setPaiement(true)}>
            + Enregistrer un paiement
          </button>
        )}
        {f.paiements.length > 0 && (
          <ul className="liste-paiements">
            {f.paiements.map((pa) => (
              <li key={pa.id}>
                <span>{dateCourte(pa.date_paiement)}</span>
                <strong>{formaterMontant(Number(pa.montant), devise)}</strong>
                <span className="texte-doux petit">
                  {[LIBELLES_MODES_PAIEMENT[pa.mode], pa.reference].filter(Boolean).join(' · ')}
                </span>
                {role === 'gerant' && f.statut !== 'annulee' && (
                  <button type="button" className="bouton-fermer" aria-label="Supprimer ce paiement" onClick={() => retirerPaiement(pa.id)}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {erreur && <p className="alerte alerte-erreur no-print" role="alert">{erreur}</p>}
      {impression !== 'A4' && depasse && (
        <p className="alerte alerte-attention no-print" role="status">
          Cette facture dépasse la demi-page : choisissez « Page entière » pour l’imprimer.
        </p>
      )}

      <div ref={zoneDocument} className={`feuille feuille-${impression}`}>
        <DocumentFacture facture={f} parametres={parametres} format={impression} />
      </div>

      {peutAnnuler && (
        <div className="barre-statut barre-livraison no-print">
          <span className="espace" />
          <button type="button" className="bouton bouton-danger" onClick={annuler}>
            Annuler la facture
          </button>
        </div>
      )}

      {paiement && (
        <FenetrePaiement
          facture={f}
          reste={reste}
          devise={devise}
          onFermer={() => setPaiement(false)}
          onEnregistre={() => {
            setPaiement(false)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </>
  )
}

function FenetrePaiement({
  facture,
  reste,
  devise,
  onFermer,
  onEnregistre,
}: {
  facture: Facture
  reste: number
  devise: string
  onFermer: () => void
  onEnregistre: () => void
}) {
  const [montant, setMontant] = useState(String(reste).replace('.', ','))
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<ModePaiement>('especes')
  const [reference, setReference] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function valider(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    const m = Number(montant.replace(',', '.').replace(/\s/g, ''))
    if (!(m > 0)) return setErreur('Le montant doit être supérieur à 0.')
    if (m > reste + 0.001 && !confirm(`Le montant dépasse le reste à payer (${formaterMontant(reste, devise)}). Enregistrer quand même ?`)) return
    setEnvoi(true)
    try {
      await enregistrerPaiement({ facture_id: facture.id, date_paiement: date, montant: m, mode, reference })
      onEnregistre()
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  return (
    <Fenetre titre={`Paiement — ${facture.numero}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider} noValidate>
        <p className="texte-doux">
          {facture.client.nom} · reste à payer <strong>{formaterMontant(reste, devise)}</strong>
        </p>
        <div className="grille-champs">
          <label htmlFor="pai-montant">
            <span>Montant reçu</span>
            <span className="champ-suffixe">
              <input id="pai-montant" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} autoFocus />
              <span>{devise}</span>
            </span>
          </label>
          <label htmlFor="pai-date">
            <span>Date</span>
            <input id="pai-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label htmlFor="pai-mode">
            <span>Mode de paiement</span>
            <select id="pai-mode" value={mode} onChange={(e) => setMode(e.target.value as ModePaiement)}>
              {(Object.keys(LIBELLES_MODES_PAIEMENT) as ModePaiement[]).map((m) => (
                <option key={m} value={m}>
                  {LIBELLES_MODES_PAIEMENT[m]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="pai-reference">
            <span>Référence (n° de chèque, transaction…)</span>
            <input id="pai-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>
        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
        <div className="actions-formulaire">
          <span className="espace" />
          <button type="button" className="bouton" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className="bouton bouton-principal" disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Enregistrer le paiement'}
          </button>
        </div>
      </form>
    </Fenetre>
  )
}
