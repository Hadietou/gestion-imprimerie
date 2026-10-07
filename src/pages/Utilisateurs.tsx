import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { LIBELLES_ROLES } from '../auth/roles'
import Fenetre from '../components/Fenetre'
import type { Role, Utilisateur } from '../lib/types'
import {
  creerUtilisateur,
  genererMotDePasse,
  listerUtilisateurs,
  modifierProfil,
  reinitialiserMotDePasse,
} from '../lib/utilisateurs'

const ROLES = Object.keys(LIBELLES_ROLES) as Role[]

const DESCRIPTIONS_ROLES: Record<Role, string> = {
  gerant: 'Accès complet, tarifs, utilisateurs et paramètres',
  accueil: 'Clients, devis, commandes, BAT, encaissements',
  atelier: 'File de production, commandes, stock',
  compta: 'Factures, paiements, impayés, clients',
}

interface Identifiants {
  nom: string
  email: string
  motDePasse: string
}

function formaterDate(iso: string | null): string {
  if (!iso) return 'Jamais connecté'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Utilisateurs() {
  const { profil } = useAuth()
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enEdition, setEnEdition] = useState<Utilisateur | null>(null)
  const [creation, setCreation] = useState(false)
  const [identifiants, setIdentifiants] = useState<Identifiants | null>(null)

  // Incrémenter « version » relance le chargement de la liste
  const [version, setVersion] = useState(0)
  const charger = () => setVersion((v) => v + 1)

  useEffect(() => {
    let actuel = true
    listerUtilisateurs()
      .then((liste) => {
        if (!actuel) return
        setUtilisateurs(liste)
        setErreur(null)
      })
      .catch((e: Error) => actuel && setErreur(e.message))
      .finally(() => actuel && setChargement(false))
    return () => {
      actuel = false
    }
  }, [version])

  const enAttente = utilisateurs.filter((u) => !u.actif)
  const actifs = utilisateurs.filter((u) => u.actif)

  return (
    <>
      <div className="barre-actions">
        <p className="texte-doux">
          {actifs.length} compte{actifs.length > 1 ? 's' : ''} actif{actifs.length > 1 ? 's' : ''}
        </p>
        <button className="bouton bouton-principal" onClick={() => setCreation(true)}>
          + Nouvel utilisateur
        </button>
      </div>

      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="texte-doux">Chargement…</p>}

      {enAttente.length > 0 && (
        <section className="section">
          <h2 className="titre-section">Inactifs ou en attente d'activation</h2>
          <ul className="liste-cartes">
            {enAttente.map((u) => (
              <CarteUtilisateur key={u.id} utilisateur={u} estMoi={u.id === profil?.id} onModifier={setEnEdition} />
            ))}
          </ul>
        </section>
      )}

      {actifs.length > 0 && (
        <section className="section">
          <h2 className="titre-section">Comptes actifs</h2>
          <ul className="liste-cartes">
            {actifs.map((u) => (
              <CarteUtilisateur key={u.id} utilisateur={u} estMoi={u.id === profil?.id} onModifier={setEnEdition} />
            ))}
          </ul>
        </section>
      )}

      {creation && (
        <FenetreCreation
          onFermer={() => setCreation(false)}
          onCree={(ids) => {
            setCreation(false)
            setIdentifiants(ids)
            charger()
          }}
        />
      )}

      {enEdition && (
        <FenetreEdition
          utilisateur={enEdition}
          estMoi={enEdition.id === profil?.id}
          onFermer={() => setEnEdition(null)}
          onEnregistre={() => {
            setEnEdition(null)
            charger()
          }}
          onMotDePasse={(ids) => {
            setEnEdition(null)
            setIdentifiants(ids)
          }}
        />
      )}

      {identifiants && <FenetreIdentifiants identifiants={identifiants} onFermer={() => setIdentifiants(null)} />}
    </>
  )
}

function CarteUtilisateur({
  utilisateur: u,
  estMoi,
  onModifier,
}: {
  utilisateur: Utilisateur
  estMoi: boolean
  onModifier: (u: Utilisateur) => void
}) {
  return (
    <li className={`carte carte-utilisateur ${u.actif ? '' : 'carte-inactive'}`}>
      <div className="carte-corps">
        <div className="carte-titre">
          <strong>{u.nom_complet || u.email}</strong>
          {estMoi && <span className="texte-doux"> (vous)</span>}
        </div>
        <div className="texte-doux">{u.email}</div>
        <div className="carte-badges">
          <span className={`badge-role role-${u.role}`}>{LIBELLES_ROLES[u.role]}</span>
          {!u.actif && <span className="badge badge-attention">Inactif</span>}
          <span className="texte-doux petit">Dernière connexion : {formaterDate(u.derniere_connexion)}</span>
        </div>
      </div>
      <button className="bouton" onClick={() => onModifier(u)}>
        {u.actif ? 'Modifier' : 'Activer…'}
      </button>
    </li>
  )
}

