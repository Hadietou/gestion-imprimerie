import { formaterMontant } from '../../lib/format'
import { LIBELLES_MODES_CALCUL, LIBELLES_TECHNIQUES, options } from '../../lib/libelles'
import { auM2, auMetre } from '../../lib/tarifs'
import type { Finition, Produit, Technique } from '../../lib/types'
import { appliquerProduit, recalculer, totalLigne, versNombre, type LigneEdition } from './edition'

interface Proprietes {
  numero: number
  ligne: LigneEdition
  produits: Produit[]
  finitions: Finition[]
  devise: string
  erreur?: string | null
  onChange: (l: LigneEdition) => void
  onSupprimer: () => void
}

const TECHNIQUES = Object.keys(LIBELLES_TECHNIQUES) as Technique[]

export default function LigneDevis({ numero, ligne: l, produits, finitions, devise, erreur, onChange, onSupprimer }: Proprietes) {
  const produit = produits.find((p) => p.id === l.produit_id) ?? null
  const libre = l.libre
  // Ligne neuve : seul le choix du produit est affiché
  const nonChoisi = l.produit_id === null && !l.libre
  const prixForce = l.prix_force !== null
  const id = (champ: string) => `ligne-${l.cle}-${champ}`

  // Modification d'un champ qui influe sur le prix → recalcul
  const changerEtRecalculer = (modif: Partial<LigneEdition>) => onChange(recalculer({ ...l, ...modif }, produits, finitions))

  const finitionsPossibles = finitions.filter(
    (f) => f.actif && f.techniques.includes(l.technique) && !l.finitions.some((x) => x.finition_id === f.id),
  )
  const quantite = versNombre(l.quantite)
  const prixUnitaire = quantite > 0 ? totalLigne(l) / quantite : 0

  return (
    <li className={`carte ligne-devis ${erreur ? 'ligne-en-erreur' : ''}`}>
      <div className="ligne-devis-entete">
        <span className="numero-ligne">{numero}</span>
        <select
          aria-label={`Ligne ${numero} : produit`}
          value={libre ? 'autre' : (l.produit_id ?? '')}
          onChange={(e) => {
            const choisi = produits.find((p) => p.id === Number(e.target.value)) ?? null
            onChange(appliquerProduit(l, e.target.value === 'autre' ? null : choisi, produits, finitions))
          }}
        >
          <option value="" disabled>
            Choisir un produit…
          </option>
          {TECHNIQUES.map((t) => {
            const liste = produits.filter((p) => p.technique === t && (p.actif || p.id === l.produit_id))
            return (
              liste.length > 0 && (
                <optgroup key={t} label={LIBELLES_TECHNIQUES[t]}>
                  {liste.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </optgroup>
              )
            )
          })}
          <optgroup label="Hors catalogue">
            <option value="autre">Autre travail (prix saisi à la main)</option>
          </optgroup>
        </select>
        <button type="button" className="bouton-fermer" onClick={onSupprimer} aria-label={`Supprimer la ligne ${numero}`}>
          ✕
        </button>
      </div>

      {nonChoisi && (
        <p className="texte-doux petit">
          Choisissez le produit dans la liste : son prix se calcule tout seul selon la quantité. Pour un travail qui n’est
          pas au catalogue, choisissez « Autre travail » en bas de la liste.
        </p>
      )}
      {erreur && nonChoisi && <p className="texte-erreur petit">{erreur}</p>}
      {!nonChoisi && (
        <>

      <div className="grille-ligne">
        <label className="champ-large" htmlFor={id('description')}>
          <span>Désignation (imprimée sur le devis)</span>
          <textarea
            id={id('description')}
            rows={2}
            value={l.description}
            onChange={(e) => onChange({ ...l, description: e.target.value })}
          />
        </label>

        {libre && (
          <label htmlFor={id('technique')}>
            <span>Technique</span>
            <select id={id('technique')} value={l.technique} onChange={(e) => onChange({ ...l, technique: e.target.value as Technique })}>
              {options(LIBELLES_TECHNIQUES).map((o) => (
                <option key={o.valeur} value={o.valeur}>
                  {o.libelle}
                </option>
              ))}
            </select>
          </label>
        )}

        <label htmlFor={id('quantite')}>
          <span>Quantité</span>
          <span className="champ-suffixe">
            <input
              id={id('quantite')}
              inputMode="numeric"
              value={l.quantite}
              onChange={(e) => changerEtRecalculer({ quantite: e.target.value })}
            />
            <span>{produit && (auM2(produit.mode_prix) || auMetre(produit.mode_prix)) ? 'pièce(s)' : 'ex.'}</span>
          </span>
        </label>

        {produit && auM2(produit.mode_prix) && (
          <div className="dimensions">
            <label htmlFor={id('largeur')}>
              <span>Largeur</span>
              <span className="champ-suffixe">
                <input id={id('largeur')} inputMode="decimal" value={l.largeur_cm} onChange={(e) => changerEtRecalculer({ largeur_cm: e.target.value })} />
                <span>cm</span>
              </span>
            </label>
            <span className="fois" aria-hidden="true">×</span>
            <label htmlFor={id('hauteur')}>
              <span>Hauteur</span>
              <span className="champ-suffixe">
                <input id={id('hauteur')} inputMode="decimal" value={l.hauteur_cm} onChange={(e) => changerEtRecalculer({ hauteur_cm: e.target.value })} />
                <span>cm</span>
              </span>
            </label>
          </div>
        )}

        {produit && auMetre(produit.mode_prix) && (
          <label htmlFor={id('longueur')}>
            <span>Longueur d’une pièce</span>
            <span className="champ-suffixe">
              <input id={id('longueur')} inputMode="decimal" value={l.hauteur_cm} onChange={(e) => changerEtRecalculer({ hauteur_cm: e.target.value })} />
              <span>cm</span>
            </span>
          </label>
        )}
      </div>

      {!libre && (
        <div className="finitions-ligne">
          {l.finitions.map((f) => {
            const def = finitions.find((x) => x.id === f.finition_id)
            return (
              <span key={f.finition_id} className="pastille selectionne">
                {def?.nom ?? 'Finition'}
                {!prixForce && <span className="petit"> · {formaterMontant(f.montant, devise)}</span>}
                <button
                  type="button"
                  className="retirer"
                  aria-label={`Retirer ${def?.nom ?? 'la finition'}`}
                  onClick={() => onChange({ ...l, finitions: l.finitions.filter((x) => x.finition_id !== f.finition_id) })}
                >
                  ✕
                </button>
              </span>
            )
          })}
          {finitionsPossibles.length > 0 && (
            <select
              className="ajout-finition"
              aria-label={`Ligne ${numero} : ajouter une finition`}
              value=""
              onChange={(e) =>
                changerEtRecalculer({ finitions: [...l.finitions, { finition_id: Number(e.target.value), montant: 0 }] })
              }
            >
              <option value="">+ Finition…</option>
              {finitionsPossibles.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom} ({LIBELLES_MODES_CALCUL[f.mode_calcul].toLowerCase()})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="pied-ligne">
        <div className="calcul texte-doux petit">
          {prixForce ? (libre ? 'Travail hors catalogue : indiquez son prix HT' : 'Prix modifié à la main') : l.detail}
        </div>
        <div className="prix-ligne">
          {prixForce ? (
            <span className="champ-suffixe">
              <input
                aria-label={`Ligne ${numero} : prix total HT`}
                inputMode="decimal"
                value={l.prix_force ?? ''}
                onChange={(e) => onChange({ ...l, prix_force: e.target.value })}
              />
              <span>{devise} HT</span>
            </span>
          ) : (
            <strong>{formaterMontant(totalLigne(l), devise)}</strong>
          )}
          {quantite > 1 && totalLigne(l) > 0 && (
            <span className="texte-doux petit">soit {formaterMontant(prixUnitaire, devise)} / ex.</span>
          )}
          {!libre &&
            (prixForce ? (
              <button type="button" className="bouton bouton-discret" onClick={() => changerEtRecalculer({ prix_force: null })}>
                ↺ Revenir au prix calculé
              </button>
            ) : (
              <button
                type="button"
                className="bouton bouton-discret"
                onClick={() => onChange({ ...l, prix_force: String(totalLigne(l)).replace('.', ',') })}
              >
                Modifier le prix
              </button>
            ))}
        </div>
      </div>

      {erreur && <p className="texte-erreur petit">{erreur}</p>}
      {produit && !produit.actif && <p className="texte-doux petit">Produit désactivé dans la grille.</p>}
        </>
      )}
    </li>
  )
}
