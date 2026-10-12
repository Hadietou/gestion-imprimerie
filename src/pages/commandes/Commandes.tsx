import { Navigate, Route, Routes } from 'react-router-dom'
import EditeurDevis from '../devis/EditeurDevis'
import FicheCommande from './FicheCommande'
import ListeCommandes from './ListeCommandes'

// Module Commandes. Liens internes en chemins absolus (/commandes/…), voir CLAUDE.md.
export default function Commandes() {
  return (
    <Routes>
      <Route index element={<ListeCommandes />} />
      {/* Saisie unique devis / commande, « Commande » présélectionné */}
      <Route path="nouvelle" element={<EditeurDevis commandeParDefaut />} />
      <Route path=":id" element={<FicheCommande />} />
      <Route path="*" element={<Navigate to="/commandes" replace />} />
    </Routes>
  )
}
