import { useState } from 'react'
import type { Client } from '../../lib/types'

// Sélection d'un client par recherche (nom, contact, téléphone), adaptée au comptoir

const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

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
        <button type="button" className="bouton" onClick={() => onChange(null)}>
          Changer
        </button>
      </div>
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
          {resultats.length === 0 && (
            <li className="texte-doux petit aucun">Aucun client trouvé. Créez-le d’abord dans le menu Clients.</li>
          )}
        </ul>
      )}
      {erreur && <small className="texte-erreur">{erreur}</small>}
    </div>
  )
}
