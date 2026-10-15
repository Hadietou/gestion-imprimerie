import { LIBELLES_MODES_PAIEMENT } from '../../lib/depenses'
import { resteAPayer, type Facture } from '../../lib/factures'
import { formaterMontant } from '../../lib/format'
import { montantEnLettres } from '../../lib/lettres'
import type { Parametres } from '../../lib/parametres'

// Facture mise en page pour l'impression (mêmes styles que le devis :
// moitié haute d'une feuille A4 par défaut, ou page entière).

const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
const dateCourte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR')
const nombre = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

function Lignes({ texte }: { texte: string | null | undefined }) {
  if (!texte) return null
  return (
    <>
      {texte.split('\n').map((ligne, i) => (
        <span key={i} className="doc-ligne-texte">
          {ligne}
        </span>
      ))}
    </>
  )
}

export default function DocumentFacture({
  facture: f,
  parametres: p,
  format = 'demi',
}: {
  facture: Facture
  parametres: Parametres
  format?: 'demi' | 'A4'
}) {
  const devise = p.devise
  const compact = format === 'demi'
  const lignes = f.commande?.lignes ?? []
  const brut = lignes.reduce((s, l) => s + Number(l.prix_total_ht), 0)
  const remise = Math.round((brut - Number(f.total_ht)) * 100) / 100
  const avecTva = Number(f.taux_tva) > 0
  const total = Number(f.total_ttc)
  const reste = resteAPayer(f)
  const c = f.client

  const blocClient = (
    <section className="doc-client">
      <span className="doc-etiquette">Facturé à</span>
      <strong>{c.nom}</strong>
      {c.contact && <span>À l’attention de : {c.contact}</span>}
      <Lignes texte={c.adresse} />
      {c.telephone && <span>Tél. : {c.telephone}</span>}
      {c.numero_fiscal && <span>NIF : {c.numero_fiscal}</span>}
    </section>
  )

  return (
    <article className={`document ${compact ? 'format-demi' : 'format-a4'}`} aria-label={`Facture ${f.numero}`}>
      <header className="doc-entete">
        <div className="doc-emetteur">
          <h2>{p.nom_imprimerie}</h2>
          <Lignes texte={p.adresse} />
          {p.telephone && <span>Tél. : {p.telephone}</span>}
          {p.email && <span>{p.email}</span>}
          {(p.numero_fiscal || p.registre_commerce) && (
            <span className="doc-petit">
              {[p.numero_fiscal && `NIF : ${p.numero_fiscal}`, p.registre_commerce && `RC : ${p.registre_commerce}`]
                .filter(Boolean)
                .join(' — ')}
            </span>
          )}
        </div>
        {compact && blocClient}
        <div className="doc-titre">
          <h1>FACTURE</h1>
          <span className="doc-numero">N° {f.numero}</span>
          <span>Date : {date(f.date_facture)}</span>
          {f.date_echeance && reste > 0 && <span>À régler avant le {date(f.date_echeance)}</span>}
          {f.commande && (
            <span className="doc-petit">
              Commande {f.commande.numero}
              {f.commande.devis && ` · devis ${f.commande.devis.numero}`}
            </span>
          )}
        </div>
      </header>

      {!compact && blocClient}

      {f.notes && (
        <p className="doc-objet">
          <strong>Objet :</strong> {f.notes}
        </p>
      )}

      <table className="doc-table">
        <thead>
          <tr>
            <th scope="col">Désignation</th>
            <th scope="col" className="num">Qté</th>
            <th scope="col" className="num">P.U. HT</th>
            <th scope="col" className="num">Montant HT</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              <td>
                <Lignes texte={l.description} />
              </td>
              <td className="num">{nombre(l.quantite)}</td>
              <td className="num">{formaterMontant(Number(l.prix_total_ht) / l.quantite, '')}</td>
              <td className="num">{formaterMontant(Number(l.prix_total_ht), '')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-bas">
        <div className="doc-lettres">
          Arrêtée la présente facture à la somme de :<br />
          <strong>
            {montantEnLettres(total, devise)} {avecTva ? 'TTC' : 'HT'}
          </strong>
          {!avecTva && <span className="doc-petit">TVA non applicable.</span>}
          {f.paiements.length > 0 && (
            <span className="doc-petit">
              Règlements reçus :{' '}
              {f.paiements
                .map((pa) => {
                  // L'acompte repris de la commande est enregistré en mode « autre »
                  const mode = pa.reference?.startsWith('Acompte') ? 'Acompte' : LIBELLES_MODES_PAIEMENT[pa.mode].split(' (')[0]
                  return `${dateCourte(pa.date_paiement)} ${formaterMontant(Number(pa.montant), devise)} (${mode})`
                })
                .join(' ; ')}
            </span>
          )}
        </div>
        <table className="doc-totaux">
          <tbody>
            {remise > 0 && (
              <>
                <tr>
                  <th scope="row">Sous-total HT</th>
                  <td>{formaterMontant(brut, devise)}</td>
                </tr>
                <tr>
                  <th scope="row">Remise {nombre(Number(f.commande?.remise_pct ?? 0))} %</th>
                  <td>− {formaterMontant(remise, devise)}</td>
                </tr>
              </>
            )}
            <tr>
              <th scope="row">Total HT</th>
              <td>{formaterMontant(Number(f.total_ht), devise)}</td>
            </tr>
            {avecTva && (
              <>
                <tr>
                  <th scope="row">TVA {nombre(Number(f.taux_tva))} %</th>
                  <td>{formaterMontant(Number(f.total_tva), devise)}</td>
                </tr>
                <tr>
                  <th scope="row">Total TTC</th>
                  <td>{formaterMontant(total, devise)}</td>
                </tr>
              </>
            )}
            {Number(f.montant_paye) > 0 && (
              <tr>
                <th scope="row">Déjà réglé</th>
                <td>− {formaterMontant(Number(f.montant_paye), devise)}</td>
              </tr>
            )}
            <tr className="doc-total-final">
              <th scope="row">{reste > 0 ? 'Reste à payer' : 'Facture acquittée'}</th>
              <td>{formaterMontant(reste, devise)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {p.mentions_factures && (
        <section className="doc-texte">
          <span className="doc-etiquette">Conditions</span>
          <Lignes texte={p.mentions_factures} />
        </section>
      )}
      {p.coordonnees_bancaires && reste > 0 && (
        <section className="doc-texte">
          <span className="doc-etiquette">Règlement</span>
          <Lignes texte={p.coordonnees_bancaires} />
        </section>
      )}

      <section className="doc-signatures doc-signature-seule">
        <div>
          <span className="doc-etiquette">Pour {p.nom_imprimerie}</span>
          <span className="doc-petit">Signature et cachet</span>
        </div>
      </section>
    </article>
  )
}
