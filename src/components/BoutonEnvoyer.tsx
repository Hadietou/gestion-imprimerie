import { useState, type RefObject } from 'react'
import { genererPdf, nomDeFichier, numeroWhatsApp, partagerPdf } from '../lib/partage'

// « 📤 Envoyer » : PDF du document affiché + partage WhatsApp (ou autre application).
// Dans l'application Android, « Imprimer / PDF » passe aussi par ici (sans message),
// car l'impression du navigateur n'y existe pas : la feuille de partage propose l'impression.

interface Proprietes {
  /** Conteneur du document affiché (on y cherche .document) */
  zone: RefObject<HTMLElement | null>
  format: 'demi' | 'A4'
  numero: string
  client: string
  telephone: string | null
  indicatif: string
  message: string
  /** Appelé après un envoi réussi (ex. passer le devis à « envoyé ») */
  onEnvoye?: () => void
  /** Variante « imprimer / PDF » sans message (application Android) */
  impression?: boolean
}

export default function BoutonEnvoyer({ zone, format, numero, client, telephone, indicatif, message, onEnvoye, impression }: Proprietes) {
  const [envoi, setEnvoi] = useState(false)
  const [info, setInfo] = useState<{ type: 'succes' | 'erreur' | 'info'; texte: string } | null>(null)

  async function envoyer() {
    const document_ = zone.current?.querySelector<HTMLElement>('.document')
    if (!document_) return
    setEnvoi(true)
    setInfo(null)
    try {
      const pdf = await genererPdf(document_, format)
      const resultat = await partagerPdf({
        pdf,
        nomFichier: nomDeFichier(numero, client),
        titre: numero,
        message: impression ? '' : message,
        numero: impression ? null : numeroWhatsApp(telephone, indicatif),
      })
      if (resultat === 'telecharge') {
        setInfo({
          type: 'info',
          texte: 'PDF téléchargé et WhatsApp Web ouvert : joignez le PDF (trombone 📎) dans la conversation du client.',
        })
      }
      if (resultat !== 'annule' && !impression) onEnvoye?.()
    } catch (e) {
      setInfo({ type: 'erreur', texte: `Envoi impossible : ${(e as Error).message}` })
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <>
      <button type="button" className={`bouton ${impression ? 'bouton-principal' : 'bouton-whatsapp'}`} onClick={envoyer} disabled={envoi}>
        {envoi ? 'Préparation du PDF…' : impression ? 'PDF / Imprimer' : '📤 Envoyer (WhatsApp)'}
      </button>
      {info && (
        <p className={`alerte alerte-${info.type === 'info' ? 'attention' : info.type} message-envoi`} role="status">
          {info.texte}
        </p>
      )}
    </>
  )
}

