import { useContext } from 'react'
import { AuthContext } from './auth-context'
import type { AuthContextValue } from './auth-context'

export function useAuth(): AuthContextValue {
  const contexte = useContext(AuthContext)

  if (contexte === null) {
    throw new Error(
      'useAuth doit être utilisé à l’intérieur de AuthProvider.',
    )
  }

  return contexte
}