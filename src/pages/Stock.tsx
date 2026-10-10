import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Fenetre from '../components/Fenetre'
import { formaterMontant } from '../lib/format'
import { LIBELLES_CATEGORIES_SUPPORT, LIBELLES_UNITES, uniteAccordee } from '../lib/libelles'
import {
  LIBELLES_MOUVEMENTS,
  chargerArticle,
  enAlerte,
  enregistrerMouvement,
  listerArticles,
  variation,
  type Mouvement,
  type TypeMouvement,
} from '../lib/stock'
import type { CategorieSupport, Support } from '../lib/types'
import { useParametres } from '../parametres/ParametresContext'

// Module Stock : quantités, alertes, historique, sorties, entrées, inventaire.
// Liens internes en chemins absolus (/stock/…).

export default function Stock() {
  return (
    <Routes>
      <Route index element={<ListeStock />} />
      <Route path=":id" element={<FicheArticle />} />
      <Route path="*" element={<Navigate to="/stock" replace />} />
    </Routes>
  )
}

const nombre = (n: number) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const versNombre = (s: string) => Number(String(s).replace(',', '.').replace(/\s/g, ''))
const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const ORDRE_CATEGORIES = Object.keys(LIBELLES_CATEGORIES_SUPPORT) as CategorieSupport[]

// ---------------------------------------------------------------- Liste

