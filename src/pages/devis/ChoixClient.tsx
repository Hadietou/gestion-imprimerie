import { useState, type FormEvent } from 'react'
import { LIBELLES_TYPES_CLIENT } from '../../lib/libelles'
import { creerClient } from '../../lib/referentiels'
import type { Client, TypeClient } from '../../lib/types'

// Sélection d'un client par recherche (nom, contact, téléphone), adaptée au comptoir.
// Si le client n'existe pas, il se crée sur place et devient le client du devis.

const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// Ce qui ressemble à un numéro de téléphone va dans le champ téléphone, le reste dans le nom
const ressembleTelephone = (s: string) => /^[\d\s+./-]{6,}$/.test(s.trim())

export default function ChoixClient({
  clients,
  client,
  onChange,
  erreur,
}: {
  clients: Client[]
  client: Client | null
  onChange: (c: Client | null) => void
  erreur?: string | null
}) {
  const [recherche, setRecherche] = useState('')
  const [creation, setCreation] = useState(false)

  if (client) {
    return (
      <div className="client-choisi">
        <div>
          <strong>{client.nom}</strong>
          <div className="texte-doux petit">
            {[client.contact, client.telephone, client.remise_pct > 0 && `remise habituelle ${client.remise_pct} %`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <button
          type="button"
          className="bouton"
          onClick={() => {
            setCreation(false)
            onChange(null)
          }}
        >
          Changer
        </button>
      </div>
    )
  }

  if (creation) {
    return (
      <CreationClient
        saisie={recherche.trim()}
        onAnnuler={() => setCreation(false)}
        onCree={(c) => {
          setCreation(false)
          setRecherche('')
          onChange(c)
        }}
      />
    )
  }

  const termes = normaliser(recherche).split(/\s+/).filter(Boolean)
  const resultats = termes.length
    ? clients
        .filter((c) => {
          const cible = normaliser(
            [c.nom, c.contact, c.telephone, c.telephone?.replace(/\s/g, '')].filter(Boolean).join(' '),
          )
          return termes.every((t) => cible.includes(t))
        })
        .slice(0, 8)
    : []

  return (
    <div className="choix-client">
      <input
        type="search"
        placeholder="Rechercher le client : nom, téléphone…"
        aria-label="Rechercher le client"
        aria-invalid={erreur ? true : undefined}
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        // Entrée : choisit le seul client trouvé, sinon ouvre la création (au lieu d'envoyer le devis)
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (resultats.length === 1) onChange(resultats[0])
          else if (termes.length > 0 && resultats.length === 0) setCreation(true)
        }}
        autoFocus
      />
      {termes.length > 0 && (
        <ul className="resultats-client">
          {resultats.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange(c)}>
                <strong>{c.nom}</strong>
                <span className="texte-doux petit">{[c.contact, c.telephone].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
          {resultats.length === 0 && <li className="texte-doux petit aucun">Aucun client trouvé.</li>}
          <li>
            <button type="button" className="creer-client" onClick={() => setCreation(true)}>
              <strong>
                + Créer le client {ressembleTelephone(recherche) ? '(nouveau)' : `« ${recherche.trim()} »`}
              </strong>
              <span className="texte-doux petit">Il sera enregistré dans le fichier clients et choisi pour ce devis.</span>
            </button>
          </li>
        </ul>
      )}
      {termes.length === 0 && (
        <button type="button" className="bouton bouton-discret creer-client-lien" onClick={() => setCreation(true)}>
          + Nouveau client
        </button>
      )}
      {erreur && <small className="texte-erreur">{erreur}</small>}
    </div>
  )
}

const TYPES = Object.keys(LIBELLES_TYPES_CLIENT) as TypeClient[]

function CreationClient({ saisie, onAnnuler, onCree }: { saisie: string; onAnnuler: () => void; onCree: (c: Client) => void }) {
  const telephoneSaisi = ressembleTelephone(saisie)
  const [type, setType] = useState<TypeClient>('particulier')
  const [nom, setNom] = useState(telephoneSaisi ? '' : saisie)
  const [telephone, setTelephone] = useState(telephoneSaisi ? saisie : '')
  const [contact, setContact] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Pas de <form> imbriqué dans le formulaire du devis : validation au clic
  async function creer(e?: FormEvent) {
    e?.preventDefault()
    setErreur(null)
    if (!nom.trim()) return setErreur(type === 'particulier' ? 'Indiquez le nom du client.' : 'Indiquez la raison sociale.')
    setEnvoi(true)
    try {
      const c = await creerClient({
        type_client: type,
        nom: nom.trim(),
        telephone: telephone.trim() || null,
        contact: type === 'particulier' ? null : contact.trim() || null,
      })
      onCree(c)
    } catch (err) {
      setErreur((err as Error).message)
      setEnvoi(false)
    }
  }

  return (
    <div className="creation-client" role="group" aria-label="Nouveau client">
      <strong>Nouveau client</strong>
      <div className="pastilles" role="radiogroup" aria-label="Type de client">
        {TYPES.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} className={`pastille ${type === t ? 'selectionne' : ''}`} onClick={() => setType(t)}>
            {LIBELLES_TYPES_CLIENT[t]}
          </button>
        ))}
      </div>
      <label>
        <span>{type === 'particulier' ? 'Nom et prénom' : 'Raison sociale'} *</span>
        <input
          value={nom}
          autoFocus
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              creer()
            }
          }}
        />
      </label>
      <label>
        <span>Téléphone</span>
        <input type="tel" inputMode="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
      </label>
      {type !== 'particulier' && (
        <label>
          <span>Personne à contacter</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} />
        </label>
      )}
      {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
      <div className="actions-formulaire">
        <span className="espace" />
        <button type="button" className="bouton" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </button>
        <button type="button" className="bouton bouton-principal" onClick={() => creer()} disabled={envoi}>
          {envoi ? 'Création…' : 'Créer et choisir ce client'}
        </button>
      </div>
      <small className="texte-doux">Les autres informations (adresse, NIF, remise…) se complètent plus tard dans le menu Clients.</small>
    </div>
  )
}
