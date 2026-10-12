import { useSyncExternalStore } from 'react'

// État de la connexion internet (événements online / offline)

const sAbonnerReseau = (f: () => void) => {
  window.addEventListener('online', f)
  window.addEventListener('offline', f)
  return () => {
    window.removeEventListener('online', f)
    window.removeEventListener('offline', f)
  }
}

export function useEnLigne() {
  return useSyncExternalStore(sAbonnerReseau, () => navigator.onLine)
}
