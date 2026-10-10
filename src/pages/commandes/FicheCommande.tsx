import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import {
  ETAPES_COMMANDE,
  LIBELLES_STATUTS_COMMANDE,
  LIBELLES_STATUTS_PRODUCTION,
  chargerCommande,
  enRetard,
  envoyerBat,
  modifierCommande,
  repondreBat,
  totalCommande,
  type Commande,
  type StatutCommande,
} from '../../lib/commandes'
import { creerFactureDepuisCommande, factureDeCommande } from '../../lib/factures'
import { formaterMontant } from '../../lib/format'
import { LIBELLES_TECHNIQUES } from '../../lib/libelles'
import { useParametres } from '../../parametres/ParametresContext'

// Fiche d'une commande : suivi (BAT → production → livraison), lignes, montants.
// Les statuts « BAT envoyé / validé », « en production » et « terminée » se mettent à jour
// automatiquement (déclencheurs de sql/08_commandes.sql).

const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR')
const dateHeure = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
const versNombre = (s: string) => Number(String(s).replace(',', '.').replace(/\s/g, ''))

export default function FicheCommande() {
  const { id } = useParams()
  const { profil } = useAuth()
  const devise = useParametres().parametres?.devise ?? ''
  const [commande, setCommande] = useState<Commande | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [action, setAction] = useState(false)
  const [version, setVersion] = useState(0)
  const [lienBat, setLienBat] = useState('')
  const [acompte, setAcompte] = useState<string | null>(null)
  const [facture, setFacture] = useState<{ id: number; numero: string } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let actuel = true
    Promise.all([chargerCommande(Number(id)), factureDeCommande(Number(id)).catch(() => null)])
      .then(([c, f]) => {
        if (!actuel) return
        setCommande(c)
        setFacture(f)
        setErreur(null)
      })
      .catch((e: Error) => actuel && setErreur(e.message))
    return () => {
      actuel = false
    }
  }, [id, version])

  if (erreur && !commande) return <p className="alerte alerte-erreur" role="alert">{erreur}</p>
  if (!commande) return <p className="texte-doux">Chargement…</p>

  const c = commande
  const role = profil?.role
  const gereClient = role === 'gerant' || role === 'accueil' // BAT, livraison, acompte, annulation
  const voitPrix = role !== 'atelier'
  const active = c.statut !== 'livre' && c.statut !== 'annule'
  const totaux = totalCommande(c.lignes, c.remise_pct, c.taux_tva)
  const montantDu = c.taux_tva > 0 ? totaux.ttc : totaux.ht
  const dernierBat = c.bats[0]
  const etapeCourante = ETAPES_COMMANDE.indexOf(c.statut)

  async function executer(operation: () => Promise<unknown>) {
    setAction(true)
    setErreur(null)
    try {
      await operation()
      setVersion((v) => v + 1)
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setAction(false)
    }
  }

  const peutFacturer = (role === 'gerant' || role === 'compta' || role === 'accueil') && c.statut !== 'annule' && !facture

  async function facturer() {
    if (c.statut !== 'livre' && c.statut !== 'termine' && !confirm('La commande n’est pas encore terminée. Créer la facture maintenant ?')) return
    setAction(true)
    setErreur(null)
    try {
      const idFacture = await creerFactureDepuisCommande(c.id)
      navigate(`/factures/${idFacture}`)
    } catch (e) {
      setErreur((e as Error).message)
      setAction(false)
    }
  }

  const passerA = (statut: StatutCommande, extra: Record<string, unknown> = {}) => executer(() => modifierCommande(c.id, { statut, ...extra }))

  function soumettreBat(e: FormEvent) {
    e.preventDefault()
    executer(async () => {
      await envoyerBat(c.id, (dernierBat?.version ?? 0) + 1, lienBat.trim())
      setLienBat('')
    })
  }

  function refuserBat() {
    const commentaire = prompt('Corrections demandées par le client :')
    if (commentaire === null) return
    executer(() => repondreBat(dernierBat!.id, 'refuse', commentaire))
  }

  function annuler() {
    if (!confirm(`Annuler la commande ${c.numero} ?`)) return
    passerA('annule')
  }

  function enregistrerAcompte() {
    const n = versNombre(acompte ?? '')
    if (!(n >= 0)) return setErreur('Acompte invalide.')
    executer(async () => {
      await modifierCommande(c.id, { acompte: n })
      setAcompte(null)
    })
  }

  return (
    <>
      <div className="barre-fiche">
        <Link to="/commandes" className="bouton bouton-discret">
          ← Toutes les commandes
        </Link>
        <span className={`badge badge-statut cmd-${c.statut}`}>{LIBELLES_STATUTS_COMMANDE[c.statut]}</span>
        {c.urgent && <span className="badge statut-refuse">🔥 Urgent</span>}
        {enRetard(c) && <span className="badge statut-refuse">⚠ En retard</span>}
        <span className="espace" />
        {facture && role !== 'atelier' && (
          <Link to={`/factures/${facture.id}`} className="bouton bouton-succes">
            🧾 Facture {facture.numero} →
          </Link>
        )}
        {peutFacturer && (
          <button type="button" className="bouton bouton-principal" disabled={action} onClick={facturer}>
            🧾 Créer la facture
          </button>
        )}
        {active && role !== 'compta' && (
          <Link to="/production" className="bouton">
            File de production
          </Link>
        )}
      </div>

      {/* Suivi par étapes */}
      {c.statut !== 'annule' && (
        <ol className="etapes" aria-label="Avancement de la commande">
          {ETAPES_COMMANDE.map((etape, i) => (
            <li key={etape} className={i < etapeCourante ? 'faite' : i === etapeCourante ? 'courante' : ''} aria-current={i === etapeCourante ? 'step' : undefined}>
              {LIBELLES_STATUTS_COMMANDE[etape]}
            </li>
          ))}
        </ol>
      )}

      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}

      <section className="carte">
        <h2 className="titre-carte">
          {c.numero} — {c.client.nom}
        </h2>
        <dl className="identifiants infos-commande">
          {c.objet && (
            <>
              <dt>Objet</dt>
              <dd>{c.objet}</dd>
            </>
          )}
          <dt>Client</dt>
          <dd>{[c.client.nom, c.client.contact, c.client.telephone].filter(Boolean).join(' · ')}</dd>
          {c.devis_id && c.devis && role !== 'atelier' && (
            <>
              <dt>Devis</dt>
              <dd>
                <Link to={`/devis/${c.devis_id}`}>{c.devis.numero}</Link>
              </dd>
            </>
          )}
          <dt>Commandée le</dt>
          <dd>{date(c.date_commande)}</dd>
          <dt>Livraison prévue</dt>
          <dd>
            {gereClient && active ? (
              <input
                type="date"
                aria-label="Date de livraison prévue"
                className="champ-date"
                value={c.date_livraison_prevue ?? ''}
                onChange={(e) => executer(() => modifierCommande(c.id, { date_livraison_prevue: e.target.value || null }))}
              />
            ) : c.date_livraison_prevue ? (
              date(c.date_livraison_prevue)
            ) : (
              '—'
            )}
          </dd>
          {c.date_livraison_reelle && (
            <>
              <dt>Livrée le</dt>
              <dd>{date(c.date_livraison_reelle)}</dd>
            </>
          )}
          {c.notes && (
            <>
              <dt>Remarques</dt>
              <dd>{c.notes}</dd>
            </>
          )}
        </dl>
        {gereClient && active && (
          <label className="case-a-cocher petit">
            <input type="checkbox" checked={c.urgent} disabled={action} onChange={(e) => executer(() => modifierCommande(c.id, { urgent: e.target.checked }))} />
            Commande urgente (passe en tête de la file de production)
          </label>
        )}
      </section>

      {/* BAT */}
      {c.statut !== 'annule' && (
        <section className="carte section-bat">
          <h2 className="titre-carte">Bon à tirer (BAT)</h2>

          {c.statut === 'attente_bat' && gereClient && (
            <>
              <form className="formulaire-bat" onSubmit={soumettreBat}>
                <label htmlFor="lien-bat">
                  <span>Lien du fichier BAT (Google Drive…) — version {(dernierBat?.version ?? 0) + 1}</span>
                  <input id="lien-bat" type="url" placeholder="https://drive.google.com/…" value={lienBat} onChange={(e) => setLienBat(e.target.value)} />
                </label>
                <button type="submit" className="bouton bouton-principal" disabled={action}>
                  BAT envoyé au client
                </button>
              </form>
              <button type="button" className="bouton bouton-discret" disabled={action} onClick={() => passerA('bat_valide')}>
                Pas de BAT nécessaire → prête à produire
              </button>
            </>
          )}

          {c.statut === 'bat_envoye' && dernierBat && gereClient && (
            <div className="barre-statut">
              <span>Réponse du client au BAT v{dernierBat.version} :</span>
              <button type="button" className="bouton bouton-succes" disabled={action} onClick={() => executer(() => repondreBat(dernierBat.id, 'valide', ''))}>
                ✓ BAT validé
              </button>
              <button type="button" className="bouton" disabled={action} onClick={refuserBat}>
                ✕ Corrections demandées
              </button>
            </div>
          )}

          {c.bats.length === 0 ? (
            <p className="texte-doux petit">{c.statut === 'attente_bat' ? 'Aucun BAT envoyé pour le moment.' : 'Commande lancée sans BAT.'}</p>
          ) : (
            <ul className="liste-bat">
              {c.bats.map((b) => (
                <li key={b.id}>
                  <strong>v{b.version}</strong>
                  <span className={`badge badge-statut ${b.statut === 'valide' ? 'statut-accepte' : b.statut === 'refuse' ? 'statut-refuse' : 'statut-envoye'}`}>
                    {b.statut === 'valide' ? 'Validé' : b.statut === 'refuse' ? 'Refusé' : 'Envoyé'}
                  </span>
                  <span className="texte-doux petit">
                    envoyé le {dateHeure(b.date_envoi)}
                    {b.date_reponse && ` · réponse le ${dateHeure(b.date_reponse)}`}
                  </span>
                  {b.lien_fichier && (
                    <a href={b.lien_fichier} target="_blank" rel="noreferrer">
                      Ouvrir le fichier
                    </a>
                  )}
                  {b.commentaire_client && <span className="commentaire-bat">« {b.commentaire_client} »</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Lignes et production */}
      <h2 className="titre-section">Travaux</h2>
      <ul className="liste-cartes">
        {c.lignes.map((l) => (
          <li key={l.id} className="carte carte-ligne">
            <div className="carte-corps">
              <div className="carte-titre">
                <strong className="multiligne">{l.description}</strong>
              </div>
              <div className="texte-doux petit">
                {[
                  `${l.quantite.toLocaleString('fr-FR')} ex.`,
                  LIBELLES_TECHNIQUES[l.technique],
                  l.instructions,
                  l.operateur && `par ${l.operateur.nom_complet}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <span className={`badge badge-statut prod-${l.statut_production}`}>{LIBELLES_STATUTS_PRODUCTION[l.statut_production]}</span>
            {voitPrix && <strong className="montant-carte">{formaterMontant(Number(l.prix_total_ht), devise)}</strong>}
          </li>
        ))}
      </ul>

      {voitPrix && (
        <section className="carte">
          <dl className="totaux">
            {c.remise_pct > 0 && (
              <>
                <dt>Remise {c.remise_pct} %</dt>
                <dd>− {formaterMontant(totaux.brut - totaux.ht, devise)}</dd>
              </>
            )}
            <dt>Total HT</dt>
            <dd>{formaterMontant(totaux.ht, devise)}</dd>
            {c.taux_tva > 0 && (
              <>
                <dt>TVA {c.taux_tva} %</dt>
                <dd>{formaterMontant(totaux.tva, devise)}</dd>
              </>
            )}
            <dt className="total-final">{c.taux_tva > 0 ? 'Total TTC' : 'Total à payer'}</dt>
            <dd className="total-final">{formaterMontant(montantDu, devise)}</dd>
            <dt>Acompte reçu</dt>
            <dd>
              {gereClient && acompte !== null ? (
                <span className="champ-suffixe">
                  <input aria-label="Acompte reçu" inputMode="decimal" value={acompte} onChange={(e) => setAcompte(e.target.value)} />
                  <button type="button" className="bouton" onClick={enregistrerAcompte} disabled={action}>
                    OK
                  </button>
                </span>
              ) : (
                <>
                  {formaterMontant(Number(c.acompte), devise)}
                  {gereClient && active && (
                    <button type="button" className="bouton bouton-discret" onClick={() => setAcompte(String(c.acompte).replace('.', ','))}>
                      {' '}
                      modifier
                    </button>
                  )}
                </>
              )}
            </dd>
            <dt>Reste à payer</dt>
            <dd>
              <strong>{formaterMontant(Math.max(montantDu - Number(c.acompte), 0), devise)}</strong>
            </dd>
          </dl>
        </section>
      )}

      {gereClient && (
        <div className="barre-statut barre-livraison">
          {(c.statut === 'termine' || c.statut === 'en_production' || c.statut === 'bat_valide') && (
            <button
              type="button"
              className="bouton bouton-principal"
              disabled={action}
              onClick={() => {
                if (c.statut !== 'termine' && !confirm('Tous les travaux ne sont pas terminés. Marquer quand même la commande comme livrée ?')) return
                passerA('livre', { date_livraison_reelle: new Date().toISOString().slice(0, 10) })
              }}
            >
              ✓ Marquer comme livrée
            </button>
          )}
          {c.statut === 'livre' && (
            <button type="button" className="bouton" disabled={action} onClick={() => passerA('termine', { date_livraison_reelle: null })}>
              Annuler la livraison
            </button>
          )}
          <span className="espace" />
          {active && (
            <button type="button" className="bouton bouton-danger" disabled={action} onClick={annuler}>
              Annuler la commande
            </button>
          )}
          {c.statut === 'annule' && (
            <button type="button" className="bouton" disabled={action} onClick={() => passerA('attente_bat')}>
              Rétablir la commande
            </button>
          )}
        </div>
      )}
    </>
  )
}
