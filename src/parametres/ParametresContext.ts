import { createContext, useContext } from 'react'
import type { Parametres } from '../lib/parametres'

export interface ParametresState {
  parametres: Parametres | null
  erreur: string | null
  recharger: () => void
}

export const ParametresContext = createContext<ParametresState | null>(null)

// Paramètres généraux (nom, devise, TVA…) disponibles dans toute l'application
export function useParametres(): ParametresState {
  const ctx = useContext(ParametresContext)
  if (!ctx) throw new Error('useParametres doit être utilisé dans <ParametresProvider>')
  return ctx
}