function ListeStock() {
  const { profil } = useAuth()
  const devise = useParametres().parametres?.devise ?? ''
  const [articles, setArticles] = useState<Support[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [alertesSeules, setAlertesSeules] = useState(false)

  useEffect(() => {
    let actuel = true
    listerArticles()
      .then((a) => actuel && setArticles(a))
      .catch((e: Error) => actuel && setErreur(e.message))
      .finally(() => actuel && setChargement(false))
    return () => {
      actuel = false
    }
  }, [])

  const actifs = articles.filter((a) => a.actif)
  const nbAlertes = actifs.filter(enAlerte).length
  const termes = normaliser(recherche).split(/\s+/).filter(Boolean)
  const visibles = actifs.filter(
    (a) =>
      (!alertesSeules || enAlerte(a)) &&
      termes.every((t) => normaliser(`${a.nom} ${a.fournisseur ?? ''} ${LIBELLES_CATEGORIES_SUPPORT[a.categorie]}`).includes(t)),
  )
  const valeurTotale = actifs.reduce((s, a) => s + Math.max(Number(a.stock_actuel), 0) * Number(a.prix_unitaire), 0)

  return (
    <>
      <div className="barre-actions">
        <input
          type="search"
          className="champ-recherche"
          placeholder="Rechercher un article : papier, encre, bâche…"
          aria-label="Rechercher un article"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <span />
        {profil?.role === 'gerant' && (
          <Link to="/catalogue/supports" className="bouton bouton-discret">
            Gérer les articles…
          </Link>
        )}
      </div>

      <section className="carte resume-mois">
        <div className="resume-stock">
          <div>
            <span className="texte-doux petit">Articles suivis</span>
            <strong className="total-mois">{actifs.length}</strong>
          </div>
          <div>
            <span className="texte-doux petit">Sous le seuil d’alerte</span>
            <strong className={`total-mois ${nbAlertes > 0 ? 'texte-erreur' : ''}`}>{nbAlertes}</strong>
          </div>
          {(profil?.role === 'gerant' || profil?.role === 'compta') && (
            <div>
              <span className="texte-doux petit">Valeur du stock (prix d’achat)</span>
              <strong className="total-mois">{formaterMontant(valeurTotale, devise)}</strong>
            </div>
          )}
        </div>
        <div className="pastilles filtres" role="group" aria-label="Filtrer">
          <button type="button" className={`pastille ${!alertesSeules ? 'selectionne' : ''}`} aria-pressed={!alertesSeules} onClick={() => setAlertesSeules(false)}>
            Tous les articles
          </button>
          <button type="button" className={`pastille ${alertesSeules ? 'selectionne' : ''}`} aria-pressed={alertesSeules} onClick={() => setAlertesSeules(true)}>
            ⚠ À réapprovisionner ({nbAlertes})
          </button>
        </div>
      </section>

      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="texte-doux">Chargement…</p>}
      {!chargement && !erreur && visibles.length === 0 && (
        <div className="vide">
          <p>
            {actifs.length === 0
              ? 'Aucun article. Le gérant les ajoute dans Tarifs & catalogue > Papiers, supports & encres.'
              : alertesSeules
                ? 'Aucun article sous son seuil d’alerte.'
                : 'Aucun article ne correspond.'}
          </p>
        </div>
      )}

      {ORDRE_CATEGORIES.map((cat) => {
        const liste = visibles.filter((a) => a.categorie === cat)
        if (liste.length === 0) return null
        return (
          <section key={cat} className="section">
            <h2 className="titre-section">{LIBELLES_CATEGORIES_SUPPORT[cat]}</h2>
            <ul className="liste-cartes">
              {liste.map((a) => (
                <li key={a.id}>
                  <Link to={`/stock/${a.id}`} className={`carte carte-devis ${enAlerte(a) ? 'carte-alerte' : ''}`}>
                    <div className="carte-corps">
                      <div className="carte-titre">
                        <strong>{a.nom}</strong>
                        {enAlerte(a) && <span className="badge statut-refuse">⚠ à réapprovisionner</span>}
                      </div>
                      <div className="texte-doux petit">
                        {[a.seuil_alerte > 0 && `seuil ${nombre(a.seuil_alerte)} ${uniteAccordee(a.unite, a.seuil_alerte)}`, a.fournisseur]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="montant-carte">
                      <strong className={Number(a.stock_actuel) < 0 ? 'texte-erreur' : undefined}>{nombre(a.stock_actuel)}</strong>
                      <span className="texte-doux petit">{uniteAccordee(a.unite, a.stock_actuel)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------- Fiche article

function FicheArticle() {
  const { id } = useParams()
  const { profil } = useAuth()
  const devise = useParametres().parametres?.devise ?? ''
  const [donnees, setDonnees] = useState<{ article: Support; mouvements: Mouvement[] } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [action, setAction] = useState<TypeMouvement | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let actuel = true
    chargerArticle(Number(id))
      .then((d) => actuel && setDonnees(d))
      .catch((e: Error) => actuel && setErreur(e.message))
    return () => {
      actuel = false
    }
  }, [id, version])

  if (erreur) return <p className="alerte alerte-erreur" role="alert">{erreur}</p>
  if (!donnees) return <p className="texte-doux">Chargement…</p>

  const { article: a, mouvements } = donnees
  const unite = LIBELLES_UNITES[a.unite]
  const voitPrix = profil?.role === 'gerant' || profil?.role === 'compta'

  return (
    <>
      <p>
        <Link to="/stock" className="bouton bouton-discret">
          ← Tout le stock
        </Link>
      </p>

      <section className={`carte fiche-stock ${enAlerte(a) ? 'carte-alerte' : ''}`}>
        <div className="carte-corps">
          <span className="texte-doux petit">{LIBELLES_CATEGORIES_SUPPORT[a.categorie]}</span>
          <h2 className="titre-carte">{a.nom}</h2>
          <div className="texte-doux petit">
            {[
              a.seuil_alerte > 0 && `Seuil d’alerte : ${nombre(a.seuil_alerte)} ${uniteAccordee(a.unite, a.seuil_alerte)}`,
              voitPrix && a.prix_unitaire > 0 && `Dernier prix d’achat : ${formaterMontant(a.prix_unitaire, devise)} / ${unite}`,
              a.fournisseur && `Fournisseur : ${a.fournisseur}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {enAlerte(a) && <p className="texte-erreur petit">⚠ Stock sous le seuil d’alerte : pensez à réapprovisionner.</p>}
        </div>
        <div className="stock-actuel">
          <strong className={Number(a.stock_actuel) < 0 ? 'texte-erreur' : undefined}>{nombre(a.stock_actuel)}</strong>
          <span className="texte-doux">{uniteAccordee(a.unite, a.stock_actuel)} en stock</span>
          {voitPrix && <span className="texte-doux petit">valeur {formaterMontant(Math.max(a.stock_actuel, 0) * a.prix_unitaire, devise)}</span>}
        </div>
      </section>

      <div className="barre-statut">
        <button type="button" className="bouton bouton-principal" onClick={() => setAction('sortie')}>
          − Sortie (consommation)
        </button>
        <button type="button" className="bouton" onClick={() => setAction('entree')}>
          + Entrée
        </button>
        <button type="button" className="bouton" onClick={() => setAction('ajustement')}>
          Inventaire (stock compté)
        </button>
      </div>
      <p className="texte-doux petit">
        Les achats payés s’enregistrent dans <strong>Dépenses</strong> (catégorie achats) : ils entrent en stock automatiquement.
        « Entrée » sert aux réceptions sans dépense (retour, don, transfert…).
      </p>

      <h2 className="titre-section">Historique</h2>
      {mouvements.length === 0 ? (
        <div className="vide">
          <p>Aucun mouvement pour cet article.</p>
        </div>
      ) : (
        <ul className="liste-cartes">
          {mouvements.map((m) => {
            const v = variation(m)
            return (
              <li key={m.id} className="carte mouvement">
                <div className="carte-corps">
                  <strong>
                    {LIBELLES_MOUVEMENTS[m.type]}
                    {m.depense_id && <span className="texte-doux petit"> · achat</span>}
                  </strong>
                  <span className="texte-doux petit">
                    {[
                      new Date(m.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }),
                      m.motif,
                      m.profil?.nom_complet,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <strong className={v < 0 ? 'texte-erreur' : 'texte-succes'}>
                  {v > 0 ? '+' : v < 0 ? '−' : ''} {nombre(Math.abs(v))} {uniteAccordee(a.unite, v)}
                </strong>
              </li>
            )
          })}
        </ul>
      )}

      {action && (
        <FenetreMouvement
          type={action}
          article={a}
          onFermer={() => setAction(null)}
          onEnregistre={() => {
            setAction(null)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------- Saisie d'un mouvement

const TITRES: Record<TypeMouvement, string> = {
  sortie: 'Sortie de stock',
  entree: 'Entrée en stock',
  ajustement: 'Inventaire',
}

function FenetreMouvement({
  type,
  article: a,
  onFermer,
  onEnregistre,
}: {
  type: TypeMouvement
  article: Support
  onFermer: () => void
  onEnregistre: () => void
}) {
  const unite = LIBELLES_UNITES[a.unite]
  // Calculé une fois à l'ouverture (date du jour pour l'inventaire)
  const [motifParDefaut] = useState(
    () =>
      ({
        sortie: 'Consommation atelier',
        entree: 'Réception',
        ajustement: `Inventaire du ${new Date().toLocaleDateString('fr-FR')}`,
      })[type],
  )
  const [quantite, setQuantite] = useState('')
  const [motif, setMotif] = useState(motifParDefaut)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const q = versNombre(quantite)
  const stock = Number(a.stock_actuel)
  // Inventaire : on saisit la quantité comptée, l'ajustement est l'écart
  const ecart = type === 'ajustement' && Number.isFinite(q) && quantite.trim() !== '' ? Math.round((q - stock) * 100) / 100 : null
  const apres = type === 'sortie' ? stock - (q || 0) : type === 'entree' ? stock + (q || 0) : q

  async function valider(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (type === 'ajustement') {
      if (!(q >= 0)) return setErreur('Indiquez la quantité comptée (0 ou plus).')
      if (ecart === 0) return setErreur('Le stock compté est égal au stock enregistré : aucun ajustement nécessaire.')
    } else if (!(q > 0)) {
      return setErreur('La quantité doit être supérieure à 0.')
    }
    setEnvoi(true)
    try {
      await enregistrerMouvement({
        support_id: a.id,
        type,
        quantite: type === 'ajustement' ? ecart! : q,
        motif: motif.trim() || motifParDefaut,
      })
      onEnregistre()
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  return (
    <Fenetre titre={`${TITRES[type]} — ${a.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider} noValidate>
        <p className="texte-doux">
          Stock enregistré : <strong>{nombre(stock)} {uniteAccordee(a.unite, stock)}</strong>
        </p>
        <label htmlFor="mvt-quantite">
          <span>{type === 'ajustement' ? 'Quantité comptée en rayon' : type === 'sortie' ? 'Quantité sortie' : 'Quantité reçue'}</span>
          <span className="champ-suffixe">
            <input id="mvt-quantite" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} autoFocus />
            <span>{unite}</span>
          </span>
        </label>
        {quantite.trim() !== '' && Number.isFinite(q) && (
          <p className={`petit ${type === 'sortie' && apres < 0 ? 'texte-erreur' : 'texte-doux'}`}>
            {type === 'ajustement' && ecart !== null
              ? ecart === 0
                ? 'Aucun écart.'
                : `Écart : ${ecart > 0 ? '+' : '−'} ${nombre(Math.abs(ecart))} ${uniteAccordee(a.unite, ecart)} (le stock passera à ${nombre(q)}).`
              : `Le stock passera à ${nombre(apres)} ${uniteAccordee(a.unite, apres)}.`}
            {type === 'sortie' && apres < 0 && ' Attention : plus que le stock enregistré — faites un inventaire si le stock est faux.'}
          </p>
        )}
        <label htmlFor="mvt-motif">
          <span>Motif</span>
          <input
            id="mvt-motif"
            placeholder={type === 'sortie' ? 'Ex. Commande CMD-2026-0012, gâche, échantillons…' : undefined}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
        </label>
        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
        <div className="actions-formulaire">
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
