import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import Fenetre from './Fenetre'
import { enregistrer, lister, supprimer, type LigneReferentiel, type TableReferentiel } from '../lib/referentiels'

// Liste + fiche d'édition générique pour une table de référence.
// Les champs du formulaire sont décrits par des ChampFiche ; libellés, aides et
// visibilité peuvent dépendre des autres valeurs (ex. la technique d'une machine).

export type Valeurs = Record<string, unknown>
type Dynamique = string | ((v: Valeurs) => string)

export interface ProprietesEditeur {
  valeur: unknown
  valeurs: Valeurs
  onChange: (v: unknown) => void
  erreur?: string
}

export interface ChampFiche {
  cle: string
  libelle: Dynamique
  type: 'texte' | 'texte_long' | 'nombre' | 'entier' | 'choix' | 'choix_multiple' | 'booleen' | 'personnalise'
  options?: { valeur: string; libelle: string }[]
  suffixe?: Dynamique
  aide?: Dynamique
  obligatoire?: boolean
  /** Nombre facultatif : vide = NULL en base (sinon vide = 0) */
  facultatif?: boolean
  min?: number
  max?: number
  visible?: (v: Valeurs) => boolean
  large?: boolean
  /** Champ texte : clavier et contrôle adaptés */
  saisie?: 'email' | 'tel'
  /** Type 'personnalise' : éditeur libre (ex. grille de paliers, simulateur) */
  editeur?: (p: ProprietesEditeur) => ReactNode
  /** Type 'personnalise' : valeur de formulaire initiale à partir de la valeur en base */
  initialiser?: (valeurEnBase: unknown) => unknown
  /** Type 'personnalise' : contrôle et conversion vers la base. Absent = champ non enregistré. */
  convertir?: (valeur: unknown, valeurs: Valeurs) => { valeur: unknown } | { erreur: string }
}

const texte = (d: Dynamique | undefined, v: Valeurs) => (typeof d === 'function' ? d(v) : d)
const estVisible = (c: ChampFiche, v: Valeurs) => !c.visible || c.visible(v)

function versFormulaire(ligne: Record<string, unknown> | null, champs: ChampFiche[], defauts: Valeurs): Valeurs {
  const valeurs: Valeurs = {}
  for (const c of champs) {
    const v = ligne ? ligne[c.cle] : defauts[c.cle]
    if (c.type === 'personnalise') valeurs[c.cle] = c.initialiser ? c.initialiser(v) : v
    else if (c.type === 'booleen') valeurs[c.cle] = v === undefined ? true : Boolean(v)
    else if (c.type === 'choix_multiple') valeurs[c.cle] = Array.isArray(v) ? (v as string[]) : []
    else if (typeof v === 'number') valeurs[c.cle] = String(v).replace('.', ',')
    else valeurs[c.cle] = typeof v === 'string' ? v : ''
  }
  return valeurs
}

// Contrôle les champs visibles et convertit vers les types de la base
function depuisFormulaire(valeurs: Valeurs, champs: ChampFiche[]) {
  const donnees: Record<string, unknown> = {}
  const erreurs: Record<string, string> = {}

  for (const c of champs) {
    const v = valeurs[c.cle]
    const visible = estVisible(c, valeurs)

    if (c.type === 'personnalise') {
      if (!c.convertir) continue
      const resultat = c.convertir(v, valeurs)
      if ('erreur' in resultat) {
        if (visible) erreurs[c.cle] = resultat.erreur
      } else donnees[c.cle] = resultat.valeur
      continue
    }

    if (c.type === 'booleen' || c.type === 'choix_multiple') {
      if (visible && c.obligatoire && Array.isArray(v) && v.length === 0) erreurs[c.cle] = 'Choisissez au moins une option.'
      donnees[c.cle] = v
      continue
    }

    const brut = String(v ?? '').trim()
    if (c.type === 'nombre' || c.type === 'entier') {
      if (!brut) {
        if (visible && c.obligatoire) erreurs[c.cle] = 'Champ obligatoire.'
        donnees[c.cle] = c.facultatif ? null : 0
        continue
      }
      const n = Number(brut.replace(',', '.').replace(/\s/g, ''))
      if (!visible) {
        donnees[c.cle] = Number.isFinite(n) ? n : c.facultatif ? null : 0
      } else if (!Number.isFinite(n)) erreurs[c.cle] = 'Nombre attendu.'
      else if (c.type === 'entier' && !Number.isInteger(n)) erreurs[c.cle] = 'Nombre entier attendu.'
      else if (c.min !== undefined && n < c.min) erreurs[c.cle] = `Minimum : ${c.min}.`
      else if (c.max !== undefined && n > c.max) erreurs[c.cle] = `Maximum : ${c.max}.`
      else donnees[c.cle] = n
      continue
    }

    if (visible && c.obligatoire && !brut) erreurs[c.cle] = 'Champ obligatoire.'
    else if (visible && brut && c.saisie === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brut)) {
      erreurs[c.cle] = 'Adresse e-mail invalide.'
    }
    // Texte facultatif vide = NULL ; les listes de choix gardent leur valeur
    donnees[c.cle] = brut || (c.type === 'choix' ? v : null)
  }
  return { donnees, erreurs }
}

