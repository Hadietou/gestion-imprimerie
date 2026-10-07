import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { chargerParametres, type Parametres } from '../lib/parametres'
import { ParametresContext, type ParametresState } from './ParametresContext'

// Chargé une fois connecté (lecture autorisée à tous les profils actifs par la RLS)
export function ParametresProvider({ children }: { children: ReactNode }) {
  const [parametres, setParametres] = useState<Parametres | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let actuel = true
    chargerParametres()
      .then((p) => {
        if (!actuel) return
        setParametres(p)
        setErreur(null)
      })
      .catch((e: Error) => actuel && setErreur(e.message))
    return () => {
      actuel = false
    }
  }, [version])

  const valeur = useMemo<ParametresState>(
    () => ({ parametres, erreur, recharger: () => setVersion((v) => v + 1) }),
    [parametres, erreur],
  )

  return <ParametresContext.Provider value={valeur}>{children}</ParametresContext.Provider>
}
