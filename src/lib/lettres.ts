// Montants en toutes lettres, pour la mention « Arrêté le présent devis à la somme de … »
// Règles : « et un » (21, 31… 71), « quatre-vingts » et « deux cents » au pluriel
// seulement en fin de nombre ou devant million / milliard, « mille » invariable.

const UNITES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
]
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

function moinsDeCent(n: number, final: boolean): string {
  if (n < 20) return UNITES[n]
  const d = Math.floor(n / 10)
  const u = n % 10
  // 70-79 et 90-99 : soixante / quatre-vingt + 10 à 19
  if (d === 7 || d === 9) return DIZAINES[d] + (d === 7 && u === 1 ? ' et ' : '-') + UNITES[10 + u]
  if (u === 0) return d === 8 && final ? 'quatre-vingts' : DIZAINES[d]
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`
  return `${DIZAINES[d]}-${UNITES[u]}`
}

// final : rien ne suit (ou suit un nom : million, milliard) → accord de « cents » / « vingts »
function moinsDeMille(n: number, final: boolean): string {
  const c = Math.floor(n / 100)
  const r = n % 100
  const parties: string[] = []
  if (c > 0) parties.push(c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 && final ? 's' : ''}`)
  if (r > 0) parties.push(moinsDeCent(r, final))
  return parties.join(' ')
}

export function nombreEnLettres(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'zéro'
  const milliards = Math.floor(n / 1e9)
  const millions = Math.floor(n / 1e6) % 1000
  const milliers = Math.floor(n / 1000) % 1000
  const reste = n % 1000

  const parties: string[] = []
  if (milliards) parties.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? 's' : ''}`)
  if (millions) parties.push(`${moinsDeMille(millions, true)} million${millions > 1 ? 's' : ''}`)
  if (milliers) parties.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`)
  if (reste) parties.push(moinsDeMille(reste, true))
  return parties.join(' ')
}

const NOMS_DEVISES: Record<string, [string, string]> = {
  MRU: ['ouguiya', 'ouguiyas'],
  XOF: ['franc CFA', 'francs CFA'],
  XAF: ['franc CFA', 'francs CFA'],
  EUR: ['euro', 'euros'],
  USD: ['dollar', 'dollars'],
  MAD: ['dirham', 'dirhams'],
  DZD: ['dinar algérien', 'dinars algériens'],
  TND: ['dinar tunisien', 'dinars tunisiens'],
  GNF: ['franc guinéen', 'francs guinéens'],
}

export function montantEnLettres(montant: number, devise: string): string {
  const centimes = Math.round(Math.abs(montant) * 100)
  const entier = Math.floor(centimes / 100)
  const decimales = centimes % 100
  const [singulier, pluriel] = NOMS_DEVISES[devise] ?? [devise, devise]
  let texte = `${nombreEnLettres(entier)} ${entier > 1 ? pluriel : singulier}`.trim()
  // « de » devant le nom de la devise après million(s) / milliard(s) rond(s)
  if (entier >= 1e6 && entier % 1e6 === 0) {
    const de = /^[aeiouyéèh]/i.test(pluriel) ? 'd’' : 'de '
    texte = texte.replace(/(millions?|milliards?) /, `$1 ${de}`)
  }
  if (decimales) texte += ` et ${nombreEnLettres(decimales)} centime${decimales > 1 ? 's' : ''}`
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}
