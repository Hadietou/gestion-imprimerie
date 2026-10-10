import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LIBELLES_STATUTS_FACTURE, listerFactures, resteAPayer, type FactureResume } from '../../lib/factures'
import { formaterMontant } from '../../lib/format'
import { useParametres } from '../../parametres/ParametresContext'

const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

type Filtre = 'a_payer' | 'payee' | 'annulee' | 'toutes'
const LIBELLES_FILTRES: Record<Filtre, string> = { a_payer: 'À encaisser', payee: 'Payées', annulee: 'Annulées', toutes: 'Toutes' }
const dansFiltre = (f: FactureResume, filtre: Filtre) =>
  filtre === 'toutes' ||
  (filtre === 'a_payer' ? f.statut === 'emise' || f.statut === 'partiellement_payee' || f.statut === 'brouillon' : f.statut === filtre)

export default function ListeFactures() {
  const devise = useParametres().parametres?.devise ?? ''
  const [factures, setFactures] = useState<FactureResume[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('a_payer')

  useEffect(() => {
    let actuel = true
    listerFactures()
      .then((f) => actuel && setFactures(f))
      .catch((e: Error) => actuel && setErreur(e.message))
      .finally(() => actuel && setChargement(false))
    return () => {
      actuel = false
    }
  }, [])

  const termes = normaliser(recherche).split(/\s+/).filter(Boolean)
  const visibles = factures
    .filter((f) => dansFiltre(f, filtre))
    .filter((f) => termes.every((t) => normaliser(`${f.numero} ${f.client?.nom ?? ''}`).includes(t)))
  const totalAEncaisser = factures.filter((f) => dansFiltre(f, 'a_payer')).reduce((s, f) => s + resteAPayer(f), 0)

  return (
    <>
      <div className="barre-actions">
        <input
          type="search"
          className="champ-recherche"
          placeholder="Rechercher : n°, client…"
          aria-label="Rechercher une facture"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <span />
        <Link to="/commandes" className="bouton bouton-discret" title="Une facture se crée depuis une commande">
          Facturer une commande…
        </Link>
      </div>

      <section className="carte resume-mois">
        <div>
          <span className="texte-doux petit">Reste à encaisser (toutes factures)</span>
          <strong className="total-mois">{formaterMontant(totalAEncaisser, devise)}</strong>
        </div>
        <div className="pastilles filtres" role="group" aria-label="Filtrer les factures">
          {(Object.keys(LIBELLES_FILTRES) as Filtre[]).map((fi) => (
            <button key={fi} type="button" className={`pastille ${filtre === fi ? 'selectionne' : ''}`} aria-pressed={filtre === fi} onClick={() => setFiltre(fi)}>
              {LIBELLES_FILTRES[fi]} ({factures.filter((f) => dansFiltre(f, fi)).length})
            </button>
          ))}
        </div>
      </section>

      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="texte-doux">Chargement…</p>}
      {!chargement && !erreur && visibles.length === 0 && (
        <div className="vide">
          <p>
            {factures.length === 0
              ? 'Aucune facture. Une facture se crée depuis une commande (bouton « Créer la facture »).'
              : 'Aucune facture ne correspond.'}
          </p>
        </div>
      )}

      <ul className="liste-cartes">
        {visibles.map((f) => {
          const reste = resteAPayer(f)
          return (
            <li key={f.id}>
              <Link to={`/factures/${f.id}`} className="carte carte-devis">
                <div className="carte-corps">
                  <div className="carte-titre">
                    <strong>{f.numero}</strong>
                    <span className={`badge badge-statut fac-${f.statut}`}>{LIBELLES_STATUTS_FACTURE[f.statut]}</span>
                  </div>
                  <div>{f.client?.nom}</div>
                  <div className="texte-doux petit">
                    {new Date(`${f.date_facture}T12:00:00`).toLocaleDateString('fr-FR')}
                    {reste > 0 && f.statut !== 'annulee' && ` · reste ${formaterMontant(reste, devise)}`}
                  </div>
                </div>
                <div className="montant-carte">
                  <strong>{formaterMontant(Number(f.total_ttc), devise)}</strong>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
