import { useState, type FormEvent } from 'react'
import { formaterMontant } from '../lib/format'
import {
  DEFINITIONS_PARAMETRES,
  DEVISES_COURANTES,
  SECTIONS_PARAMETRES,
  enregistrerParametres,
  normaliser,
  type CleParametre,
  type DefinitionParametre,
  type Parametres as ValeursParametres,
} from '../lib/parametres'
import { useParametres } from '../parametres/ParametresContext'

export default function Parametres() {
  const { parametres, erreur, recharger } = useParametres()

  if (erreur) return <p className="alerte alerte-erreur" role="alert">{erreur}</p>
  if (!parametres) return <p className="texte-doux">Chargement…</p>

  return <FormulaireParametres initial={parametres} onEnregistre={recharger} />
}

function FormulaireParametres({ initial, onEnregistre }: { initial: ValeursParametres; onEnregistre: () => void }) {
  const [valeurs, setValeurs] = useState<ValeursParametres>(initial)
  const [reference, setReference] = useState<ValeursParametres>(initial)
  const [erreurs, setErreurs] = useState<Partial<Record<CleParametre, string>>>({})
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null)

  const modifie = DEFINITIONS_PARAMETRES.some((d) => valeurs[d.cle] !== reference[d.cle])

  function changer(cle: CleParametre, valeur: string) {
    setValeurs((v) => ({ ...v, [cle]: valeur }))
    setErreurs((e) => ({ ...e, [cle]: undefined }))
    setMessage(null)
  }

  async function valider(e: FormEvent) {
    e.preventDefault()
    setMessage(null)

    const nouvellesErreurs: Partial<Record<CleParametre, string>> = {}
    const normalisees = { ...valeurs }
    for (const def of DEFINITIONS_PARAMETRES) {
      const resultat = normaliser(def, valeurs[def.cle])
      if ('erreur' in resultat) nouvellesErreurs[def.cle] = resultat.erreur
      else normalisees[def.cle] = resultat.valeur
    }
    setErreurs(nouvellesErreurs)
    if (Object.keys(nouvellesErreurs).length > 0) {
      setMessage({ type: 'erreur', texte: 'Corrigez les champs signalés.' })
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }

    // N'envoyer que ce qui a changé (ou n'existe pas encore en base)
    const aEnregistrer: Partial<ValeursParametres> = {}
    for (const def of DEFINITIONS_PARAMETRES) {
      if (normalisees[def.cle] !== reference[def.cle]) aEnregistrer[def.cle] = normalisees[def.cle]
    }

    setEnvoi(true)
    try {
      await enregistrerParametres(aEnregistrer)
      setValeurs(normalisees)
      setReference(normalisees)
      setMessage({ type: 'succes', texte: 'Paramètres enregistrés.' })
      onEnregistre()
    } catch (err) {
      setMessage({ type: 'erreur', texte: (err as Error).message })
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form className="formulaire page-parametres" onSubmit={valider} noValidate>
      {SECTIONS_PARAMETRES.map((section) => (
        <section key={section.titre} className="carte">
          <h2 className="titre-carte">{section.titre}</h2>
          <p className="texte-doux petit">{section.description}</p>
          <div className="grille-champs">
            {section.champs.map((def) => (
              <Champ
                key={def.cle}
                def={def}
                valeur={valeurs[def.cle]}
                erreur={erreurs[def.cle]}
                onChange={(v) => changer(def.cle, v)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="barre-enregistrement">
        {message && (
          <p className={`alerte ${message.type === 'succes' ? 'alerte-succes' : 'alerte-erreur'}`} role="status">
            {message.texte}
          </p>
        )}
        <span className="espace" />
        <button type="submit" className="bouton bouton-principal" disabled={envoi || !modifie}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

function Champ({
  def,
  valeur,
  erreur,
  onChange,
}: {
  def: DefinitionParametre
  valeur: string
  erreur?: string
  onChange: (v: string) => void
}) {
  const idAide = `aide-${def.cle}`
  const proprietes = {
    id: def.cle,
    value: valeur,
    required: def.obligatoire,
    'aria-invalid': erreur ? true : undefined,
    'aria-describedby': def.aide || erreur ? idAide : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  }

  let saisie
  switch (def.type) {
    case 'texte_long':
      saisie = <textarea rows={3} {...proprietes} />
      break
    case 'nombre':
    case 'entier':
      saisie = (
        <span className="champ-suffixe">
          <input inputMode={def.type === 'entier' ? 'numeric' : 'decimal'} {...proprietes} />
          {def.suffixe && <span>{def.suffixe}</span>}
        </span>
      )
      break
    case 'devise':
      saisie = (
        <>
          <input list="liste-devises" maxLength={3} className="champ-court majuscules" {...proprietes} />
          <datalist id="liste-devises">
            {DEVISES_COURANTES.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </>
      )
      break
    case 'email':
      saisie = <input type="email" inputMode="email" {...proprietes} />
      break
    case 'telephone':
      saisie = <input type="tel" inputMode="tel" {...proprietes} />
      break
    default:
      saisie = <input {...proprietes} />
  }

  const apercuDevise = def.type === 'devise' && /^[A-Za-z]{3}$/.test(valeur.trim())

  return (
    <label className={def.type === 'texte_long' ? 'champ-large' : undefined} htmlFor={def.cle}>
      <span>
        {def.libelle}
        {def.obligatoire && <span className="obligatoire" aria-hidden="true"> *</span>}
      </span>
      {saisie}
      <small id={idAide} className={erreur ? 'texte-erreur' : 'texte-doux'}>
        {erreur ??
          (apercuDevise ? `Exemple : ${formaterMontant(12500, valeur.trim().toUpperCase())}` : def.aide)}
      </small>
    </label>
  )
}
