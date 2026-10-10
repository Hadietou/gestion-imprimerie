import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Fenetre from '../components/Fenetre'
import Referentiel, { type ChampFiche } from '../components/Referentiel'
import {
  LIBELLES_MODES_PAIEMENT,
  enregistrerDepense,
  listerCategories,
  listerDepenses,
  supprimerDepense,
  type CategorieDepense,
  type Depense,
  type ModePaiement,
} from '../lib/depenses'
import { formaterMontant } from '../lib/format'
import { LIBELLES_CATEGORIES_SUPPORT, LIBELLES_UNITES, uniteAccordee } from '../lib/libelles'
import { categorieParDefaut, detecterCategorie, normaliser } from '../lib/detection'
import { supabase } from '../lib/supabase'
import type { CategorieSupport, Support } from '../lib/types'
import { useParametres } from '../parametres/ParametresContext'

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
const aujourdhui = () => new Date().toISOString().slice(0, 10)
const versNombre = (s: string) => Number(String(s).replace(',', '.').replace(/\s/g, ''))
const texte = (n: number) => String(n).replace('.', ',')

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

// ---------------------------------------------------------------- Fiche

interface LigneArticle {
  cle: string
  support_id: string
  quantite: string
  prix_unitaire: string
}

const ligneArticle = (): LigneArticle => ({ cle: Math.random().toString(36).slice(2), support_id: '', quantite: '', prix_unitaire: '' })

