import { Capacitor } from '@capacitor/core'

// PDF d'un document (devis, facture) et envoi au client.
//  - Application Android (Capacitor) : fichier écrit en cache puis feuille de partage
//    (WhatsApp, e-mail, impression…).
//  - Téléphone (navigateur) : partage de fichier natif → WhatsApp → contact.
//  - Ordinateur : téléchargement du PDF + WhatsApp Web ouvert sur le client avec le message.
// Les bibliothèques PDF sont chargées à la demande (elles ne pèsent pas sur le démarrage).

export const estApplicationNative = () => Capacitor.isNativePlatform()

/**
 * Capture d'un élément .document en PDF. Le document est recopié hors écran à sa
 * taille réelle (210 mm de large) pour un rendu identique sur téléphone et ordinateur.
 */
export async function genererPdf(document_: HTMLElement, format: 'demi' | 'A4'): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])

  const conteneur = document.createElement('div')
  conteneur.className = 'export-pdf'
  const copie = document_.cloneNode(true) as HTMLElement
  conteneur.appendChild(copie)
  document.body.appendChild(conteneur)
  try {
    const canvas = await html2canvas(copie, { scale: 2, backgroundColor: '#ffffff', logging: false })
    // Demi-page : feuille 210 × 148,5 mm (moitié d'A4, paysage) ; sinon A4 portrait
    const page = format === 'demi' ? { l: 210, h: 148.5 } : { l: 210, h: 297 }
    const pdf = new jsPDF({ unit: 'mm', format: [page.l, page.h], orientation: format === 'demi' ? 'landscape' : 'portrait' })
    const hauteurImage = (canvas.height * page.l) / canvas.width
    const image = canvas.toDataURL('image/jpeg', 0.92)
    // Contenu plus haut qu'une page : on continue sur les pages suivantes
    for (let decalage = 0, n = 0; decalage < hauteurImage - 0.5; decalage += page.h, n++) {
      if (n > 0) pdf.addPage([page.l, page.h], format === 'demi' ? 'landscape' : 'portrait')
      pdf.addImage(image, 'JPEG', 0, -decalage, page.l, hauteurImage)
    }
    return pdf.output('blob')
  } finally {
    conteneur.remove()
  }
}

/** Numéro au format international pour WhatsApp (chiffres seuls), ou null */
export function numeroWhatsApp(telephone: string | null | undefined, indicatif: string): string | null {
  if (!telephone) return null
  // Premier numéro si plusieurs (« 22 33 44 55 / 46 00 00 00 »)
  let n = telephone.split('/')[0].replace(/[^\d+]/g, '')
  if (n.startsWith('+')) n = n.slice(1)
  else if (n.startsWith('00')) n = n.slice(2)
  else if (indicatif && !n.startsWith(indicatif)) n = indicatif.replace(/\D/g, '') + n
  return n.length >= 8 ? n : null
}

async function blobEnBase64(blob: Blob): Promise<string> {
  const octets = new Uint8Array(await blob.arrayBuffer())
  let binaire = ''
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  return btoa(binaire)
}

export type ResultatPartage = 'partage' | 'annule' | 'telecharge'

/**
 * Envoie le PDF : feuille de partage (téléphone, application) ou téléchargement
 * + WhatsApp Web (ordinateur).
 */
export async function partagerPdf(options: {
  pdf: Blob
  nomFichier: string
  titre: string
  message: string
  numero: string | null
}): Promise<ResultatPartage> {
  const { pdf, nomFichier, titre, message, numero } = options

  if (estApplicationNative()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const fichier = await Filesystem.writeFile({ path: nomFichier, data: await blobEnBase64(pdf), directory: Directory.Cache })
    try {
      await Share.share({ title: titre, text: message, files: [fichier.uri], dialogTitle: 'Envoyer le document' })
      return 'partage'
    } catch {
      return 'annule'
    }
  }

  const fichier = new File([pdf], nomFichier, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: titre, text: message })
      return 'partage'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'annule'
      // Partage refusé par le navigateur : on passe au téléchargement
    }
  }

  telecharger(pdf, nomFichier)
  const lien = numero ? `https://wa.me/${numero}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`
  window.open(lien, '_blank', 'noopener')
  return 'telecharge'
}

/** Enregistre un fichier : téléchargement (navigateur) ou feuille de partage (application Android) */
export async function enregistrerFichier(blob: Blob, nomFichier: string, titre: string) {
  if (!estApplicationNative()) return telecharger(blob, nomFichier)
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  const fichier = await Filesystem.writeFile({ path: nomFichier, data: await blobEnBase64(blob), directory: Directory.Cache })
  await Share.share({ title: titre, files: [fichier.uri], dialogTitle: 'Enregistrer ou envoyer le fichier' }).catch(() => {})
}

export function telecharger(blob: Blob, nomFichier: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Nom de fichier sans caractères gênants : « DEV-2026-0007 Société Générale.pdf » */
export const nomDeFichier = (numero: string, client: string) =>
  `${numero} ${client}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) + '.pdf'
