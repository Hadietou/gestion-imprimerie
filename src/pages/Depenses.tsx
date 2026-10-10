import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Referentiel, { type ChampFiche } from '../components/Referentiel'
import {
  LIBELLES_MODES_PAIEMENT,
  listerCategories,
  listerDepenses,
  type CategorieDepense,
  type Depense,
} from '../lib/depenses'
import { formaterMontant } from '../lib/format'
import { useParametres } from '../parametres/ParametresContext'
import FicheDepense from './FicheDepense'

// Dépenses de fonctionnement (gérant, compta). Les achats de fournitures
// font entrer les articles en stock. Liens internes en chemins absolus.

export default function Depenses() {
  const { profil } = useAuth()
  return (
    <Routes>
      <Route index element={<ListeDepenses />} />
      <Route
        path="categories"
        element={profil?.role === 'gerant' ? <Categories /> : <Navigate to="/depenses" replace />}
      />
      <Route path="*" element={<Navigate to="/depenses" replace />} />
    </Routes>
  )
}

const moisCourant = () => new Date().toISOString().slice(0, 7)

function decalerMois(mois: string, delta: number): string {
  const [a, m] = mois.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

const nomMois = (mois: string) =>
  new Date(`${mois}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

// ---------------------------------------------------------------- Liste du mois

function ListeDepenses() {
  const { profil } = useAuth()
  const devise = useParametres().parametres?.devise ?? ''
  const [mois, setMois] = useState(moisCourant)
  const [categories, setCategories] = useState<CategorieDepense[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [filtre, setFiltre] = useState<number | null>(null)
  // undefined = fermée ; null = nouvelle ; Depense = modification ; { modele } = duplication
  const [fiche, setFiche] = useState<Depense | null | { modele: Depense } | undefined>(undefined)
  const [version, setVersion] = useState(0)
  const [confirmation, setConfirmation] = useState<{ texte: string; stock: boolean } | null>(null)

  useEffect(() => {
    let actuel = true
    Promise.all([listerCategories(), listerDepenses(mois)])
      .then(([c, d]) => {
        if (!actuel) return
        setCategories(c)
        setDepenses(d)
        setErreur(null)
      })
      .catch((e: Error) => actuel && setErreur(e.message))
      .finally(() => actuel && setChargement(false))
    return () => {
      actuel = false
    }
  }, [mois, version])

  const total = depenses.reduce((s, d) => s + Number(d.montant), 0)
  const parCategorie = new Map<number, number>()
  for (const d of depenses) parCategorie.set(d.categorie_id, (parCategorie.get(d.categorie_id) ?? 0) + Number(d.montant))
  const visibles = filtre === null ? depenses : depenses.filter((d) => d.categorie_id === filtre)

  return (
    <>
      <div className="barre-actions">
        <div className="navigation-mois">
          <button type="button" className="bouton" onClick={() => setMois((m) => decalerMois(m, -1))} aria-label="Mois précédent">
            ‹
          </button>
          <strong className="nom-mois">{nomMois(mois)}</strong>
          <button type="button" className="bouton" onClick={() => setMois((m) => decalerMois(m, 1))} aria-label="Mois suivant">
            ›
          </button>
        </div>
        {profil?.role === 'gerant' && (
          <Link to="/depenses/categories" className="bouton bouton-discret">
            Catégories…
          </Link>
        )}
        <button
          type="button"
          className="bouton bouton-principal"
          onClick={() => {
            setConfirmation(null)
            setFiche(null)
          }}
        >
          + Nouvelle dépense
        </button>
      </div>

      <section className="carte resume-mois">
        <div>
          <span className="texte-doux petit">Total des dépenses du mois</span>
          <strong className="total-mois">{formaterMontant(total, devise)}</strong>
        </div>
        {parCategorie.size > 0 && (
          <div className="pastilles filtres" role="group" aria-label="Filtrer par catégorie">
            <button type="button" className={`pastille ${filtre === null ? 'selectionne' : ''}`} aria-pressed={filtre === null} onClick={() => setFiltre(null)}>
              Toutes ({depenses.length})
            </button>
            {categories
              .filter((c) => parCategorie.has(c.id))
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`pastille ${filtre === c.id ? 'selectionne' : ''}`}
                  aria-pressed={filtre === c.id}
                  onClick={() => setFiltre(filtre === c.id ? null : c.id)}
                >
                  {c.nom} · {formaterMontant(parCategorie.get(c.id)!, devise)}
                </button>
              ))}
          </div>
        )}
      </section>

      {confirmation && (
        <p className="alerte alerte-succes" role="status">
          {confirmation.texte}
          {confirmation.stock && (
            <>
              {' '}
              <Link to="/stock">Voir le stock →</Link>
            </>
          )}
        </p>
      )}
      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="texte-doux">Chargement…</p>}
      {!chargement && !erreur && visibles.length === 0 && (
        <div className="vide">
          <p>Aucune dépense en {nomMois(mois)}.</p>
        </div>
      )}

      <ul className="liste-cartes">
        {visibles.map((d) => (
          <li key={d.id} className="carte carte-ligne">
            <div className="carte-corps">
              <div className="carte-titre">
                <strong>{d.libelle}</strong>
                {d.entrees.length > 0 && <span className="badge statut-accepte">📦 entré en stock</span>}
              </div>
              <div className="texte-doux petit">
                {[
                  new Date(`${d.date_depense}T12:00:00`).toLocaleDateString('fr-FR'),
                  d.categorie?.nom,
                  d.beneficiaire,
                  LIBELLES_MODES_PAIEMENT[d.mode],
                  d.reference && `réf. ${d.reference}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <strong className="montant-carte">{formaterMontant(Number(d.montant), devise)}</strong>
            <button type="button" className="bouton" onClick={() => setFiche(d)}>
              Ouvrir
            </button>
          </li>
        ))}
      </ul>

      {fiche !== undefined && (
        <FicheDepense
          // Nouvelle instance à chaque ouverture (sinon la copie garderait la date et la référence)
          key={fiche && 'id' in fiche ? `depense-${fiche.id}` : fiche ? `copie-${fiche.modele.id}` : 'nouvelle'}
          depense={fiche && 'id' in fiche ? fiche : null}
          modele={fiche && 'modele' in fiche ? fiche.modele : null}
          categories={categories}
          devise={devise}
          peutSupprimer={profil?.role === 'gerant'}
          onFermer={() => setFiche(undefined)}
          onDupliquer={(d) => setFiche({ modele: d })}
          onEnregistre={(date, texte, stock) => {
            setConfirmation({ texte, stock })
            setFiche(undefined)
            setMois(date.slice(0, 7))
            setVersion((v) => v + 1)
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------- Catégories (gérant)

const champsCategorie: ChampFiche[] = [
  { cle: 'nom', libelle: 'Nom de la catégorie', type: 'texte', obligatoire: true, large: true },
  { cle: 'ordre', libelle: 'Ordre d’affichage', aide: 'Les plus petits nombres apparaissent en premier.', type: 'entier', min: 0 },
  { cle: 'achat_stock', libelle: 'Achat de fournitures : les articles achetés entrent en stock', type: 'booleen' },
  { cle: 'actif', libelle: 'Catégorie proposée à la saisie', type: 'booleen' },
]

function Categories() {
  return (
    <>
      <p>
        <Link to="/depenses" className="bouton bouton-discret">
          ← Retour aux dépenses
        </Link>
      </p>
      <Referentiel<CategorieDepense>
        table="categories_depense"
        libelleNouveau="Nouvelle catégorie"
        champs={champsCategorie}
        defauts={{ ordre: '50', achat_stock: false, actif: true }}
        messageVide="Aucune catégorie : exécutez sql/07_depenses.sql dans Supabase."
        resume={(c) => [c.achat_stock && '📦 entrée en stock', `ordre ${c.ordre}`].filter(Boolean).join(' · ')}
      />
    </>
  )
}