function FicheDepense({
  depense,
  modele,
  categories,
  devise,
  peutSupprimer,
  onFermer,
  onDupliquer,
  onEnregistre,
}: {
  depense: Depense | null
  modele: Depense | null
  categories: CategorieDepense[]
  devise: string
  peutSupprimer: boolean
  onFermer: () => void
  onDupliquer: (d: Depense) => void
  onEnregistre: (date: string, confirmation: string, entreeStock: boolean) => void
}) {
  const source = depense ?? modele
  const actives = categories.filter((c) => c.actif || c.id === source?.categorie_id)
  const [date, setDate] = useState(depense ? depense.date_depense : aujourdhui())
  const [categorieId, setCategorieId] = useState(String(source?.categorie_id ?? categorieParDefaut(categories)?.id ?? ''))
  // Nouvelle dépense : catégorie déduite du libellé ou de l'article choisi, tant qu'on ne la change pas à la main
  const [categorieAuto, setCategorieAuto] = useState(!source)
  const [suggestionsOuvertes, setSuggestionsOuvertes] = useState(false)
  const [libelle, setLibelle] = useState(source?.libelle ?? '')
  const [montant, setMontant] = useState(source ? texte(Number(source.montant)) : '')
  const [mode, setMode] = useState<ModePaiement>(source?.mode ?? 'especes')
  const [beneficiaire, setBeneficiaire] = useState(source?.beneficiaire ?? '')
  const [reference, setReference] = useState(depense?.reference ?? '')
  const [notes, setNotes] = useState(source?.notes ?? '')
  // Une ligne d'article d'office : un achat sans article n'entre pas en stock
  const [articles, setArticles] = useState<LigneArticle[]>(() => [ligneArticle()])
  const [supports, setSupports] = useState<Support[]>([])
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const categorie = categories.find((c) => String(c.id) === categorieId)
  const categorieAchat = categories.find((c) => c.actif && c.achat_stock)
  const articlesChoisis = articles.filter((a) => a.support_id).length
  // Articles saisis seulement à la création : article du stock reconnu, ou catégorie d'achat choisie
  const saisieArticles = !depense && (Boolean(categorie?.achat_stock) || articlesChoisis > 0)

  // Articles du stock : chargés pour les reconnaître dès la saisie du libellé
  useEffect(() => {
    if (depense) return
    let actuel = true
    supabase
      .from('supports')
      .select('*')
      .eq('actif', true)
      .order('nom')
      .then(({ data }) => actuel && setSupports((data ?? []) as Support[]))
    return () => {
      actuel = false
    }
  }, [depense])

  // Articles du stock qui correspondent au libellé saisi
  const termes = normaliser(libelle).split(/[^a-z0-9]+/).filter((t) => t.length >= 2)
  const suggestions =
    !depense && suggestionsOuvertes && termes.length > 0
      ? supports
          .filter((sp) => !articles.some((a) => a.support_id === String(sp.id)))
          .filter((sp) => {
            const nom = normaliser(`${sp.nom} ${LIBELLES_CATEGORIES_SUPPORT[sp.categorie]}`)
            return termes.every((t) => nom.includes(t))
          })
          .slice(0, 6)
      : []

  // Libellé qui désigne visiblement un article du stock, sans que la suggestion ait été choisie
  const articleProbable =
    !depense && articlesChoisis === 0 && termes.join('').length >= 5
      ? supports.find((sp) => termes.every((t) => normaliser(sp.nom).includes(t)))
      : undefined

  function changerLibelle(texteSaisi: string) {
    setLibelle(texteSaisi)
    setSuggestionsOuvertes(true)
    if (categorieAuto && articlesChoisis === 0) {
      const detectee = detecterCategorie(texteSaisi, categories) ?? categorieParDefaut(categories)
      if (detectee) setCategorieId(String(detectee.id))
    }
  }

  // Article du stock reconnu : la dépense devient un achat avec quantité et prix
  function choisirArticle(sp: Support) {
    setArticles((ls) => {
      const prix = sp.prix_unitaire > 0 ? texte(sp.prix_unitaire) : ''
      const vide = ls.findIndex((a) => !a.support_id && !a.quantite && !a.prix_unitaire)
      const ligne = { ...ligneArticle(), support_id: String(sp.id), prix_unitaire: prix }
      return vide >= 0 ? ls.map((a, i) => (i === vide ? ligne : a)) : [...ls, ligne]
    })
    if (categorieAuto && categorieAchat) setCategorieId(String(categorieAchat.id))
    if (articlesChoisis === 0) setLibelle(`Achat ${sp.nom}`)
    setSuggestionsOuvertes(false)
  }

  const articlesRemplis = articles.filter((a) => a.support_id || a.quantite || a.prix_unitaire)
  const totalArticles = articlesRemplis.reduce((s, a) => s + (versNombre(a.quantite) || 0) * (versNombre(a.prix_unitaire) || 0), 0)
  const montantCalcule = saisieArticles && articlesRemplis.length > 0

  async function valider(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    const m = montantCalcule ? Math.round(totalArticles * 100) / 100 : versNombre(montant)
    if (!categorieId) return setErreur('Choisissez une catégorie.')
    if (!libelle.trim()) return setErreur('Le libellé est obligatoire.')
    for (const a of articlesRemplis) {
      if (!a.support_id) return setErreur('Choisissez l’article de chaque ligne.')
      if (!(versNombre(a.quantite) > 0)) return setErreur('Chaque article doit avoir une quantité supérieure à 0.')
      if (!(versNombre(a.prix_unitaire) >= 0)) return setErreur('Prix unitaire invalide.')
    }
    if (
      articleProbable &&
      confirm(
        `« ${libelle.trim()} » correspond à l’article du stock « ${articleProbable.nom} ».\n\nOK : saisir la quantité achetée pour l’entrer en stock.\nAnnuler : enregistrer comme dépense simple.`,
      )
    ) {
      choisirArticle(articleProbable)
      return
    }
    if (!(m > 0)) return setErreur('Le montant doit être supérieur à 0.')
    if (
      saisieArticles &&
      articlesRemplis.length === 0 &&
      !confirm('Aucun article n’est indiqué : cet achat n’entrera PAS en stock. Enregistrer quand même ?')
    ) {
      return
    }

    setEnvoi(true)
    try {
      await enregistrerDepense(
        {
          id: depense?.id ?? null,
          date_depense: date,
          categorie_id: Number(categorieId),
          libelle: libelle.trim(),
          montant: m,
          mode,
          beneficiaire,
          reference,
          notes,
        },
        saisieArticles
          ? articlesRemplis.map((a) => ({
              support_id: Number(a.support_id),
              quantite: versNombre(a.quantite),
              prix_unitaire: versNombre(a.prix_unitaire) || 0,
            }))
          : [],
      )
      const n = saisieArticles ? articlesRemplis.length : 0
      onEnregistre(
        date,
        n > 0
          ? `Dépense enregistrée — ${n} article${n > 1 ? 's' : ''} entré${n > 1 ? 's' : ''} en stock.`
          : depense
            ? 'Dépense modifiée.'
            : 'Dépense enregistrée.',
        n > 0,
      )
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  async function supprimer() {
    if (!depense || !confirm(`Supprimer la dépense « ${depense.libelle} » ?`)) return
    setEnvoi(true)
    try {
      await supprimerDepense(depense.id)
      onEnregistre(depense.date_depense, 'Dépense supprimée.', false)
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  const groupesSupports = (Object.keys(LIBELLES_CATEGORIES_SUPPORT) as CategorieSupport[])
    .map((cat) => ({ cat, liste: supports.filter((s) => s.categorie === cat) }))
    .filter((g) => g.liste.length > 0)

  return (
    <Fenetre titre={depense ? depense.libelle : modele ? 'Nouvelle dépense (copie)' : 'Nouvelle dépense'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider} noValidate>
        <div className="grille-champs">
          <div className="champ-large champ-personnalise champ-libelle">
            <label htmlFor="dep-libelle" className="libelle-champ">
              Qu’avez-vous payé ?<span className="obligatoire" aria-hidden="true"> *</span>
            </label>
            <input
              id="dep-libelle"
              autoComplete="off"
              placeholder="Ex. Couché brillant 135 g, Facture SOMELEC, Salaire, Ordinateur…"
              value={libelle}
              onChange={(e) => changerLibelle(e.target.value)}
              aria-describedby="dep-libelle-aide"
            />
            {suggestions.length > 0 && (
              <ul className="resultats-client suggestions-stock" aria-label="Articles du stock correspondants">
                {suggestions.map((sp) => (
                  <li key={sp.id}>
                    <button type="button" onClick={() => choisirArticle(sp)}>
                      <strong>📦 {sp.nom}</strong>
                      <span className="texte-doux petit">
                        Article du stock · {Number(sp.stock_actuel).toLocaleString('fr-FR')} {uniteAccordee(sp.unite, sp.stock_actuel)} en
                        stock — cliquez pour saisir la quantité achetée
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!depense && (
              <small id="dep-libelle-aide" className="texte-doux">
                Un article du stock (papier, encre, bâche…) est reconnu pendant la saisie ; sinon c’est une dépense simple.
              </small>
            )}
          </div>
          <label htmlFor="dep-categorie">
            <span>Catégorie</span>
            <select
              id="dep-categorie"
              value={categorieId}
              onChange={(e) => {
                setCategorieId(e.target.value)
                setCategorieAuto(false)
              }}
              disabled={Boolean(depense?.entrees.length)}
            >
              {actives.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
            {categorieAuto && libelle.trim() && <small className="texte-doux">Détectée automatiquement — modifiable.</small>}
          </label>
          <label htmlFor="dep-date">
            <span>Date</span>
            <input id="dep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          {saisieArticles && (
            <div className="champ-large champ-personnalise encadre-stock">
              <span className="libelle-champ">📦 Articles achetés — ils entreront en stock</span>
              <small className="texte-doux">
                Indiquez chaque article reçu, sa quantité et son prix : le montant de la dépense se calcule tout seul.
              </small>
              <div className="articles-achat">
                {articles.map((a, i) => {
                  const support = supports.find((s) => String(s.id) === a.support_id)
                  const unite = support ? LIBELLES_UNITES[support.unite] : ''
                  const modifier = (champ: keyof LigneArticle, v: string) => {
                    setArticles((ls) =>
                      ls.map((x, j) => {
                        if (j !== i) return x
                        const nouveau = { ...x, [champ]: v }
                        // Prix proposé : dernier prix d'achat connu de l'article
                        if (champ === 'support_id' && !x.prix_unitaire) {
                          const s = supports.find((y) => String(y.id) === v)
                          if (s && s.prix_unitaire > 0) nouveau.prix_unitaire = texte(s.prix_unitaire)
                        }
                        return nouveau
                      }),
                    )
                  }
                  return (
                    <div key={a.cle} className="article-achat">
                      <select aria-label={`Article ${i + 1}`} value={a.support_id} onChange={(e) => modifier('support_id', e.target.value)}>
                        <option value="">Choisir l’article…</option>
                        {groupesSupports.map((g) => (
                          <optgroup key={g.cat} label={LIBELLES_CATEGORIES_SUPPORT[g.cat]}>
                            {g.liste.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nom}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <span className="champ-suffixe">
                        <input aria-label={`Article ${i + 1} : quantité`} inputMode="decimal" placeholder="Qté" value={a.quantite} onChange={(e) => modifier('quantite', e.target.value)} />
                        <span>{unite}</span>
                      </span>
                      <span className="champ-suffixe">
                        <input aria-label={`Article ${i + 1} : prix unitaire`} inputMode="decimal" placeholder="Prix unit." value={a.prix_unitaire} onChange={(e) => modifier('prix_unitaire', e.target.value)} />
                        <span>{devise}</span>
                      </span>
                      <button type="button" className="bouton-fermer" aria-label={`Retirer l’article ${i + 1}`} onClick={() => setArticles((ls) => ls.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </div>
                  )
                })}
                <button type="button" className="bouton bouton-discret" onClick={() => setArticles((ls) => [...ls, ligneArticle()])}>
                  + Ajouter un autre article
                </button>
              </div>
              <small className="texte-doux">
                Les quantités entrent en stock à l’enregistrement (définitif) ; le prix devient le dernier prix d’achat de l’article.
              </small>
            </div>
          )}

          {depense && depense.entrees.length > 0 && (
            <div className="champ-large champ-personnalise">
              <span className="libelle-champ">Entré en stock</span>
              <ul className="entrees-stock">
                {depense.entrees.map((e) => (
                  <li key={e.id}>
                    {e.support?.nom} : + {Number(e.quantite).toLocaleString('fr-FR')} {e.support ? LIBELLES_UNITES[e.support.unite] : ''}
                  </li>
                ))}
              </ul>
              <small className="texte-doux">Une correction de quantité se fera par un ajustement dans le module Stock.</small>
            </div>
          )}

          <label htmlFor="dep-montant">
            <span>
              Montant<span className="obligatoire" aria-hidden="true"> *</span>
            </span>
            {montantCalcule ? (
              <strong className="montant-calcule">{formaterMontant(totalArticles, devise)}</strong>
            ) : (
              <span className="champ-suffixe">
                <input id="dep-montant" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} />
                <span>{devise}</span>
              </span>
            )}
          </label>
          <label htmlFor="dep-mode">
            <span>Payé par</span>
            <select id="dep-mode" value={mode} onChange={(e) => setMode(e.target.value as ModePaiement)}>
              {(Object.keys(LIBELLES_MODES_PAIEMENT) as ModePaiement[]).map((m) => (
                <option key={m} value={m}>
                  {LIBELLES_MODES_PAIEMENT[m]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="dep-beneficiaire">
            <span>Bénéficiaire / fournisseur</span>
            <input id="dep-beneficiaire" value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)} />
          </label>
          <label htmlFor="dep-reference">
            <span>Référence (n° de facture, reçu…)</span>
            <input id="dep-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <label className="champ-large" htmlFor="dep-notes">
            <span>Notes</span>
            <textarea id="dep-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}

        <div className="actions-formulaire">
          {depense && peutSupprimer && depense.entrees.length === 0 && (
            <button type="button" className="bouton bouton-danger" onClick={supprimer} disabled={envoi}>
              Supprimer
            </button>
          )}
          {depense && depense.entrees.length === 0 && (
            <button type="button" className="bouton" onClick={() => onDupliquer(depense)} disabled={envoi}>
              Dupliquer
            </button>
          )}
          <span className="espace" />
          <button type="button" className="bouton" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className="bouton bouton-principal" disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Fenetre>
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
