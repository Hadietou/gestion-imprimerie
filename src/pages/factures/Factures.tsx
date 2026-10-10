import { Navigate, Route, Routes } from 'react-router-dom'
import FicheFacture from './FicheFacture'
import ListeFactures from './ListeFactures'

// Module Factures. Liens internes en chemins absolus (/factures/…), voir CLAUDE.md.
export default function Factures() {
  return (
    <Routes>
      <Route index element={<ListeFactures />} />
      <Route path=":id" element={<FicheFacture />} />
      <Route path="*" element={<Navigate to="/factures" replace />} />
    </Routes>
  )
}
