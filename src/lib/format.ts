// Mise en forme des nombres et montants à la française (espace des milliers, virgule décimale)

const formatMontant = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formaterMontant(montant: number, devise: string): string {
  const texte = formatMontant.format(montant)
  return devise ? `${texte} ${devise}` : texte
}
