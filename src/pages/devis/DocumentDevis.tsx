import { calculerTotaux, dateFinValidite, type DevisComplet } from '../../lib/devis'
import { formaterMontant } from '../../lib/format'
import { montantEnLettres } from '../../lib/lettres'
import type { Parametres } from '../../lib/parametres'

// Devis mis en page pour l'impression A4 (ou « Enregistrer en PDF » du navigateur)

const date = (iso: string | Date) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
const nombre = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const cm = (mm: number) => nombre(mm / 10)

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

export default function DocumentDevis({ devis, parametres: p }: { devis: DevisComplet; parametres: Parametres }) {
  const devise = p.devise
  const lignes = [...devis.lignes].sort((a, b) => a.ordre - b.ordre)
  const totaux = calculerTotaux(
    lignes.map((l) => l.prix_total_ht),
    devis.remise_pct,
    devis.taux_tva,
  )
  const avecTva = devis.taux_tva > 0
  const montantFinal = avecTva ? totaux.totalTtc : totaux.totalHt
  const c = devis.client

  return (
    <article className="document" aria-label={`Devis ${devis.numero}`}>
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
        <div className="doc-titre">
          <h1>DEVIS</h1>
          <span className="doc-numero">N° {devis.numero}</span>
          <span>Date : {date(devis.date_devis)}</span>
          <span>Valable jusqu’au {date(dateFinValidite(devis))}</span>
        </div>
      </header>

      <section className="doc-client">
        <span className="doc-etiquette">Client</span>
        <strong>{c.nom}</strong>
        {c.contact && <span>À l’attention de : {c.contact}</span>}
        <Lignes texte={c.adresse} />
        {c.telephone && <span>Tél. : {c.telephone}</span>}
        {c.numero_fiscal && <span>NIF : {c.numero_fiscal}</span>}
      </section>

      {devis.objet && (
        <p className="doc-objet">
          <strong>Objet :</strong> {devis.objet}
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
                {l.largeur_mm && l.hauteur_mm ? (
                  <span className="doc-detail">Format : {cm(l.largeur_mm)} × {cm(l.hauteur_mm)} cm</span>
                ) : l.hauteur_mm ? (
                  <span className="doc-detail">Longueur : {cm(l.hauteur_mm)} cm</span>
                ) : null}
                {l.finitions.map((f) => (
                  <span key={f.finition_id} className="doc-detail">
                    + {f.finition?.nom ?? 'Finition'}
                  </span>
                ))}
              </td>
              <td className="num">{nombre(l.quantite)}</td>
              <td className="num">{formaterMontant(l.prix_unitaire_ht, '')}</td>
              <td className="num">{formaterMontant(l.prix_total_ht, '')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-bas">
        <div className="doc-lettres">
          Arrêté le présent devis à la somme de :<br />
          <strong>
            {montantEnLettres(montantFinal, devise)} {avecTva ? 'TTC' : 'HT'}
          </strong>
          {!avecTva && <span className="doc-petit">TVA non applicable.</span>}
        </div>
        <table className="doc-totaux">
          <tbody>
            {totaux.remise > 0 && (
              <>
                <tr>
                  <th scope="row">Sous-total HT</th>
                  <td>{formaterMontant(totaux.brut, devise)}</td>
                </tr>
                <tr>
                  <th scope="row">Remise {nombre(devis.remise_pct)} %</th>
                  <td>− {formaterMontant(totaux.remise, devise)}</td>
                </tr>
              </>
            )}
            <tr className={avecTva ? '' : 'doc-total-final'}>
              <th scope="row">{avecTva ? 'Total HT' : 'Total à payer'}</th>
              <td>{formaterMontant(totaux.totalHt, devise)}</td>
            </tr>
            {avecTva && (
              <>
                <tr>
                  <th scope="row">TVA {nombre(devis.taux_tva)} %</th>
                  <td>{formaterMontant(totaux.totalTva, devise)}</td>
                </tr>
                <tr className="doc-total-final">
                  <th scope="row">Total TTC</th>
                  <td>{formaterMontant(totaux.totalTtc, devise)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {devis.notes && (
        <section className="doc-texte">
          <span className="doc-etiquette">Remarques</span>
          <Lignes texte={devis.notes} />
        </section>
      )}
      {p.mentions_devis && (
        <section className="doc-texte">
          <span className="doc-etiquette">Conditions</span>
          <Lignes texte={p.mentions_devis} />
        </section>
      )}
      {p.coordonnees_bancaires && (
        <section className="doc-texte">
          <span className="doc-etiquette">Règlement</span>
          <Lignes texte={p.coordonnees_bancaires} />
        </section>
      )}

      <section className="doc-signatures">
        <div>
          <span className="doc-etiquette">Pour {p.nom_imprimerie}</span>
        </div>
        <div>
          <span className="doc-etiquette">Bon pour accord — le client</span>
          <span className="doc-petit">Date, signature et cachet</span>
        </div>
      </section>
    </article>
  )
}
