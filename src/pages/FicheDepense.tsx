import { useEffect, useState, type FormEvent } from 'react'
import Fenetre from '../components/Fenetre'
import {
  LIBELLES_MODES_PAIEMENT,
  enregistrerDepense,
  listerLibellesParCategorie,
  supprimerDepense,
  type CategorieDepense,
  type Depense,
  type ModePaiement,
} from '../lib/depenses'
import { formaterMontant } from '../lib/format'
import { LIBELLES_CATEGORIES_SUPPORT, LIBELLES_UNITES } from '../lib/libelles'
import { supabase } from '../lib/supabase'
import type { CategorieSupport, Support } from '../lib/types'

// Saisie d'une dépense : 1) la catégorie, 2) l'article dans la liste de cette catégorie.
//  - Catégorie « achat pour le stock » (Papier, Encre…) : articles du stock de cette catégorie,
//    avec quantité et prix ; l'achat entre en stock à l'enregistrement.
//  - Catégorie de frais (Électricité, Salaires…) : articles déjà saisis pour cette catégorie, ou texte libre.

interface LigneArticle {
  cle: string
  support_id: string
  quantite: string
  prix_unitaire: string
}

const ligneArticle = (): LigneArticle => ({ cle: Math.random().toString(36).slice(2), support_id: '', quantite: '', prix_unitaire: '' })
const aujourdhui = () => new Date().toISOString().slice(0, 10)
const versNombre = (s: string) => Number(String(s).replace(',', '.').replace(/\s/g, ''))
const texte = (n: number) => String(n).replace('.', ',')

