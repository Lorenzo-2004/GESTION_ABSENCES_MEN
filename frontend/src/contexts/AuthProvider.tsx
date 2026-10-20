import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import axios from 'axios'
import type { ReactNode } from 'react'

import { AuthContext } from './auth-context'

import {
  connecter as connecterService,
  deconnecter as deconnecterService,
  obtenirProfil,
  rafraichirSession,
} from '../services/authService'

import type {
  IdentifiantsConnexion,
  Utilisateur,
} from '../types/auth'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    let actif = true

    async function initialiserSession() {
      let profil: Utilisateur | null = null

      try {
        profil = await obtenirProfil()
      } catch (erreur) {
        const codeHTTP = axios.isAxiosError(erreur)
          ? erreur.response?.status
          : undefined

        if (codeHTTP === 401) {
          try {
            await rafraichirSession()
            profil = await obtenirProfil()
          } catch {
            profil = null
          }
        }
      }

      if (actif) {
        setUtilisateur(profil)
        setChargement(false)
      }
    }

    void initialiserSession()

    return () => {
      actif = false
    }
  }, [])

  const connecter = useCallback(
    async (identifiants: IdentifiantsConnexion): Promise<void> => {
      const profil = await connecterService(identifiants)
      setUtilisateur(profil)
    },
    [],
  )

  const deconnecter = useCallback(async (): Promise<void> => {
    try {
      await deconnecterService()
    } finally {
      setUtilisateur(null)
    }
  }, [])

  const actualiserProfil = useCallback(async (): Promise<void> => {
    const profil = await obtenirProfil()
    setUtilisateur(profil)
  }, [])

  const valeur = useMemo(
    () => ({
      utilisateur,
      chargement,
      connecter,
      deconnecter,
      actualiserProfil,
    }),
    [
      utilisateur,
      chargement,
      connecter,
      deconnecter,
      actualiserProfil,
    ],
  )

  return (
    <AuthContext.Provider value={valeur}>
      {children}
    </AuthContext.Provider>
  )
}