function ChoixRole({ valeur, onChange, desactive }: { valeur: Role; onChange: (r: Role) => void; desactive?: boolean }) {
  return (
    <fieldset className="choix-role" disabled={desactive}>
      <legend>Rôle</legend>
      {ROLES.map((r) => (
        <label key={r} className={`option-role ${valeur === r ? 'selectionne' : ''}`}>
          <input type="radio" name="role" value={r} checked={valeur === r} onChange={() => onChange(r)} />
          <span>
            <strong>{LIBELLES_ROLES[r]}</strong>
            <small>{DESCRIPTIONS_ROLES[r]}</small>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

function FenetreCreation({ onFermer, onCree }: { onFermer: () => void; onCree: (ids: Identifiants) => void }) {
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('accueil')
  const [motDePasse, setMotDePasse] = useState(genererMotDePasse)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function valider(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    try {
      await creerUtilisateur({ email: email.trim(), nomComplet: nom.trim(), role, motDePasse })
      onCree({ nom: nom.trim(), email: email.trim().toLowerCase(), motDePasse })
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  return (
    <Fenetre titre="Nouvel utilisateur" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <label>
          Nom complet
          <input required value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
        </label>
        <label>
          Adresse e-mail (identifiant de connexion)
          <input type="email" required inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <ChoixRole valeur={role} onChange={setRole} />
        <label>
          Mot de passe provisoire
          <span className="champ-avec-bouton">
            <input required minLength={8} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
            <button type="button" className="bouton" onClick={() => setMotDePasse(genererMotDePasse())}>
              Générer
            </button>
          </span>
          <small className="texte-doux">L'utilisateur pourra le changer dans « Mon compte ».</small>
        </label>

        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}

        <div className="actions-formulaire">
          <button type="button" className="bouton" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className="bouton bouton-principal" disabled={envoi}>
            {envoi ? 'Création…' : 'Créer le compte'}
          </button>
        </div>
      </form>
    </Fenetre>
  )
}

function FenetreEdition({
  utilisateur,
  estMoi,
  onFermer,
  onEnregistre,
  onMotDePasse,
}: {
  utilisateur: Utilisateur
  estMoi: boolean
  onFermer: () => void
  onEnregistre: () => void
  onMotDePasse: (ids: Identifiants) => void
}) {
  const [nom, setNom] = useState(utilisateur.nom_complet)
  const [role, setRole] = useState<Role>(utilisateur.role)
  // Ouvrir un compte inactif = intention de l'activer
  const [actif, setActif] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function valider(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    try {
      await modifierProfil(utilisateur.id, { nom_complet: nom.trim(), role, actif })
      onEnregistre()
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  async function nouveauMotDePasse() {
    const nom = utilisateur.nom_complet || utilisateur.email
    if (!confirm(`Générer un nouveau mot de passe pour ${nom} ? L'ancien ne fonctionnera plus.`)) return
    setEnvoi(true)
    setErreur(null)
    const motDePasse = genererMotDePasse()
    try {
      await reinitialiserMotDePasse(utilisateur.id, motDePasse)
      onMotDePasse({ nom, email: utilisateur.email, motDePasse })
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  return (
    <Fenetre titre={utilisateur.nom_complet || utilisateur.email} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">{utilisateur.email}</p>
        <label>
          Nom complet
          <input required value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>

        <ChoixRole valeur={role} onChange={setRole} desactive={estMoi} />

        <label className="case-a-cocher">
          <input type="checkbox" checked={actif} disabled={estMoi} onChange={(e) => setActif(e.target.checked)} />
          Compte actif (peut se connecter et utiliser l'application)
        </label>
        {estMoi && <small className="texte-doux">Vous ne pouvez pas modifier votre propre rôle ni vous désactiver.</small>}

        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}

        <div className="actions-formulaire">
          <button type="button" className="bouton" onClick={nouveauMotDePasse} disabled={envoi}>
            Réinitialiser le mot de passe
          </button>
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

function FenetreIdentifiants({ identifiants, onFermer }: { identifiants: Identifiants; onFermer: () => void }) {
  const [copie, setCopie] = useState(false)
  const texte =
    `Application de gestion de l'imprimerie : ${window.location.origin}\n` +
    `Identifiant : ${identifiants.email}\n` +
    `Mot de passe provisoire : ${identifiants.motDePasse}\n` +
    `Pensez à le changer dans « Mon compte » après votre première connexion.`

  async function copier() {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(true)
    } catch {
      setCopie(false)
    }
  }

  return (
    <Fenetre titre="Identifiants à transmettre" onFermer={onFermer}>
      <div className="formulaire">
        <p>
          Transmettez ces identifiants à <strong>{identifiants.nom}</strong>. Le mot de passe ne sera plus affiché
          après la fermeture de cette fenêtre.
        </p>
        <dl className="identifiants">
          <dt>Identifiant</dt>
          <dd>{identifiants.email}</dd>
          <dt>Mot de passe</dt>
          <dd className="mot-de-passe">{identifiants.motDePasse}</dd>
        </dl>
        <div className="actions-formulaire">
          <button type="button" className="bouton" onClick={copier}>
            {copie ? '✓ Copié' : 'Copier le message'}
          </button>
          <span className="espace" />
          <button type="button" className="bouton bouton-principal" onClick={onFermer}>
            Terminé
          </button>
        </div>
      </div>
    </Fenetre>
  )
}
