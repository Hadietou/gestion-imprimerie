import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listerImpayes, type Impaye } from '../lib/factures'
import { formaterMontant } from '../lib/format'
import { useParametres } from '../parametres/ParametresContext'

// Factures émises non soldées (vue v_impayes), les plus en retard d'abord.

const dateCourte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR')

export default function Impayes() {
  const devise = useParametres().parametres?.devise ?? ''
  const [impayes, setImpayes] = useState<Impaye[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let actuel = true
    listerImpayes()
      .then((i) => actuel && setImpayes(i))
      .catch((e: Error) => actuel && setErreur(e.message))
      .finally(() => actuel && setChargement(false))
    return () => {
      actuel = false
    }
  }, [])

  const total = impayes.reduce((s, i) => s + Number(i.reste_a_payer), 0)
  const enRetard = impayes.filter((i) => i.jours_retard > 0)
  const totalRetard = enRetard.reduce((s, i) => s + Number(i.reste_a_payer), 0)

  return (
    <>
      <section className="carte resume-mois">
        <div className="resume-stock">
          <div>
            <span className="texte-doux petit">Total à encaisser</span>
            <strong className="total-mois">{formaterMontant(total, devise)}</strong>
          </div>
          <div>
            <span className="texte-doux petit">Dont échéance dépassée ({enRetard.length})</span>
            <strong className={`total-mois ${totalRetard > 0 ? 'texte-erreur' : ''}`}>{formaterMontant(totalRetard, devise)}</strong>
          </div>
        </div>
      </section>

      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="texte-doux">Chargement…</p>}
      {!chargement && !erreur && impayes.length === 0 && (
        <div className="vide">
          <p>Aucun impayé : toutes les factures sont réglées. 👍</p>
        </div>
      )}

      <ul className="liste-cartes">
        {impayes.map((i) => (
          <li key={i.id} className={`carte carte-ligne ${i.jours_retard > 0 ? 'carte-alerte' : ''}`}>
            <div className="carte-corps">
              <div className="carte-titre">
                <Link to={`/factures/${i.id}`}>
                  <strong>{i.numero}</strong>
                </Link>
                {i.jours_retard > 0 ? (
                  <span className="badge statut-refuse">
                    {i.jours_retard} jour{i.jours_retard > 1 ? 's' : ''} de retard
                  </span>
                ) : (
                  i.date_echeance && <span className="badge badge-statut">échéance le {dateCourte(i.date_echeance)}</span>
                )}
              </div>
              <div>{i.client}</div>
              <div className="texte-doux petit">
                Facture du {dateCourte(i.date_facture)} · {formaterMontant(Number(i.total_ttc), devise)}, déjà réglé{' '}
                {formaterMontant(Number(i.montant_paye), devise)}
              </div>
              {i.telephone && (
                <span className="coordonnees">
                  <a href={`tel:${i.telephone.split('/')[0].replace(/[^\d+]/g, '')}`}>📞 Appeler {i.telephone}</a>
                </span>
              )}
            </div>
            <strong className="montant-carte texte-erreur">{formaterMontant(Number(i.reste_a_payer), devise)}</strong>
          </li>
        ))}
      </ul>
    </>
  )
}
