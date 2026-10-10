import { Navigate, Route, Routes } from 'react-router-dom'
import FicheCommande from './FicheCommande'
import ListeCommandes from './ListeCommandes'

// Module Commandes. Liens internes en chemins absolus (/commandes/…), voir CLAUDE.md.
export default function Commandes() {
  return (
    <Routes>
      <Route index element={<ListeCommandes />} />
      <Route path=":id" element={<FicheCommande />} />
      <Route path="*" element={<Navigate to="/commandes" replace />} />
    </Routes>
  )
}
