// Capte l'invitation à installer dès le chargement (avant l'affichage de React)
import './pwa/installation'
// Application Android : bouton Retour du téléphone
import './pwa/natif'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { Capacitor } from '@capacitor/core'
import BandeauHorsLigne from './pwa/BandeauHorsLigne'
import BandeauxPwa from './pwa/BandeauxPwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Pas de service worker dans l'application Android : seulement le bandeau hors connexion */}
    {Capacitor.isNativePlatform() ? <BandeauHorsLigne /> : <BandeauxPwa />}
  </StrictMode>,
)
