import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LIBELLES_ROLES, menuPourRole } from '../auth/roles'
import GraphiqueFinances from '../components/GraphiqueFinances'
import { formaterMontant } from '../lib/format'
import { chargerIndicateurs, type Indicateurs } from '../lib/tableauDeBord'
import { useParametres } from '../parametres/ParametresContext'

// Tableau de bord selon le rôle : chiffres du mois (gérant, compta), points à
// surveiller (tous), file de l'atelier, raccourcis vers les modules.

interface Alerte {
  niveau: 'critique' | 'attention' | 'info'
  icone: string
  texte: ReactNode
  lien: string
}

export default function TableauDeBord() {
  const { profil } = useAuth()
  const devise = useParametres().parametres?.devise ?? ''
  const [indicateurs, setIndicateurs] = useState<Indicateurs | null>(null)

  useEffect(() => {
    if (!profil) return
    let actuel = true
    chargerIndicateurs(profil.role)
      .then((i) => actuel && setIndicateurs(i))
      .catch(() => actuel && setIndicateurs({}))
    return () => {
      actuel = false
    }
  }, [profil])

  if (!profil) return null
  const raccourcis = menuPourRole(profil.role).filter((e) => e.chemin !== '/tableau-de-bord')
  const prenom = profil.nom_complet.split(' ')[0] || 'à vous'
  const i = indicateurs
  const f = i?.finances
  const resultatMois = f ? f.encaisseMois - f.depensesMois : 0
  // Mois courant = dernier mois de l'historique chargé
  const moisCourant = f?.historique[f.historique.length - 1]?.mois
  const nomMoisCourant = moisCourant ? new Date(`${moisCourant}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long' }) : ''

  // Points à surveiller, du plus grave au moins grave ; seuls ceux qui comptent s'affichent
  const alertes: Alerte[] = []
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
  if (i?.commandes?.enRetard) alertes.push({ niveau: 'critique', icone: '⚠', texte: <><strong>{pluriel(i.commandes.enRetard, 'commande')}</strong> en retard de livraison</>, lien: '/commandes' })
  if (i?.production?.bloques) alertes.push({ niveau: 'critique', icone: '⏸', texte: <><strong>{i.production.bloques} {i.production.bloques > 1 ? 'travaux bloqués' : 'travail bloqué'}</strong> à l’atelier</>, lien: '/production' })
  if (i?.facturesEnRetard?.nombre) alertes.push({ niveau: 'critique', icone: '⏰', texte: <><strong>{pluriel(i.facturesEnRetard.nombre, 'facture')}</strong> en retard de paiement ({formaterMontant(i.facturesEnRetard.montant, devise)})</>, lien: '/impayes' })
  if (i?.stockBas) alertes.push({ niveau: 'attention', icone: '📦', texte: <><strong>{pluriel(i.stockBas, 'article')}</strong> à réapprovisionner</>, lien: '/stock' })
  if (i?.commandes?.aLivrer) alertes.push({ niveau: 'info', icone: '✓', texte: <><strong>{pluriel(i.commandes.aLivrer, 'commande')}</strong> terminée{i.commandes.aLivrer > 1 ? 's' : ''}, à livrer</>, lien: '/commandes' })
  if (i?.commandes?.batEnAttente) alertes.push({ niveau: 'info', icone: '✉', texte: <><strong>{pluriel(i.commandes.batEnAttente, 'BAT')}</strong> en attente de réponse du client</>, lien: '/commandes' })
  if (i?.devis?.expires) alertes.push({ niveau: 'attention', icone: '⌛', texte: <><strong>{pluriel(i.devis.expires, 'devis')}</strong> envoyé{i.devis.expires > 1 ? 's' : ''} et expiré{i.devis.expires > 1 ? 's' : ''} : relancer ou classer</>, lien: '/devis' })
  if (i?.devis?.enAttente) alertes.push({ niveau: 'info', icone: '📝', texte: <><strong>{pluriel(i.devis.enAttente, 'devis')}</strong> envoyé{i.devis.enAttente > 1 ? 's' : ''}, en attente de réponse</>, lien: '/devis' })

  return (
    <div className="tableau-de-bord">
      <p className="bienvenue">
        Bonjour {prenom} — espace <strong>{LIBELLES_ROLES[profil.role]}</strong>
      </p>

      {f && (
        <section className="section">
          <h2 className="titre-section">Chiffres de {nomMoisCourant}</h2>
          <div className="tuiles-stat">
            <div className="stat">
              <span className="stat-libelle">Facturé</span>
              <strong className="stat-valeur">{formaterMontant(f.factureMois, devise)}</strong>
            </div>
            <div className="stat">
              <span className="stat-libelle">Encaissé</span>
              <strong className="stat-valeur">{formaterMontant(f.encaisseMois, devise)}</strong>
            </div>
            <div className="stat">
              <span className="stat-libelle">Dépenses</span>
              <strong className="stat-valeur">{formaterMontant(f.depensesMois, devise)}</strong>
            </div>
            <div className={`stat stat-resultat ${resultatMois < 0 ? 'negatif' : 'positif'}`}>
              <span className="stat-libelle">Résultat (encaissé − dépenses)</span>
              <strong className="stat-valeur">{formaterMontant(resultatMois, devise)}</strong>
              <span className="stat-note">{resultatMois < 0 ? '▼ perte sur le mois' : '▲ bénéfice sur le mois'}</span>
            </div>
            <Link to="/impayes" className="stat stat-lien">
              <span className="stat-libelle">Reste à encaisser (toutes factures)</span>
              <strong className="stat-valeur">{formaterMontant(f.resteAEncaisser, devise)}</strong>
              <span className="stat-note">Voir les impayés →</span>
            </Link>
          </div>
        </section>
      )}

      {i && (
        <section className="section">
          <h2 className="titre-section">À surveiller</h2>
          {alertes.length === 0 ? (
            <p className="carte rien-a-signaler">✓ Rien à signaler pour le moment.</p>
          ) : (
            <ul className="liste-alertes">
              {alertes.map((a, n) => (
                <li key={n}>
                  <Link to={a.lien} className={`alerte-tdb niveau-${a.niveau}`}>
                    <span className="alerte-icone" aria-hidden="true">{a.icone}</span>
                    <span className="alerte-texte">{a.texte}</span>
                    <span className="alerte-fleche" aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {i?.production && profil.role === 'atelier' && (
        <section className="section">
          <h2 className="titre-section">Atelier</h2>
          <div className="tuiles-stat">
            <Link to="/production" className="stat stat-lien">
              <span className="stat-libelle">À faire</span>
              <strong className="stat-valeur">{i.production.aFaire}</strong>
            </Link>
            <Link to="/production" className="stat stat-lien">
              <span className="stat-libelle">En cours</span>
              <strong className="stat-valeur">{i.production.enCours}</strong>
            </Link>
            <Link to="/production" className="stat stat-lien">
              <span className="stat-libelle">Bloqués</span>
              <strong className="stat-valeur">{i.production.bloques}</strong>
            </Link>
          </div>
        </section>
      )}

      {f && (
        <section className="section carte">
          <h2 className="titre-carte">Encaissé et dépenses — 6 derniers mois</h2>
          <GraphiqueFinances donnees={f.historique} devise={devise} />
        </section>
      )}

      {!i && <p className="texte-doux">Chargement des indicateurs…</p>}

      <section className="section">
        <h2 className="titre-section">Accès rapide</h2>
        <div className="grille-raccourcis">
          {raccourcis.map((e) => (
            <Link key={e.chemin} to={e.chemin} className="tuile">
              <span className="tuile-icone" aria-hidden="true">{e.icone}</span>
              {e.libelle}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
