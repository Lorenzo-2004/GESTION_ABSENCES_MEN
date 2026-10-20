import { createContext } from 'react'
import type {
  IdentifiantsConnexion,
  Utilisateur,
} from '../types/auth'

export interface AuthContextValue {
  utilisateur: Utilisateur | null
  chargement: boolean
  connecter: (identifiants: IdentifiantsConnexion) => Promise<void>
  deconnecter: () => Promise<void>
  actualiserProfil: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)