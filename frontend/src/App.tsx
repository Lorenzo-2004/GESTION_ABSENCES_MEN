import { Navigate, Route, Routes } from 'react-router'

import { LoginPage } from './pages/LoginPage'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { useAuth } from './contexts/useAuth'
import type { Role } from './types/auth'

import { ProfilAgentPage } from './pages/agent/ProfilAgentPage'
import { MesDemandesPage } from './pages/agent/MesDemandesPage'
import { NouvelleDemandePage } from './pages/agent/NouvelleDemandePage'
import { MesSoldesPage } from './pages/agent/MesSoldesPage'
import { HistoriqueCongesPage } from './pages/agent/HistoriqueCongesPage'

import { DashboardChefServicePage } from './pages/chef-service/DashboardChefServicePage'
import { PlanningServicePage } from './pages/chef-service/PlanningServicePage'
import { PersonnelsServicePage } from './pages/chef-service/PersonnelsServicePage'

import { AdminComptesPage } from './pages/admin/AdminComptesPage'
import { DecisionsRHPage } from './pages/rh/DecisionsRHPage'
import { DashboardDirecteurPage } from './pages/directeur/DashboardDirecteurPage'

function accueilSelonRole(role: Role): string {
  switch (role) {
    case 'ROLE_AGENT':
      return '/app/agent/profil'

    case 'ROLE_CHEF_SERVICE':
      return '/app/chef-service'

    case 'ROLE_DIRECTEUR':
      return '/app/directeur'

    case 'ROLE_RH':
      return '/app/rh'

    case 'ROLE_ADMIN':
      return '/app/admin/comptes'

    default:
      return '/403'
  }
}

function ChargementPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700" />
        <span>Chargement de votre espace...</span>
      </div>
    </main>
  )
}

function RedirectionAccueil() {
  const { utilisateur, chargement } = useAuth()

  if (chargement) {
    return <ChargementPage />
  }

  if (!utilisateur) {
    return <Navigate to="/connexion" replace />
  }

  return (
    <Navigate
      to={accueilSelonRole(utilisateur.role)}
      replace
    />
  )
}

function AccesRefusePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Accès non autorisé
        </h1>

        <p className="mt-3 text-sm text-slate-600">
          Votre compte ne possède pas de rôle reconnu pour cet espace.
        </p>

        <button
          type="button"
          onClick={() => {
            window.location.href = '/connexion'
          }}
          className="mt-6 rounded-lg bg-[#1B1BFF] px-4 py-2 text-sm font-medium text-white hover:bg-[#1515D8]"
        >
          Retour à la connexion
        </button>
      </section>
    </main>
  )
}

function AdminSeulement() {
  const { utilisateur, chargement } = useAuth()

  if (chargement) {
    return <ChargementPage />
  }

  if (!utilisateur) {
    return <Navigate to="/connexion" replace />
  }

  if (utilisateur.role !== 'ROLE_ADMIN') {
    return (
      <Navigate
        to={accueilSelonRole(utilisateur.role)}
        replace
      />
    )
  }

  return <AdminComptesPage />
}

function App() {
  return (
    <Routes>
      {/* Redirections générales */}
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/connexion" element={<LoginPage />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <RedirectionAccueil />
          </ProtectedRoute>
        }
      />

      {/* Espace agent */}
      <Route
        path="/app/agent/profil"
        element={
          <ProtectedRoute>
            <ProfilAgentPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app/agent/mes-demandes"
        element={
          <ProtectedRoute>
            <MesDemandesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app/agent/nouvelle-demande"
        element={
          <ProtectedRoute>
            <NouvelleDemandePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app/agent/soldes"
        element={
          <ProtectedRoute>
            <MesSoldesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app/agent/historique"
        element={
          <ProtectedRoute>
            <HistoriqueCongesPage />
          </ProtectedRoute>
        }
      />

      {/* Espace chef de service */}
      <Route
        path="/app/chef-service"
        element={
          <ProtectedRoute>
            <DashboardChefServicePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app/chef-service/planning"
        element={
          <ProtectedRoute>
            <PlanningServicePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app/chef-service/nouvelle-demande"
        element={
          <ProtectedRoute>
            <NouvelleDemandePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app/chef-service/personnel"
        element={
          <ProtectedRoute>
            <PersonnelsServicePage />
          </ProtectedRoute>
        }
      />

      {/* Espace directeur */}
      <Route
        path="/app/directeur"
        element={
          <ProtectedRoute>
            <DashboardDirecteurPage />
          </ProtectedRoute>
        }
      />

      {/* Espace ressources humaines */}
      <Route
        path="/app/rh"
        element={
          <ProtectedRoute>
            <DecisionsRHPage />
          </ProtectedRoute>
        }
      />

      {/* Espace administrateur */}
      <Route
        path="/app/admin/comptes"
        element={
          <ProtectedRoute>
            <AdminSeulement />
          </ProtectedRoute>
        }
      />

      {/* Accès refusé et routes inconnues */}
      <Route path="/403" element={<AccesRefusePage />} />

      <Route
        path="*"
        element={<Navigate to="/app" replace />}
      />
    </Routes>
  )
}

export default App
