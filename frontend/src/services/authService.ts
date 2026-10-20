import { api, initialiserCSRF } from '../lib/api'
import type {
  IdentifiantsConnexion,
  ReponseConnexion,
  Utilisateur,
} from '../types/auth'

/**
 * Connecte un utilisateur via son IM.
 * L'administrateur technique sans fiche de personnel
 * peut utiliser son username selon la règle du backend.
 *
 * Les jetons JWT restent dans les cookies HttpOnly.
 */
export async function connecter(
  identifiants: IdentifiantsConnexion,
): Promise<Utilisateur> {
  await initialiserCSRF()

  const { data } = await api.post<ReponseConnexion>(
    '/auth/session/connexion/',
    identifiants,
  )

  return data.utilisateur
}

/**
 * Récupère le profil de l'utilisateur connecté.
 */
export async function obtenirProfil(): Promise<Utilisateur> {
  const { data } = await api.get<Utilisateur>('/auth/moi/')
  return data
}

/**
 * Renouvelle la session à partir du cookie men_refresh.
 * Aucun JWT n'est récupéré dans le corps de la réponse.
 */
export async function rafraichirSession(): Promise<void> {
  await initialiserCSRF()
  await api.post('/auth/session/rafraichir/')
}

/**
 * Révoque la session côté serveur et expire les cookies.
 */
export async function deconnecter(): Promise<void> {
  await initialiserCSRF()
  await api.post('/auth/session/deconnexion/')
}