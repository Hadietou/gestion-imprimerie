import { useState } from 'react'
import {
  enregistrerClasseur,
  feuilleClients,
  feuilleCommandes,
  feuilleDepenses,
  feuilleDevis,
  feuilleFactures,
  feuillePaiements,
  feuilleSynthese,
  feuillesSauvegarde,
  feuillesStock,
  type Feuille,
  type Periode,
} from '../lib/exports'

// Exports Excel : dossier comptable, listes par module, sauvegarde complète (gérant, compta).

type ChoixPeriode = 'mois' | 'mois_dernier' | 'annee' | 'annee_derniere' | 'libre'

const LIBELLES_PERIODES: Record<ChoixPeriode, string> = {
  mois: 'Ce mois',
  mois_dernier: 'Mois dernier',
  annee: 'Cette année',
  annee_derniere: 'Année dernière',
  libre: 'Dates au choix',
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

function calculerPeriode(choix: ChoixPeriode, du: string, au: string): Periode {
  const auj = new Date()
  const a = auj.getFullYear()
  const m = auj.getMonth()
  switch (choix) {
    case 'mois':
      return { debut: iso(new Date(Date.UTC(a, m, 1))), fin: iso(new Date(Date.UTC(a, m + 1, 0))) }
    case 'mois_dernier':
      return { debut: iso(new Date(Date.UTC(a, m - 1, 1))), fin: iso(new Date(Date.UTC(a, m, 0))) }
    case 'annee':
      return { debut: `${a}-01-01`, fin: `${a}-12-31` }
    case 'annee_derniere':
      return { debut: `${a - 1}-01-01`, fin: `${a - 1}-12-31` }
    case 'libre':
      return { debut: du, fin: au }
  }
}

const dateFr = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR')

interface Export {
  id: string
  icone: string
  titre: string
  description: string
  parPeriode: boolean
  feuilles: (p: Periode) => Promise<Feuille[]>
}

const EXPORTS: Export[] = [
  {
    id: 'comptable',
    icone: '📒',
    titre: 'Dossier comptable',
    description: 'Synthèse mensuelle (facturé, encaissé, dépenses, résultat), factures, paiements et dépenses de la période. À remettre au comptable.',
    parPeriode: true,
    feuilles: async (p) => Promise.all([feuilleSynthese(p), feuilleFactures(p), feuillePaiements(p), feuilleDepenses(p)]),
  },
  { id: 'factures', icone: '🧾', titre: 'Factures', description: 'Montants HT, TVA, TTC, payé, reste et statut.', parPeriode: true, feuilles: async (p) => [await feuilleFactures(p)] },
  { id: 'paiements', icone: '💰', titre: 'Paiements reçus', description: 'Date, facture, client, montant, mode de paiement.', parPeriode: true, feuilles: async (p) => [await feuillePaiements(p)] },
  { id: 'depenses', icone: '💸', titre: 'Dépenses', description: 'Par date et catégorie, avec bénéficiaire et référence.', parPeriode: true, feuilles: async (p) => [await feuilleDepenses(p)] },
  { id: 'devis', icone: '📝', titre: 'Devis', description: 'Devis de la période et leur statut (accepté, refusé…).', parPeriode: true, feuilles: async (p) => [await feuilleDevis(p)] },
  { id: 'commandes', icone: '📦', titre: 'Commandes', description: 'Commandes de la période, livraison et statut.', parPeriode: true, feuilles: async (p) => [await feuilleCommandes(p)] },
  { id: 'clients', icone: '👥', titre: 'Fichier clients', description: 'Tous les clients et leurs coordonnées.', parPeriode: false, feuilles: async () => [await feuilleClients()] },
  { id: 'stock', icone: '📚', titre: 'Stock', description: 'État du stock et valeur (aujourd’hui) + mouvements de la période.', parPeriode: true, feuilles: (p) => feuillesStock(p) },
]

export default function Exports() {
  const [choix, setChoix] = useState<ChoixPeriode>('mois')
  const [du, setDu] = useState(() => iso(new Date()).slice(0, 8) + '01')
  const [au, setAu] = useState(() => iso(new Date()))
  const [enCours, setEnCours] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null)

  const periode = calculerPeriode(choix, du, au)
  const periodeValide = Boolean(periode.debut && periode.fin && periode.debut <= periode.fin)
  const suffixe = `${periode.debut}_au_${periode.fin}`

  async function lancer(id: string, nomFichier: string, construire: () => Promise<Feuille[]>) {
    setEnCours(id)
    setMessage(null)
    try {
      const feuilles = await construire()
      await enregistrerClasseur(feuilles, nomFichier)
      const lignes = feuilles.reduce((s, f) => s + f.lignes.length, 0)
      setMessage({ type: 'succes', texte: `« ${nomFichier} » créé (${feuilles.length} feuille${feuilles.length > 1 ? 's' : ''}, ${lignes} ligne${lignes > 1 ? 's' : ''}).` })
    } catch (e) {
      setMessage({ type: 'erreur', texte: `Export impossible : ${(e as Error).message}` })
    } finally {
      setEnCours(null)
    }
  }

  return (
    <div className="page-exports">
      <section className="carte">
        <h2 className="titre-carte">Période</h2>
        <div className="pastilles filtres" role="group" aria-label="Période">
          {(Object.keys(LIBELLES_PERIODES) as ChoixPeriode[]).map((c) => (
            <button key={c} type="button" className={`pastille ${choix === c ? 'selectionne' : ''}`} aria-pressed={choix === c} onClick={() => setChoix(c)}>
              {LIBELLES_PERIODES[c]}
            </button>
          ))}
        </div>
        {choix === 'libre' && (
          <div className="dates-libres">
            <label>
              <span>Du</span>
              <input type="date" value={du} onChange={(e) => setDu(e.target.value)} />
            </label>
            <label>
              <span>Au</span>
              <input type="date" value={au} onChange={(e) => setAu(e.target.value)} />
            </label>
          </div>
        )}
        <p className="texte-doux petit">
          {periodeValide ? `Du ${dateFr(periode.debut)} au ${dateFr(periode.fin)}.` : 'Choisissez une date de début antérieure à la date de fin.'}
        </p>
      </section>

      {message && (
        <p className={`alerte alerte-${message.type}`} role="status">
          {message.texte}
        </p>
      )}

      <ul className="liste-exports">
        {EXPORTS.map((e) => (
          <li key={e.id} className={`carte export ${e.id === 'comptable' ? 'export-principal' : ''}`}>
            <span className="export-icone" aria-hidden="true">{e.icone}</span>
            <div className="carte-corps">
              <strong>{e.titre}</strong>
              <span className="texte-doux petit">{e.description}</span>
            </div>
            <button
              type="button"
              className={`bouton ${e.id === 'comptable' ? 'bouton-principal' : ''}`}
              disabled={enCours !== null || (e.parPeriode && !periodeValide)}
              onClick={() => lancer(e.id, `${e.titre} ${e.parPeriode ? suffixe : iso(new Date())}.xlsx`, () => e.feuilles(periode))}
            >
              {enCours === e.id ? 'Préparation…' : '⬇ Excel'}
            </button>
          </li>
        ))}
      </ul>

      <section className="carte sauvegarde">
        <h2 className="titre-carte">💾 Sauvegarde complète</h2>
        <p className="texte-doux">
          Toutes les données, toutes dates confondues : clients, devis et commandes (avec leurs lignes), factures,
          paiements, dépenses, stock, tarifs, paramètres. L’hébergement gratuit ne fait pas de sauvegarde automatique :
          faites-en une <strong>chaque semaine</strong> et gardez le fichier sur Google Drive ou une clé USB.
        </p>
        <button
          type="button"
          className="bouton bouton-principal"
          disabled={enCours !== null}
          onClick={() => lancer('sauvegarde', `Sauvegarde imprimerie ${iso(new Date())}.xlsx`, feuillesSauvegarde)}
        >
          {enCours === 'sauvegarde' ? 'Préparation de la sauvegarde…' : '💾 Télécharger la sauvegarde complète'}
        </button>
      </section>
    </div>
  )
}