interface ProprietesReferentiel<T extends LigneReferentiel> {
  table: TableReferentiel
  /** Ex. « Nouvelle machine » */
  libelleNouveau: string
  champs: ChampFiche[]
  defauts: Valeurs
  resume: (ligne: T) => ReactNode
  groupe?: (ligne: T) => string
  ordreGroupes?: string[]
  messageVide: string
  /** Active une zone de recherche : texte dans lequel chercher pour chaque ligne */
  texteRecherche?: (ligne: T) => string
  placeholderRecherche?: string
  /** Faux : bouton Supprimer masqué (la RLS refuserait sans erreur) */
  peutSupprimer?: boolean
}

// Minuscules sans accents, pour une recherche tolérante (« Hélène » = « helene »)
const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export default function Referentiel<T extends LigneReferentiel>({
  table,
  libelleNouveau,
  champs,
  defauts,
  resume,
  groupe,
  ordreGroupes = [],
  messageVide,
  texteRecherche,
  placeholderRecherche = 'Rechercher…',
  peutSupprimer = true,
}: ProprietesReferentiel<T>) {
  const [recherche, setRecherche] = useState('')
  const [lignes, setLignes] = useState<T[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [voirInactifs, setVoirInactifs] = useState(false)
  // undefined = fiche fermée ; null = création ; T = modification
  const [fiche, setFiche] = useState<T | null | undefined>(undefined)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let actuel = true
    lister<T>(table)
      .then((l) => {
        if (!actuel) return
        setLignes(l)
        setErreur(null)
      })
      .catch((e: Error) => actuel && setErreur(e.message))
      .finally(() => actuel && setChargement(false))
    return () => {
      actuel = false
    }
  }, [table, version])

  const nbInactifs = lignes.filter((l) => !l.actif).length
  const termes = normaliser(recherche).split(/\s+/).filter(Boolean)
  const visibles = lignes.filter((l) => {
    if (!voirInactifs && !l.actif && termes.length === 0) return false
    if (termes.length === 0 || !texteRecherche) return true
    // Tous les mots saisis doivent apparaître (dans n'importe quel ordre)
    const cible = normaliser(`${l.nom} ${texteRecherche(l)}`)
    return termes.every((t) => cible.includes(t))
  })

  // Regroupement (ex. machines par technique), dans l'ordre demandé
  const groupes = new Map<string, T[]>()
  for (const l of visibles) {
    const g = groupe ? groupe(l) : ''
    groupes.set(g, [...(groupes.get(g) ?? []), l])
  }
  const nomsGroupes = [...groupes.keys()].sort((a, b) => {
    const ia = ordreGroupes.indexOf(a)
    const ib = ordreGroupes.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'fr')
  })

  return (
    <>
      <div className="barre-actions">
        {texteRecherche && (
          <input
            type="search"
            className="champ-recherche"
            placeholder={placeholderRecherche}
            aria-label={placeholderRecherche}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        )}
        {nbInactifs > 0 && termes.length === 0 ? (
          <label className="case-a-cocher petit">
            <input type="checkbox" checked={voirInactifs} onChange={(e) => setVoirInactifs(e.target.checked)} />
            Afficher les désactivés ({nbInactifs})
          </label>
        ) : (
          <span />
        )}
        <button className="bouton bouton-principal" onClick={() => setFiche(null)}>
          + {libelleNouveau}
        </button>
      </div>

      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="texte-doux">Chargement…</p>}
      {!chargement && !erreur && visibles.length === 0 && (
        <div className="vide">
          <p>{termes.length > 0 ? `Aucun résultat pour « ${recherche.trim()} ».` : messageVide}</p>
        </div>
      )}
      {termes.length > 0 && visibles.length > 0 && (
        <p className="texte-doux petit" role="status">
          {visibles.length} résultat{visibles.length > 1 ? 's' : ''}
        </p>
      )}

      {nomsGroupes.map((g) => (
        <section key={g} className="section">
          {g && <h2 className="titre-section">{g}</h2>}
          <ul className="liste-cartes">
            {groupes.get(g)!.map((l) => (
              <li key={l.id} className={`carte carte-ligne ${l.actif ? '' : 'carte-inactive'}`}>
                <div className="carte-corps">
                  <div className="carte-titre">
                    <strong>{l.nom}</strong>
                    {!l.actif && <span className="badge badge-attention">Désactivé</span>}
                  </div>
                  <div className="texte-doux petit">{resume(l)}</div>
                </div>
                <button className="bouton" onClick={() => setFiche(l)}>
                  Modifier
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {fiche !== undefined && (
        <FicheReferentiel
          table={table}
          ligne={fiche}
          titre={fiche ? fiche.nom : libelleNouveau}
          champs={champs}
          defauts={defauts}
          peutSupprimer={peutSupprimer}
          onFermer={() => setFiche(undefined)}
          onEnregistre={() => {
            setFiche(undefined)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </>
  )
}

function FicheReferentiel({
  table,
  ligne,
  titre,
  champs,
  defauts,
  peutSupprimer,
  onFermer,
  onEnregistre,
}: {
  table: TableReferentiel
  ligne: LigneReferentiel | null
  titre: string
  champs: ChampFiche[]
  defauts: Valeurs
  peutSupprimer: boolean
  onFermer: () => void
  onEnregistre: () => void
}) {
  const [valeurs, setValeurs] = useState<Valeurs>(() =>
    versFormulaire(ligne as unknown as Record<string, unknown> | null, champs, defauts),
  )
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function changer(cle: string, v: Valeurs[string]) {
    setValeurs((anciennes) => ({ ...anciennes, [cle]: v }))
    setErreurs((e) => ({ ...e, [cle]: '' }))
  }

  async function valider(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    const { donnees, erreurs: nouvelles } = depuisFormulaire(valeurs, champs)
    setErreurs(nouvelles)
    if (Object.keys(nouvelles).length > 0) {
      setErreur('Corrigez les champs signalés.')
      return
    }
    setEnvoi(true)
    try {
      await enregistrer(table, ligne?.id ?? null, donnees)
      onEnregistre()
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  async function effacer() {
    if (!ligne || !confirm(`Supprimer définitivement « ${ligne.nom} » ?`)) return
    setEnvoi(true)
    setErreur(null)
    try {
      await supprimer(table, ligne.id)
      onEnregistre()
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  return (
    <Fenetre titre={titre} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider} noValidate>
        <div className="grille-champs">
          {champs
            .filter((c) => estVisible(c, valeurs))
            .map((c) => (
              <ChampSaisie
                key={c.cle}
                champ={c}
                valeurs={valeurs}
                erreur={erreurs[c.cle]}
                onChange={(v) => changer(c.cle, v)}
              />
            ))}
        </div>

        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}

        <div className="actions-formulaire">
          {ligne && peutSupprimer && (
            <button type="button" className="bouton bouton-danger" onClick={effacer} disabled={envoi}>
              Supprimer
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

function ChampSaisie({
  champ: c,
  valeurs,
  erreur,
  onChange,
}: {
  champ: ChampFiche
  valeurs: Valeurs
  erreur?: string
  onChange: (v: Valeurs[string]) => void
}) {
  const id = `champ-${c.cle}`
  const libelle = texte(c.libelle, valeurs)
  const aide = erreur || texte(c.aide, valeurs)
  const suffixe = texte(c.suffixe, valeurs)
  const v = valeurs[c.cle]
  const classe = c.large || c.type === 'texte_long' || c.type === 'choix' || c.type === 'choix_multiple' ? 'champ-large' : undefined
  const pied = aide && (
    <small id={`${id}-aide`} className={erreur ? 'texte-erreur' : 'texte-doux'}>
      {aide}
    </small>
  )
  const entete = (
    <span>
      {libelle}
      {c.obligatoire && <span className="obligatoire" aria-hidden="true"> *</span>}
    </span>
  )

  if (c.type === 'personnalise') {
    return (
      <div className="champ-large champ-personnalise">
        <span className="libelle-champ">{entete}</span>
        {c.editeur?.({ valeur: v, valeurs, onChange, erreur })}
        {pied}
      </div>
    )
  }

  if (c.type === 'booleen') {
    return (
      <label className="case-a-cocher champ-large">
        <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(e.target.checked)} />
        {libelle}
      </label>
    )
  }

  if (c.type === 'choix' || c.type === 'choix_multiple') {
    const multiple = c.type === 'choix_multiple'
    const choisis = multiple ? (v as string[]) : [v as string]
    return (
      <fieldset className={`champ-choix ${classe ?? ''}`} aria-invalid={erreur ? true : undefined}>
        <legend>{entete}</legend>
        <div className="pastilles">
          {c.options?.map((o) => (
            <label key={o.valeur} className={`pastille ${choisis.includes(o.valeur) ? 'selectionne' : ''}`}>
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={c.cle}
                checked={choisis.includes(o.valeur)}
                onChange={(e) =>
                  onChange(
                    multiple
                      ? e.target.checked
                        ? [...choisis, o.valeur]
                        : choisis.filter((x) => x !== o.valeur)
                      : o.valeur,
                  )
                }
              />
              {o.libelle}
            </label>
          ))}
        </div>
        {pied}
      </fieldset>
    )
  }

  const proprietes = {
    id,
    value: v as string,
    'aria-invalid': erreur ? true : undefined,
    'aria-describedby': aide ? `${id}-aide` : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  }

  return (
    <label htmlFor={id} className={classe}>
      {entete}
      {c.type === 'texte_long' ? (
        <textarea rows={3} {...proprietes} />
      ) : c.type === 'nombre' || c.type === 'entier' ? (
        <span className="champ-suffixe">
          <input inputMode={c.type === 'entier' ? 'numeric' : 'decimal'} {...proprietes} />
          {suffixe && <span>{suffixe}</span>}
        </span>
      ) : (
        <input type={c.saisie ?? 'text'} inputMode={c.saisie} {...proprietes} />
      )}
      {pied}
    </label>
  )
}
