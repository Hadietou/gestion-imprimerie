import { useEffect, useRef, type ReactNode } from 'react'

// Fenêtre modale basée sur <dialog> (gère Échap, le focus et l'accessibilité).
// À afficher conditionnellement : {ouvert && <Fenetre …>}
export default function Fenetre({
  titre,
  onFermer,
  children,
}: {
  titre: string
  onFermer: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  // Pas de close() au démontage : il déclencherait onClose (donc onFermer) à tort,
  // notamment avec le double montage de StrictMode. Retirer le <dialog> du DOM suffit.
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog ref={ref} className="fenetre" onClose={onFermer} aria-labelledby="fenetre-titre">
      <div className="fenetre-entete">
        <h2 id="fenetre-titre">{titre}</h2>
        <button type="button" className="bouton-fermer" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
      </div>
      {children}
    </dialog>
  )
}
