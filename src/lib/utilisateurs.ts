import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Role, Utilisateur } from './types'

const FONCTION = 'gerer-utilisateurs'

export async function listerUtilisateurs(): Promise<Utilisateur[]> {
  const { data, error } = await supabase.rpc('liste_utilisateurs')
  if (error) {
    if (error.code === 'PGRST202' || error.message.includes('liste_utilisateurs')) {
      throw new Error('La fonction liste_utilisateurs est absente : exécutez sql/02_utilisateurs.sql dans Supabase.')
    }
    throw new Error(error.message)
  }
  return (data ?? []) as Utilisateur[]
}

export async function modifierProfil(id: string, champs: { nom_complet: string; role: Role; actif: boolean }) {
  const { error } = await supabase.from('profils').update(champs).eq('id', id)
  if (error) throw new Error(error.message)
}

// Appel de l'Edge Function (opérations nécessitant la clé service_role)
async function appelerFonction(corps: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(FONCTION, { body: corps })
  if (!error) return data

  if (error instanceof FunctionsHttpError) {
    const reponse = error.context as Response
    if (reponse.status === 404) {
      throw new Error(`La fonction « ${FONCTION} » n'est pas déployée sur Supabase.`)
    }
    // La fonction renvoie { erreur: "message en français" }
    const json = await reponse.json().catch(() => null)
    throw new Error(json?.erreur ?? error.message)
  }
  if (error instanceof FunctionsFetchError) {
    throw new Error(`Service de gestion des comptes injoignable (fonction « ${FONCTION} » déployée ?).`)
  }
  throw new Error(error.message)
}

export function creerUtilisateur(params: { email: string; nomComplet: string; role: Role; motDePasse: string }) {
  return appelerFonction({ action: 'creer', ...params })
}

export function reinitialiserMotDePasse(userId: string, motDePasse: string) {
  return appelerFonction({ action: 'reinitialiser_mot_de_passe', userId, motDePasse })
}

// Mot de passe provisoire lisible (sans 0/O, 1/l/I) à transmettre oralement ou par écrit
export function genererMotDePasse(longueur = 10): string {
  const caracteres = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const aleatoire = crypto.getRandomValues(new Uint32Array(longueur))
  return Array.from(aleatoire, (n) => caracteres[n % caracteres.length]).join('')
}
