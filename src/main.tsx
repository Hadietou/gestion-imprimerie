// Capte l'invitation à installer dès le chargement (avant l'affichage de React)
import './pwa/installation'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import BandeauxPwa from './pwa/BandeauxPwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <BandeauxPwa />
  </StrictMode>,
)
