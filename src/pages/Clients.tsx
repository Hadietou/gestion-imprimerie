import { useAuth } from '../auth/AuthContext'
import Referentiel, { type ChampFiche } from '../components/Referentiel'
import { LIBELLES_TYPES_CLIENT, options } from '../lib/libelles'
import type { Client } from '../lib/types'

// Fichier clients. Écriture : gérant, accueil, compta ; suppression : gérant (RLS).

const champs: ChampFiche[] = [
  { cle: 'type_client', libelle: 'Type de client', type: 'choix', options: options(LIBELLES_TYPES_CLIENT), obligatoire: true },
  {
    cle: 'nom',
    libelle: (v) => (v.type_client === 'particulier' ? 'Nom et prénom' : 'Raison sociale'),
    type: 'texte',
    obligatoire: true,
    large: true,
  },
  {
    cle: 'contact',
    libelle: 'Personne à contacter',
    type: 'texte',
    visible: (v) => v.type_client !== 'particulier',
  },
  { cle: 'telephone', libelle: 'Téléphone', aide: 'Plusieurs numéros possibles, séparés par « / ».', type: 'texte', saisie: 'tel' },
  { cle: 'email', libelle: 'E-mail', type: 'texte', saisie: 'email' },
  {
    cle: 'numero_fiscal',
    libelle: 'NIF',
    aide: 'Numéro d’identification fiscale, imprimé sur les factures.',
    type: 'texte',
    visible: (v) => v.type_client !== 'particulier',
  },
  { cle: 'adresse', libelle: 'Adresse', type: 'texte_long' },
  {
    cle: 'remise_pct',
    libelle: 'Remise habituelle',
    aide: 'Appliquée automatiquement à ses nouveaux devis (modifiable).',
    type: 'nombre',
    suffixe: '%',
    min: 0,
    max: 100,
  },
  { cle: 'notes', libelle: 'Notes', aide: 'Habitudes, préférences, conditions particulières…', type: 'texte_long' },
  { cle: 'actif', libelle: 'Client actif (proposé dans les devis)', type: 'booleen' },
]

// Le téléphone est aussi indexé sans espaces : « 4600 » trouve « 46 00 00 00 »
const texteRecherche = (c: Client) =>
  [c.contact, c.telephone, c.telephone?.replace(/\s/g, ''), c.email, c.numero_fiscal].filter(Boolean).join(' ')

export default function Clients() {
  const { profil } = useAuth()

  return (
    <Referentiel<Client>
      table="clients"
      libelleNouveau="Nouveau client"
      champs={champs}
      defauts={{ type_client: 'entreprise', remise_pct: '0', actif: true }}
      messageVide="Aucun client. Ajoutez votre premier client avec « + Nouveau client »."
      texteRecherche={texteRecherche}
      placeholderRecherche="Rechercher : nom, contact, téléphone, e-mail…"
      peutSupprimer={profil?.role === 'gerant'}
      resume={(c) => (
        <>
          {[
            LIBELLES_TYPES_CLIENT[c.type_client],
            c.contact,
            c.remise_pct > 0 && `remise ${c.remise_pct.toLocaleString('fr-FR')} %`,
          ]
            .filter(Boolean)
            .join(' · ')}
          {(c.telephone || c.email) && (
            <span className="coordonnees">
              {c.telephone && (
                <a href={`tel:${c.telephone.split('/')[0].replace(/[^\d+]/g, '')}`}>📞 {c.telephone}</a>
              )}
              {c.email && <a href={`mailto:${c.email}`}>✉️ {c.email}</a>}
            </span>
          )}
        </>
      )}
    />
  )
}
