// Edge Function Supabase « gerer-utilisateurs »
// Opérations qui exigent la clé service_role (jamais exposée dans l'application) :
//   - creer : crée un compte (e-mail confirmé d'office) et son profil actif
//   - reinitialiser_mot_de_passe : définit un nouveau mot de passe provisoire
// Seul un gérant actif peut l'appeler.
//
// Déploiement : Supabase > Edge Functions > Deploy a new function > Via Editor,
// nom « gerer-utilisateurs », coller ce fichier. (ou : npx supabase functions deploy gerer-utilisateurs)

import { createClient } from 'npm:@supabase/supabase-js@2'

const ROLES = ['gerant', 'accueil', 'atelier', 'compta']
const LONGUEUR_MIN_MOT_DE_PASSE = 8

const enTetesCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reponse(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...enTetesCors, 'Content-Type': 'application/json' },
  })
}

const erreur = (message: string, statut = 400) => reponse({ erreur: message }, statut)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: enTetesCors })
  if (req.method !== 'POST') return erreur('Méthode non autorisée.', 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Identifier l'appelant à partir de son jeton de session
  const jeton = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jeton) return erreur('Non connecté.', 401)
  const { data: auth, error: erreurAuth } = await admin.auth.getUser(jeton)
  if (erreurAuth || !auth.user) return erreur('Session invalide, reconnectez-vous.', 401)

  const { data: appelant } = await admin.from('profils').select('role, actif').eq('id', auth.user.id).maybeSingle()
  if (!appelant?.actif || appelant.role !== 'gerant') return erreur('Action réservée au gérant.', 403)

  // 2. Exécuter l'action demandée
  let corps: Record<string, unknown>
  try {
    corps = await req.json()
  } catch {
    return erreur('Requête invalide.')
  }

  const motDePasse = String(corps.motDePasse ?? '')
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return erreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`)
  }

  switch (corps.action) {
    case 'creer': {
      const email = String(corps.email ?? '').trim().toLowerCase()
      const nomComplet = String(corps.nomComplet ?? '').trim()
      const role = String(corps.role ?? '')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erreur('Adresse e-mail invalide.')
      if (!nomComplet) return erreur('Le nom est obligatoire.')
      if (!ROLES.includes(role)) return erreur('Rôle invalide.')

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: motDePasse,
        email_confirm: true,
        user_metadata: { nom_complet: nomComplet },
      })
      if (error || !data.user) {
        const existe = error?.message.toLowerCase().includes('already')
        return erreur(existe ? 'Un compte existe déjà avec cet e-mail.' : `Création impossible : ${error?.message}`)
      }

      // Le profil est créé par le déclencheur trg_nouvel_utilisateur (inactif, rôle atelier) :
      // on le complète et on l'active directement.
      const { error: erreurProfil } = await admin
        .from('profils')
        .upsert({ id: data.user.id, nom_complet: nomComplet, role, actif: true })
      if (erreurProfil) return erreur(`Compte créé, mais profil non mis à jour : ${erreurProfil.message}`, 500)

      return reponse({ id: data.user.id })
    }

    case 'reinitialiser_mot_de_passe': {
      const userId = String(corps.userId ?? '')
      if (!userId) return erreur('Utilisateur manquant.')
      const { error } = await admin.auth.admin.updateUserById(userId, { password: motDePasse })
      if (error) return erreur(`Réinitialisation impossible : ${error.message}`)
      return reponse({ ok: true })
    }

    default:
      return erreur('Action inconnue.')
  }
})
