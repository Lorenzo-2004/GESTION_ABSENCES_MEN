import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useAuth } from '../contexts/useAuth'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { utilisateur, chargement } = useAuth()

  if (chargement) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">
          Chargement de votre espace...
        </p>
      </main>
    )
  }

  if (!utilisateur) {
    return <Navigate to="/connexion" replace />
  }

  return children
}
