import { Navigate, Route, Routes } from 'react-router-dom'
import EditeurDevis from './EditeurDevis'
import FicheDevis from './FicheDevis'
import ListeDevis from './ListeDevis'

// Module Devis. Liens internes en chemins absolus (/devis/…), voir CLAUDE.md.
export default function Devis() {
  return (
    <Routes>
      <Route index element={<ListeDevis />} />
      <Route path="nouveau" element={<EditeurDevis />} />
      <Route path=":id" element={<FicheDevis />} />
      <Route path=":id/modifier" element={<EditeurDevis />} />
      <Route path="*" element={<Navigate to="/devis" replace />} />
    </Routes>
  )
}