const EXEMPLES: [string, string][] = [
  ['salaire', 'Ex. Salaire Ahmed — octobre'],
  ['loyer', 'Ex. Loyer du local — octobre'],
  ['electric', 'Ex. Facture SOMELEC'],
  ['eau', 'Ex. Facture SNDE'],
  ['internet', 'Ex. Abonnement internet Mauritel'],
  ['carburant', 'Ex. Gasoil groupe électrogène'],
  ['entretien', 'Ex. Réparation du massicot'],
  ['impot', 'Ex. Patente 2026'],
]
const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export default function FicheDepense({
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
  const categorieAchat = categories.find((c) => c.actif && c.achat_stock)
  const frais = categories.filter((c) => !c.achat_stock && (c.actif || c.id === source?.categorie_id))

  // Choix du champ 1 : « stock:papier » (achat pour le stock) ou « cat:12 » (catégorie de frais)
  const [choix, setChoix] = useState(source ? `cat:${source.categorie_id}` : '')
  const [objet, setObjet] = useState(source?.libelle ?? '')
  const [date, setDate] = useState(depense ? depense.date_depense : aujourdhui())
  const [montant, setMontant] = useState(source ? texte(Number(source.montant)) : '')
  const [mode, setMode] = useState<ModePaiement>(source?.mode ?? 'especes')
  const [beneficiaire, setBeneficiaire] = useState(source?.beneficiaire ?? '')
  const [reference, setReference] = useState(depense?.reference ?? '')
  const [notes, setNotes] = useState(source?.notes ?? '')
  const [articles, setArticles] = useState<LigneArticle[]>(() => [ligneArticle()])
  const [supports, setSupports] = useState<Support[]>([])
  const [historique, setHistorique] = useState<Map<number, string[]>>(new Map())
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Articles du stock et articles déjà saisis : seulement pour une nouvelle dépense
  useEffect(() => {
    if (depense) return
    let actuel = true
    supabase
      .from('supports')
      .select('*')
      .eq('actif', true)
      .order('nom')
      .then(({ data }) => actuel && setSupports((data ?? []) as Support[]))
    listerLibellesParCategorie()
      .then((h) => actuel && setHistorique(h))
      .catch(() => {})
    return () => {
      actuel = false
    }
  }, [depense])

  const categorieSupport = choix.startsWith('stock:') ? (choix.slice(6) as CategorieSupport) : null
  const categorieFrais = choix.startsWith('cat:') ? categories.find((c) => String(c.id) === choix.slice(4)) : undefined
  // Achat pour le stock : catégorie de stock choisie, ou (copie d'une dépense) la catégorie d'achat elle-même
  const achat = !depense && (categorieSupport !== null || Boolean(categorieFrais?.achat_stock))
  const categorieId = categorieSupport ? categorieAchat?.id : categorieFrais?.id

  const categoriesStockPresentes = (Object.keys(LIBELLES_CATEGORIES_SUPPORT) as CategorieSupport[]).filter(
    (cat) => supports.length === 0 || supports.some((s) => s.categorie === cat),
  )
  const supportsDuChoix = categorieSupport ? supports.filter((s) => s.categorie === categorieSupport) : supports

  const articlesRemplis = articles.filter((a) => a.support_id || a.quantite || a.prix_unitaire)
  const totalArticles = articlesRemplis.reduce((s, a) => s + (versNombre(a.quantite) || 0) * (versNombre(a.prix_unitaire) || 0), 0)
  const nomArticle = (id: string) => supports.find((s) => String(s.id) === id)?.nom ?? ''

  function choisirCategorie(valeur: string) {
    setChoix(valeur)
    setErreur(null)
    // Nouvelle catégorie de stock : on repart d'une ligne vide
    if (valeur.startsWith('stock:')) setArticles([ligneArticle()])
  }

  function modifierArticle(i: number, champ: keyof LigneArticle, v: string) {
    setArticles((ls) =>
      ls.map((x, j) => {
        if (j !== i) return x
        const nouveau = { ...x, [champ]: v }
        // Prix proposé : dernier prix d'achat connu de l'article
        if (champ === 'support_id') {
          const s = supports.find((y) => String(y.id) === v)
          nouveau.prix_unitaire = s && s.prix_unitaire > 0 ? texte(s.prix_unitaire) : ''
        }
        return nouveau
      }),
    )
  }

  async function valider(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (!categorieId) return setErreur('Choisissez la catégorie.')
    if (achat) {
      if (!articlesRemplis.some((a) => a.support_id)) return setErreur('Choisissez l’article acheté.')
      for (const a of articlesRemplis) {
        if (!a.support_id) return setErreur('Choisissez l’article de chaque ligne.')
        if (!(versNombre(a.quantite) > 0)) return setErreur(`Indiquez la quantité achetée de « ${nomArticle(a.support_id)} ».`)
        if (!(versNombre(a.prix_unitaire) >= 0)) return setErreur('Prix unitaire invalide.')
      }
    } else if (!objet.trim()) {
      return setErreur('Indiquez l’article ou l’objet de la dépense.')
    }
    const m = achat ? Math.round(totalArticles * 100) / 100 : versNombre(montant)
    if (!(m > 0)) return setErreur(achat ? 'Indiquez le prix des articles.' : 'Le montant doit être supérieur à 0.')

    // Libellé d'un achat : construit à partir des articles choisis
    const noms = articlesRemplis.map((a) => nomArticle(a.support_id))
    const libelle = achat ? `Achat ${noms[0]}${noms.length > 1 ? ` + ${noms.length - 1} autre${noms.length > 2 ? 's' : ''}` : ''}` : objet.trim()

    setEnvoi(true)
    try {
      await enregistrerDepense(
        { id: depense?.id ?? null, date_depense: date, categorie_id: categorieId, libelle, montant: m, mode, beneficiaire, reference, notes },
        achat
          ? articlesRemplis.map((a) => ({
              support_id: Number(a.support_id),
              quantite: versNombre(a.quantite),
              prix_unitaire: versNombre(a.prix_unitaire) || 0,
            }))
          : [],
      )
      const n = achat ? articlesRemplis.length : 0
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

  const listeFrais = categorieFrais ? (historique.get(categorieFrais.id) ?? []) : []
  const exemple =
    EXEMPLES.find(([cle]) => categorieFrais && sansAccents(categorieFrais.nom).includes(cle))?.[1] ?? 'Ex. Ordinateur portable, fournitures de bureau…'

  // Ligne d'article : liste limitée à la catégorie choisie pour la 1re ligne, toutes catégories ensuite
  const selectArticle = (a: LigneArticle, i: number, liste: Support[]) => (
    <select aria-label={`Article ${i + 1}`} value={a.support_id} onChange={(e) => modifierArticle(i, 'support_id', e.target.value)}>
      <option value="">Choisir l’article…</option>
      {(Object.keys(LIBELLES_CATEGORIES_SUPPORT) as CategorieSupport[]).map((cat) => {
        const groupe = liste.filter((s) => s.categorie === cat)
        return (
          groupe.length > 0 && (
            <optgroup key={cat} label={LIBELLES_CATEGORIES_SUPPORT[cat]}>
              {groupe.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </optgroup>
          )
        )
      })}
    </select>
  )

  return (
    <Fenetre titre={depense ? depense.libelle : modele ? 'Nouvelle dépense (copie)' : 'Nouvelle dépense'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider} noValidate>
        <div className="grille-champs">
          {/* 1. Catégorie */}
          <label className="champ-large" htmlFor="dep-categorie">
            <span>
              1. Catégorie<span className="obligatoire" aria-hidden="true"> *</span>
            </span>
            <select id="dep-categorie" value={choix} onChange={(e) => choisirCategorie(e.target.value)} disabled={Boolean(depense)}>
              <option value="">Choisir la catégorie…</option>
              {!depense && categorieAchat && (
                <optgroup label="📦 Achats pour le stock">
                  {categoriesStockPresentes.map((cat) => (
                    <option key={cat} value={`stock:${cat}`}>
                      {LIBELLES_CATEGORIES_SUPPORT[cat]}
                    </option>
                  ))}
                </optgroup>
              )}
              {depense?.categorie?.achat_stock && <option value={`cat:${depense.categorie_id}`}>{depense.categorie.nom}</option>}
              <optgroup label="Frais de fonctionnement">
                {frais.map((c) => (
                  <option key={c.id} value={`cat:${c.id}`}>
                    {c.nom}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {/* 2a. Achat pour le stock : article de la catégorie, quantité, prix */}
          {achat && (
            <div className="champ-large champ-personnalise encadre-stock">
              <span className="libelle-champ">
                2. Article{categorieSupport ? ` — ${LIBELLES_CATEGORIES_SUPPORT[categorieSupport]}` : ''} · entrera en stock
              </span>
              <div className="articles-achat">
                {articles.map((a, i) => {
                  const support = supports.find((s) => String(s.id) === a.support_id)
                  return (
                    <div key={a.cle} className="article-achat">
                      {selectArticle(a, i, i === 0 ? supportsDuChoix : supports)}
                      <span className="champ-suffixe">
                        <input aria-label={`Article ${i + 1} : quantité`} inputMode="decimal" placeholder="Qté" value={a.quantite} onChange={(e) => modifierArticle(i, 'quantite', e.target.value)} />
                        <span>{support ? LIBELLES_UNITES[support.unite] : ''}</span>
                      </span>
                      <span className="champ-suffixe">
                        <input aria-label={`Article ${i + 1} : prix unitaire`} inputMode="decimal" placeholder="Prix unit." value={a.prix_unitaire} onChange={(e) => modifierArticle(i, 'prix_unitaire', e.target.value)} />
                        <span>{devise}</span>
                      </span>
                      {i > 0 ? (
                        <button type="button" className="bouton-fermer" aria-label={`Retirer l’article ${i + 1}`} onClick={() => setArticles((ls) => ls.filter((_, j) => j !== i))}>
                          ✕
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  )
                })}
                {supportsDuChoix.length === 0 && supports.length > 0 && (
                  <small className="texte-erreur">Aucun article dans cette catégorie : le gérant les ajoute dans Tarifs & catalogue.</small>
                )}
                <button type="button" className="bouton bouton-discret" onClick={() => setArticles((ls) => [...ls, ligneArticle()])}>
                  + Autre article sur la même facture
                </button>
              </div>
              <small className="texte-doux">Le prix proposé est le dernier prix d’achat ; il est mis à jour avec celui-ci.</small>
            </div>
          )}

          {/* 2b. Frais : article déjà saisi pour cette catégorie, ou texte libre */}
          {!achat && choix && (
            <label className="champ-large" htmlFor="dep-objet">
              <span>
                2. Article / objet<span className="obligatoire" aria-hidden="true"> *</span>
              </span>
              <input id="dep-objet" list="dep-objets-connus" autoComplete="off" placeholder={exemple} value={objet} onChange={(e) => setObjet(e.target.value)} />
              <datalist id="dep-objets-connus">
                {listeFrais.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
              {listeFrais.length > 0 && !depense && (
                <small className="texte-doux">Choisissez dans la liste (déjà saisis) ou écrivez un nouvel article.</small>
              )}
            </label>
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
              <small className="texte-doux">Une correction de quantité se fait par un inventaire dans le module Stock.</small>
            </div>
          )}

          {choix && (
            <>
              <label htmlFor="dep-montant">
                <span>
                  Montant<span className="obligatoire" aria-hidden="true"> *</span>
                </span>
                {achat ? (
                  <strong className="montant-calcule">{formaterMontant(totalArticles, devise)}</strong>
                ) : (
                  <span className="champ-suffixe">
                    <input id="dep-montant" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} />
                    <span>{devise}</span>
                  </span>
                )}
              </label>
              <label htmlFor="dep-date">
                <span>Date</span>
                <input id="dep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                <span>{achat ? 'Fournisseur' : 'Bénéficiaire / fournisseur'}</span>
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
            </>
          )}
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
          <button type="submit" className="bouton bouton-principal" disabled={envoi || !choix}>
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Fenetre>
  )
}
