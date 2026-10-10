import { useEffect, useRef, useState } from 'react'
import { formaterMontant } from '../lib/format'
import type { MoisFinances } from '../lib/tableauDeBord'

// Encaissé et dépenses par mois : colonnes groupées (une seule échelle),
// légende, info-bulle au survol / au toucher, tableau des valeurs.
// Couleurs : --serie-1 (encaissé) et --serie-2 (dépenses), validées clair / sombre.

const HAUTEUR = 220
const MARGE = { haut: 12, droite: 8, bas: 28, gauche: 48 }
const BARRE_MAX = 20 // ≤ 24 px
const ECART = 2 // espace entre les deux colonnes d'un mois
const RAYON = 4

const nomMois = (m: string, format: 'short' | 'long' = 'short') =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString('fr-FR', { month: format, ...(format === 'long' ? { year: 'numeric' } : {}) })

// Graduation « ronde » : 1, 2 ou 5 × 10^n
function pasRond(max: number, nbPas = 4): number {
  const brut = max / nbPas
  const puissance = 10 ** Math.floor(Math.log10(brut || 1))
  const facteur = [1, 2, 5, 10].find((f) => f * puissance >= brut) ?? 10
  return facteur * puissance
}

const abrege = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k` : String(n)

// Colonne arrondie en haut, carrée sur la ligne de base
function colonne(x: number, y: number, largeur: number, base: number): string {
  const h = base - y
  if (h <= 0) return ''
  const r = Math.min(RAYON, h, largeur / 2)
  return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + largeur - r} Q${x + largeur},${y} ${x + largeur},${y + r} V${base} Z`
}

export default function GraphiqueFinances({ donnees, devise }: { donnees: MoisFinances[]; devise: string }) {
  const [survol, setSurvol] = useState<number | null>(null)
  // Le dessin suit la largeur réelle (textes lisibles sur téléphone, pas de mise à l'échelle)
  const conteneur = useRef<HTMLDivElement>(null)
  const [LARGEUR, setLargeur] = useState(640)
  useEffect(() => {
    const el = conteneur.current
    if (!el) return
    const observateur = new ResizeObserver(([e]) => setLargeur(Math.max(280, Math.round(e.contentRect.width))))
    observateur.observe(el)
    return () => observateur.disconnect()
  }, [])
  const max = Math.max(1, ...donnees.flatMap((d) => [d.encaisse, d.depenses]))
  const pas = pasRond(max)
  const plafond = Math.ceil(max / pas) * pas
  const graduations = Array.from({ length: Math.round(plafond / pas) + 1 }, (_, i) => i * pas)
  const zoneL = LARGEUR - MARGE.gauche - MARGE.droite
  const zoneH = HAUTEUR - MARGE.haut - MARGE.bas
  const base = MARGE.haut + zoneH
  const y = (v: number) => base - (v / plafond) * zoneH
  const bande = zoneL / donnees.length
  const BARRE = Math.max(6, Math.min(BARRE_MAX, (bande - 10) / 2))
  const m = survol !== null ? donnees[survol] : null

  return (
    <figure className="graphique">
      <div className="legende" aria-hidden="true">
        <span><i className="cle serie-1" /> Encaissé</span>
        <span><i className="cle serie-2" /> Dépenses</span>
      </div>

      <div className="zone-graphique" ref={conteneur}>
        <svg width={LARGEUR} height={HAUTEUR} viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} role="img" aria-label="Encaissé et dépenses des 6 derniers mois (détail dans le tableau)">
          {graduations.map((g) => (
            <g key={g}>
              <line className="grille" x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={y(g)} y2={y(g)} />
              <text className="axe" x={MARGE.gauche - 8} y={y(g)} textAnchor="end" dominantBaseline="middle">
                {abrege(g)}
              </text>
            </g>
          ))}
          {donnees.map((d, i) => {
            const centre = MARGE.gauche + bande * i + bande / 2
            const x1 = centre - BARRE - ECART / 2
            const x2 = centre + ECART / 2
            return (
              <g key={d.mois} className={survol !== null && survol !== i ? 'attenue' : undefined}>
                <path className="serie-1" d={colonne(x1, y(d.encaisse), BARRE, base)} />
                <path className="serie-2" d={colonne(x2, y(d.depenses), BARRE, base)} />
                <text className="axe" x={centre} y={HAUTEUR - 8} textAnchor="middle">
                  {nomMois(d.mois)}
                </text>
                {/* Zone de survol plus grande que les colonnes */}
                <rect
                  className="cible"
                  x={MARGE.gauche + bande * i}
                  y={MARGE.haut}
                  width={bande}
                  height={zoneH}
                  onMouseEnter={() => setSurvol(i)}
                  onMouseLeave={() => setSurvol(null)}
                  onClick={() => setSurvol(survol === i ? null : i)}
                />
              </g>
            )
          })}
          <line className="ligne-base" x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={base} y2={base} />
        </svg>

        {m && survol !== null && (
          <div className="info-bulle" style={{ left: `${Math.min(Math.max(((MARGE.gauche + bande * survol + bande / 2) / LARGEUR) * 100, 22), 78)}%` }} role="status">
            <strong>{nomMois(m.mois, 'long')}</strong>
            <span><i className="cle serie-1" /> Encaissé {formaterMontant(m.encaisse, devise)}</span>
            <span><i className="cle serie-2" /> Dépenses {formaterMontant(m.depenses, devise)}</span>
            <span>Résultat {formaterMontant(m.encaisse - m.depenses, devise)}</span>
          </div>
        )}
      </div>

      <details className="tableau-valeurs">
        <summary>Voir les valeurs</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Mois</th>
              <th scope="col">Encaissé</th>
              <th scope="col">Dépenses</th>
              <th scope="col">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {donnees.map((d) => (
              <tr key={d.mois}>
                <th scope="row">{nomMois(d.mois, 'long')}</th>
                <td>{formaterMontant(d.encaisse, devise)}</td>
                <td>{formaterMontant(d.depenses, devise)}</td>
                <td>{formaterMontant(d.encaisse - d.depenses, devise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
