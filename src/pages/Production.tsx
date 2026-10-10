import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  LIBELLES_STATUTS_PRODUCTION,
  affecterMachine,
  changerStatutProduction,
  enRetard,
  listerProduction,
  type StatutProduction,
  type Travail,
} from '../lib/commandes'
import { LIBELLES_TECHNIQUES } from '../lib/libelles'
import { supabase } from '../lib/supabase'
import type { Machine, Technique } from '../lib/types'

// File de production de l'atelier : travaux des commandes prêtes ou en production,
// urgents d'abord, puis par date de livraison. Démarrer / Terminé / Bloqué.

const ORDRE_STATUT: Record<StatutProduction, number> = { en_cours: 0, bloque: 1, a_faire: 2, termine: 3 }
const dateCourte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })

export default function Production() {
  const { profil } = useAuth()
  const [travaux, setTravaux] = useState<Travail[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [technique, setTechnique] = useState<Technique | null>(null)
  const [enCours, setEnCours] = useState<number | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let actuel = true
    Promise.all([listerProduction(), supabase.from('machines').select('*').eq('actif', true).order('nom')])
      .then(([t, m]) => {
        if (!actuel) return
        setTravaux(t)
        setMachines((m.data ?? []) as Machine[])
        setErreur(null)
      })
      .catch((e: Error) => actuel && setErreur(e.message))
      .finally(() => actuel && setChargement(false))
    return () => {
      actuel = false
    }
  }, [version])

  async function executer(ligneId: number, operation: () => Promise<unknown>) {
    setEnCours(ligneId)
    setErreur(null)
    try {
      await operation()
      setVersion((v) => v + 1)
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setEnCours(null)
    }
  }

  const peutAgir = profil?.role === 'gerant' || profil?.role === 'accueil' || profil?.role === 'atelier'
  const techniques = (Object.keys(LIBELLES_TECHNIQUES) as Technique[]).filter((t) => travaux.some((x) => x.technique === t))
  const visibles = travaux
    .filter((t) => !technique || t.technique === technique)
    .sort(
      (a, b) =>
        Number(b.commande.urgent) - Number(a.commande.urgent) ||
        ORDRE_STATUT[a.statut_production] - ORDRE_STATUT[b.statut_production] ||
        (a.commande.date_livraison_prevue ?? '9999').localeCompare(b.commande.date_livraison_prevue ?? '9999') ||
        b.priorite - a.priorite ||
        a.id - b.id,
    )

  return (
    <>
      <div className="barre-actions">
        <p className="texte-doux">
          {travaux.length} {travaux.length > 1 ? 'travaux' : 'travail'} à réaliser — urgents d’abord, puis par date de livraison.
        </p>
        <button type="button" className="bouton" onClick={() => setVersion((v) => v + 1)}>
          ↻ Actualiser
        </button>
      </div>

      {techniques.length > 1 && (
        <div className="pastilles filtres" role="group" aria-label="Filtrer par technique">
          <button type="button" className={`pastille ${technique === null ? 'selectionne' : ''}`} aria-pressed={technique === null} onClick={() => setTechnique(null)}>
            Toutes ({travaux.length})
          </button>
          {techniques.map((t) => (
            <button key={t} type="button" className={`pastille ${technique === t ? 'selectionne' : ''}`} aria-pressed={technique === t} onClick={() => setTechnique(t)}>
              {LIBELLES_TECHNIQUES[t]} ({travaux.filter((x) => x.technique === t).length})
            </button>
          ))}
        </div>
      )}

      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="texte-doux">Chargement…</p>}
      {!chargement && !erreur && visibles.length === 0 && (
        <div className="vide">
          <p>Aucun travail en attente. Une commande arrive ici quand son BAT est validé (ou sans BAT).</p>
        </div>
      )}

      <ul className="liste-cartes">
        {visibles.map((t) => {
          const retard = enRetard(t.commande)
          const machinesTechnique = machines.filter((m) => m.technique === t.technique)
          const occupe = enCours === t.id
          return (
            <li key={t.id} className={`carte travail statut-travail-${t.statut_production} ${retard ? 'carte-alerte' : ''}`}>
              <div className="travail-entete">
                <Link to={`/commandes/${t.commande.id}`} className="travail-commande">
                  {t.commande.numero}
                </Link>
                <span className="texte-doux">{t.commande.client?.nom}</span>
                {t.commande.urgent && <span className="badge statut-refuse">🔥 Urgent</span>}
                <span className={`badge badge-statut prod-${t.statut_production}`}>{LIBELLES_STATUTS_PRODUCTION[t.statut_production]}</span>
              </div>

              <strong className="multiligne travail-description">{t.description}</strong>
              <div className="travail-details">
                <span className="travail-quantite">{t.quantite.toLocaleString('fr-FR')} ex.</span>
                <span>{LIBELLES_TECHNIQUES[t.technique]}</span>
                {t.commande.date_livraison_prevue && (
                  <span className={retard ? 'texte-erreur' : undefined}>
                    {retard ? '⚠ en retard — ' : 'Livraison '}
                    {dateCourte(t.commande.date_livraison_prevue)}
                  </span>
                )}
                {t.operateur && t.statut_production !== 'a_faire' && <span className="texte-doux">par {t.operateur.nom_complet}</span>}
              </div>
              {t.instructions && <p className="travail-consignes">{t.instructions}</p>}

              {peutAgir && (
                <div className="travail-actions">
                  {machinesTechnique.length > 0 && (
                    <select
                      aria-label={`Machine pour ${t.commande.numero}`}
                      value={t.machine_id ?? ''}
                      disabled={occupe}
                      onChange={(e) => executer(t.id, () => affecterMachine(t.id, e.target.value ? Number(e.target.value) : null))}
                    >
                      <option value="">Machine…</option>
                      {machinesTechnique.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nom}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="espace" />
                  {(t.statut_production === 'a_faire' || t.statut_production === 'bloque') && (
                    <button type="button" className="bouton bouton-principal" disabled={occupe} onClick={() => executer(t.id, () => changerStatutProduction(t.id, 'en_cours', profil?.id ?? null))}>
                      ▶ {t.statut_production === 'bloque' ? 'Reprendre' : 'Démarrer'}
                    </button>
                  )}
                  {t.statut_production === 'en_cours' && (
                    <button type="button" className="bouton bouton-succes" disabled={occupe} onClick={() => executer(t.id, () => changerStatutProduction(t.id, 'termine', profil?.id ?? null))}>
                      ✓ Terminé
                    </button>
                  )}
                  {t.statut_production !== 'bloque' && (
                    <button
                      type="button"
                      className="bouton"
                      disabled={occupe}
                      onClick={() => {
                        if (confirm('Signaler ce travail comme bloqué (papier manquant, panne, fichier à corriger…) ?')) {
                          executer(t.id, () => changerStatutProduction(t.id, 'bloque', profil?.id ?? null))
                        }
                      }}
                    >
                      ⏸ Bloqué
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
