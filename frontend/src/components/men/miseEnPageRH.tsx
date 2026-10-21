import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../contexts/useAuth'
import { Icon, StylesMEN, type IconName } from './ui'
import { delai } from './ui-outils'

const FOND_PAGE = '#FAFAF8'

const FOND_SIDEBAR =
  'bg-gradient-to-b from-[#1B1BFF] via-[#1B1BFF] to-[#1B1BFF] text-white shadow-[0_24px_48px_-24px_rgba(7,44,67,0.6)] ring-1 ring-white/10'

const CLE_REPLIE = 'men-sidebar-replie'

const LIBELLES_ROLES: Record<string, string> = {
  ROLE_AGENT: 'Agent',
  ROLE_CHEF_SERVICE: 'Chef de service',
  ROLE_DIRECTEUR: 'Directeur',
  ROLE_RH: 'Ressources humaines',
  ROLE_ADMIN: 'Administrateur',
}

export type VueRH = 'apercu' | 'decisions' | 'reports'
export type VueAgent =
  | 'apercu'
  | 'demandes'
  | 'nouvelle-demande'
  | 'soldes'
  | 'historique'
  | 'profil'
export type VueService =
  | 'apercu'
  | 'demandes'
  | 'personnels'
  | 'planning'
  | 'nouvelle-demande'
export type VueDirecteur = 'apercu' | 'demandes'
export type VueAdmin = 'comptes'

interface ElementNav<V extends string> {
  cle: V
  id?: string
  libelle: string
  icone: IconName
  chemin?: string
}

interface Aide {
  titre: string
  texte: string
}

interface Profil {
  nom: string
  role: string
}

interface PropsEspace<V extends string> {
  vue: V
  onVue: (vue: V) => void
  badges?: Partial<Record<V, number>>
  titre: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

function Initiales({ nom, className = '' }: { nom: string; className?: string }) {
  const lettres =
    nom.split(/\s+/).filter(Boolean).slice(0, 2).map((mot) => mot[0]?.toUpperCase()).join('') || '?'

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-white/15 font-semibold text-white ring-1 ring-inset ring-white/25 ${className}`}
    >
      {lettres}
    </span>
  )
}

function Navigation<V extends string>({
  elements, vue, onVue, badges, espace, profil, onSortie, sortieEnCours, apresChoix, replie = false, onBasculer,
}: {
  elements: ElementNav<V>[]
  vue: V
  onVue: (vue: V) => void
  badges?: Partial<Record<V, number>>
  espace: string
  profil?: Profil
  onSortie: () => void
  sortieEnCours: boolean
  apresChoix?: () => void
  replie?: boolean
  onBasculer?: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()

  const boutonSortie = (
    <button
      type="button"
      onClick={onSortie}
      disabled={sortieEnCours}
      aria-label="Se déconnecter"
      title="Se déconnecter"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/70 transition-colors duration-200 hover:bg-rose-500/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50"
    >
      <Icon name={sortieEnCours ? 'loader' : 'logout'} className={`h-[18px] w-[18px] ${sortieEnCours ? 'animate-spin' : ''}`} />
    </button>
  )

  return (
    <div className="relative flex h-full flex-col">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <svg viewBox="0 0 300 300" className="absolute -bottom-24 -left-24 h-72 w-72 text-white">
          <g fill="none" stroke="currentColor">
            <circle cx="150" cy="150" r="140" strokeOpacity=".05" />
            <circle cx="150" cy="150" r="105" strokeOpacity=".06" />
            <circle cx="150" cy="150" r="70" strokeOpacity=".08" />
          </g>
        </svg>
        <span className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#00FF9C]/10 blur-3xl" />
      </div>

      <div
        className={`men-rise relative flex pb-4 ${
          replie ? 'flex-col items-center gap-3 px-3 pt-5' : 'items-center justify-between gap-3 px-5 pt-6'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white p-1.5 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.5)]">
            <img src="/LOGOMEN.jpg" alt="Logo MEN" className="h-full w-full rounded-lg object-contain" />
          </span>
          {!replie && (
            <div className="men-fade min-w-0 leading-none">
              <p className="men-serif text-xl">MEN</p>
              <p className="mt-1.5 truncate text-[11px] text-white/55">{espace}</p>
            </div>
          )}
        </div>

        {onBasculer && (
          <button
            type="button"
            onClick={onBasculer}
            aria-label={replie ? 'Déplier le menu' : 'Replier le menu'}
            aria-expanded={!replie}
            title={replie ? 'Déplier (Ctrl+B)' : 'Replier (Ctrl+B)'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.08] text-white/80 transition-colors duration-200 hover:bg-white/[0.16] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Icon name={replie ? 'right' : 'left'} className="h-4 w-4" />
          </button>
        )}
      </div>

      <span aria-hidden="true" className={`relative mb-3 h-px bg-white/10 ${replie ? 'mx-4' : 'mx-5'}`} />

      <nav
        aria-label="Navigation principale"
        className={`relative flex-1 px-3 ${replie ? 'overflow-visible' : 'overflow-y-auto'}`}
      >
        <ul className="space-y-1">
          {elements.map((item, index) => {
            const entreesMemeRoute = item.chemin ? elements.filter((e) => e.chemin === item.chemin) : []
            const actif = item.chemin
              ? location.pathname === item.chemin && (entreesMemeRoute.length === 1 || item.cle === vue)
              : item.cle === vue
            const badge = badges?.[item.cle]
            const aBadge = badge !== undefined && badge > 0

            return (
              <li key={item.id ?? item.cle} className="men-rise" style={delai(120 + index * 45)}>
                <button
                  type="button"
                  aria-current={actif ? 'page' : undefined}
                  aria-label={replie ? item.libelle : undefined}
                  onClick={() => {
                    onVue(item.cle)
                    if (item.chemin && location.pathname !== item.chemin) navigate(item.chemin)
                    apresChoix?.()
                  }}
                  className={`group relative flex w-full items-center rounded-2xl p-1.5 text-left text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                    replie ? 'justify-center' : 'gap-3 pr-3'
                  } ${
                    actif
                      ? 'bg-gradient-to-r from-white/[0.16] to-white/[0.04] text-white ring-1 ring-inset ring-white/15'
                      : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <span
                    className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all duration-300 ${
                      actif
                        ? 'bg-[#00FF9C] text-[#1B1BFF] shadow-[0_8px_16px_-8px_rgba(124,196,228,0.9)]'
                        : 'bg-white/[0.07] text-white/70 group-hover:bg-white/[0.13] group-hover:text-white'
                    }`}
                  >
                    <Icon name={item.icone} className="h-[18px] w-[18px]" />
                    {replie && aBadge && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-[#1B1BFF]/25" />
                    )}
                  </span>

                  {!replie && (
                    <>
                      <span className="men-fade flex-1 truncate">{item.libelle}</span>
                      {aBadge && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                            actif ? 'bg-white text-[#1B1BFF]' : 'bg-amber-400 text-[#3b2a00]'
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </>
                  )}

                  {replie && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-full top-1/2 z-50 ml-4 flex -translate-y-1/2 translate-x-1 items-center gap-2 whitespace-nowrap rounded-lg bg-[#1B1BFF] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                    >
                      {item.libelle}
                      {aBadge && (
                        <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-[#3b2a00]">{badge}</span>
                      )}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {profil && (
        <div
          className={`men-rise relative m-3 rounded-2xl border border-white/10 bg-white/[0.06] ${
            replie ? 'flex flex-col items-center gap-2 p-2' : 'flex items-center gap-3 p-2.5'
          }`}
          style={delai(120 + elements.length * 45 + 60)}
        >
          <Initiales nom={profil.nom} className="h-10 w-10 text-sm" />
          {!replie && (
            <div className="men-fade min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{profil.nom}</p>
              <p className="mt-0.5 truncate text-xs text-white/60">{profil.role}</p>
            </div>
          )}
          {boutonSortie}
        </div>
      )}
    </div>
  )
}

interface CoquilleProps<V extends string> extends PropsEspace<V> {
  espace: string
  elements: ElementNav<V>[]
  aide?: Aide
}

function Coquille<V extends string>({
  espace, elements, vue, onVue, badges, titre, description, actions, children,
}: CoquilleProps<V>) {
  const { utilisateur, deconnecter } = useAuth()
  const naviguer = useNavigate()
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [sortieEnCours, setSortieEnCours] = useState(false)
  const [replie, setReplie] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CLE_REPLIE) === '1'
    } catch {
      return false
    }
  })

  const profil: Profil | undefined = utilisateur
    ? {
        nom: utilisateur.personnel?.nom_complet || utilisateur.username,
        role: LIBELLES_ROLES[utilisateur.role] ?? utilisateur.role,
      }
    : undefined

  useEffect(() => {
    try {
      localStorage.setItem(CLE_REPLIE, replie ? '1' : '0')
    } catch {
      /* stockage indisponible : on ignore */
    }
  }, [replie])

  useEffect(() => {
    function surTouche(evenement: KeyboardEvent) {
      if (!(evenement.ctrlKey || evenement.metaKey) || evenement.key.toLowerCase() !== 'b') return
      const cible = evenement.target as HTMLElement | null
      if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable)) return
      evenement.preventDefault()
      setReplie((v) => !v)
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [])

  useEffect(() => {
    if (!menuOuvert) return
    function surTouche(evenement: KeyboardEvent) {
      if (evenement.key === 'Escape') setMenuOuvert(false)
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [menuOuvert])

  async function sortir() {
    if (sortieEnCours) return
    setSortieEnCours(true)
    try {
      await deconnecter()
    } catch (cause) {
      console.error('Erreur pendant la déconnexion :', cause)
    } finally {
      naviguer('/connexion', { replace: true })
    }
  }

  const dateDuJour = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())

  const propsNavigation = {
    elements, vue, onVue, badges, espace, profil,
    onSortie: () => void sortir(),
    sortieEnCours,
  }

  return (
    <div
      className="relative min-h-screen font-sans text-[#0A0A0A] antialiased"
      style={{ backgroundColor: FOND_PAGE }}
    >
      <StylesMEN />

      <aside
        className={`fixed bottom-3 left-3 top-3 z-30 hidden rounded-[28px] transition-[width] duration-300 ease-[cubic-bezier(.22,1,.36,1)] lg:block ${
          replie ? 'w-[84px]' : 'w-64'
        } ${FOND_SIDEBAR}`}
      >
        <Navigation {...propsNavigation} replie={replie} onBasculer={() => setReplie((v) => !v)} />
      </aside>

      {menuOuvert && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setMenuOuvert(false)}
            className="men-fade absolute inset-0 bg-[#1B1BFF]/55 backdrop-blur-sm"
          />
          <aside
            className={`men-slide absolute inset-y-2 left-2 flex w-72 max-w-[85vw] flex-col overflow-y-auto rounded-[28px] ${FOND_SIDEBAR}`}
          >
            <Navigation {...propsNavigation} apresChoix={() => setMenuOuvert(false)} />
          </aside>
        </div>
      )}

      <div
        className={`relative z-10 transition-[padding] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
          replie ? 'lg:pl-[108px]' : 'lg:pl-[280px]'
        }`}
      >
        <header className="sticky top-0 z-20 flex min-w-0 flex-wrap items-center gap-2 border-b border-[#E5E5EA] bg-[#FAFAF8]/85 px-3 py-3 backdrop-blur-md sm:flex-nowrap sm:gap-3 sm:px-8 sm:py-4">
          <button
            type="button"
            onClick={() => setMenuOuvert(true)}
            aria-label="Ouvrir le menu"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#E5E5EA] bg-white text-[#0A0A0A] transition hover:bg-[#F0F0FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/25 lg:hidden"
          >
            <Icon name="list" className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="hidden text-xs font-medium capitalize text-[#86868B] sm:block">{dateDuJour}</p>
            <h1
              key={titre}
              className="men-fade men-serif truncate text-2xl font-normal leading-tight tracking-tight text-[#0A0A0A] sm:text-[28px]"
            >
              {titre}
            </h1>
            {description && (
              <p className="hidden truncate text-xs text-[#86868B] md:block">{description}</p>
            )}
          </div>

          {actions && (
            <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
              {actions}
            </div>
          )}
        </header>

        <main className="men-rise mx-auto w-full min-w-0 max-w-[1400px] space-y-6 px-4 pb-8 pt-6 sm:px-6 sm:pb-10 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}

const NAV_RH: ElementNav<VueRH>[] = [
  { cle: 'apercu', libelle: 'Vue d’ensemble RH', icone: 'building' },
  { cle: 'decisions', libelle: 'Décisions RH', icone: 'file' },
  { cle: 'reports', libelle: 'Report des reliquats', icone: 'refresh' },
  { cle: 'apercu', id: 'rh-espace-service', libelle: 'Mon service — Vue d’ensemble', icone: 'building', chemin: '/app/chef-service' },
  { cle: 'decisions', id: 'rh-service-equipe', libelle: 'Mon service — Équipe', icone: 'users', chemin: '/app/chef-service/personnel' },
  { cle: 'reports', id: 'rh-service-planning', libelle: 'Mon service — Planning', icone: 'calendar', chemin: '/app/chef-service/planning' },
  { cle: 'apercu', id: 'rh-agent-profil', libelle: 'Mon profil personnel', icone: 'user', chemin: '/app/agent/profil' },
  { cle: 'decisions', id: 'rh-agent-demandes', libelle: 'Mes demandes', icone: 'file', chemin: '/app/agent/mes-demandes' },
  { cle: 'reports', id: 'rh-agent-nouvelle-demande', libelle: 'Déposer ma demande', icone: 'plus', chemin: '/app/agent/nouvelle-demande' },
  { cle: 'apercu', id: 'rh-agent-soldes', libelle: 'Mes soldes de congé', icone: 'calendar', chemin: '/app/agent/soldes' },
  { cle: 'decisions', id: 'rh-agent-historique', libelle: 'Mon historique', icone: 'list', chemin: '/app/agent/historique' },
]

const NAV_AGENT: ElementNav<VueAgent>[] = [
  { cle: 'apercu', id: 'profil', libelle: 'Mon profil', icone: 'user', chemin: '/app/agent/profil' },
  { cle: 'demandes', id: 'mes-demandes', libelle: 'Mes demandes', icone: 'file', chemin: '/app/agent/mes-demandes' },
  { cle: 'nouvelle-demande', id: 'nouvelle-demande', libelle: 'Nouvelle demande', icone: 'plus', chemin: '/app/agent/nouvelle-demande' },
  { cle: 'soldes', libelle: 'Mes soldes', icone: 'calendar', chemin: '/app/agent/soldes' },
  { cle: 'historique', libelle: 'Historique', icone: 'list', chemin: '/app/agent/historique' },
]

const NAV_SERVICE: ElementNav<VueService>[] = [
  { cle: 'apercu', libelle: 'Vue d’ensemble', icone: 'building', chemin: '/app/chef-service' },
  { cle: 'personnels', libelle: 'Mon équipe', icone: 'users', chemin: '/app/chef-service/personnel' },
  { cle: 'planning', libelle: 'Planning du service', icone: 'calendar', chemin: '/app/chef-service/planning' },
  { cle: 'nouvelle-demande', libelle: 'Demande pour un agent', icone: 'plus', chemin: '/app/chef-service/nouvelle-demande' },
  { cle: 'apercu', id: 'service-agent-profil', libelle: 'Mon profil personnel', icone: 'user', chemin: '/app/agent/profil' },
  { cle: 'demandes', id: 'service-agent-demandes', libelle: 'Mes demandes', icone: 'file', chemin: '/app/agent/mes-demandes' },
  { cle: 'nouvelle-demande', id: 'service-agent-nouvelle-demande', libelle: 'Déposer ma demande personnelle', icone: 'plus', chemin: '/app/agent/nouvelle-demande' },
  { cle: 'planning', id: 'service-agent-soldes', libelle: 'Mes soldes de congé', icone: 'calendar', chemin: '/app/agent/soldes' },
  { cle: 'personnels', id: 'service-agent-historique', libelle: 'Mon historique personnel', icone: 'list', chemin: '/app/agent/historique' },
]

const NAV_DIRECTEUR: ElementNav<VueDirecteur>[] = [
  { cle: 'apercu', libelle: 'Vue d’ensemble', icone: 'building', chemin: '/app/directeur' },
  { cle: 'demandes', libelle: 'Décisions à rendre', icone: 'clock', chemin: '/app/directeur' },
]

const NAV_ADMIN: ElementNav<VueAdmin>[] = [
  { cle: 'comptes', libelle: 'Comptes utilisateurs', icone: 'users' },
]

export function CoquilleRH(props: PropsEspace<VueRH>) {
  const { utilisateur } = useAuth()
  const serviceDisponible = utilisateur?.personnel?.service != null
  const elements = serviceDisponible
    ? NAV_RH
    : NAV_RH.filter((element) => !['rh-espace-service', 'rh-service-equipe', 'rh-service-planning'].includes(element.id ?? ''))

  return <Coquille<VueRH> {...props} espace="Espace RH" elements={elements} />
}

export function CoquilleAgent(props: PropsEspace<VueAgent>) {
  const { utilisateur } = useAuth()
  const elements: ElementNav<VueAgent>[] = [...NAV_AGENT]

  if (utilisateur?.role === 'ROLE_CHEF_SERVICE') {
    elements.push({ cle: 'apercu', id: 'retour-espace-chef', libelle: 'Retour à mon espace Chef de service', icone: 'building', chemin: '/app/chef-service' })
  } else if (utilisateur?.role === 'ROLE_RH') {
    elements.push({ cle: 'apercu', id: 'retour-espace-rh', libelle: 'Retour à la gestion RH', icone: 'building', chemin: '/app/rh' })
    if (utilisateur.personnel?.service != null) {
      elements.push({ cle: 'apercu', id: 'retour-espace-service-rh', libelle: 'Retour à mon service', icone: 'users', chemin: '/app/chef-service' })
    }
  }

  return <Coquille<VueAgent> {...props} espace="Espace personnel" elements={elements} />
}

export function CoquilleService(props: PropsEspace<VueService>) {
  const { utilisateur } = useAuth()
  const espace = utilisateur?.role === 'ROLE_RH' ? 'Service RH' : 'Chef de service'
  return <Coquille<VueService> {...props} espace={espace} elements={NAV_SERVICE} />
}

export function CoquilleDirecteur(props: PropsEspace<VueDirecteur>) {
  return <Coquille<VueDirecteur> {...props} espace="Direction" elements={NAV_DIRECTEUR} />
}

export function CoquilleAdmin(props: PropsEspace<VueAdmin>) {
  return <Coquille<VueAdmin> {...props} espace="Administration" elements={NAV_ADMIN} />
}

/* ================================================================== */
/*  Tiroir — rendu via portail dans <body> pour échapper aux          */
/*  contextes de stacking / transforms des parents                     */
/* ================================================================== */

export function Tiroir({
  ouvert, onFermer, titre, sousTitre, pied, children,
}: {
  ouvert: boolean
  onFermer: () => void
  titre: string
  sousTitre?: string
  pied?: ReactNode
  children: ReactNode
}) {
  const [monte, setMonte] = useState(ouvert)
  const [portailPret, setPortailPret] = useState(false)

  useEffect(() => {
    setPortailPret(true)
  }, [])

  useEffect(() => {
    if (ouvert) { setMonte(true); return }
    const minuteur = window.setTimeout(() => setMonte(false), 300)
    return () => window.clearTimeout(minuteur)
  }, [ouvert])

  useEffect(() => {
    if (!ouvert) return
    function surTouche(evenement: KeyboardEvent) {
      if (evenement.key === 'Escape') onFermer()
    }
    const debordement = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', surTouche)
    return () => {
      document.body.style.overflow = debordement
      window.removeEventListener('keydown', surTouche)
    }
  }, [ouvert, onFermer])

  if (!portailPret) return null

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] ${monte ? '' : 'invisible'} ${ouvert ? '' : 'pointer-events-none'}`}
      aria-hidden={!ouvert}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer le panneau"
        onClick={onFermer}
        className={`absolute inset-0 bg-[#1B1BFF]/50 backdrop-blur-[2px] transition-opacity duration-300 ${ouvert ? 'opacity-100' : 'opacity-0'}`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={`absolute inset-y-0 right-0 flex w-full max-w-[760px] flex-col overflow-hidden bg-[#FAFAF8] shadow-[-24px_0_60px_-24px_rgba(7,28,43,.45)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
          ouvert ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <span aria-hidden="true" className="h-1 w-full shrink-0 bg-gradient-to-r from-[#1B1BFF] via-[#1B1BFF] to-[#00FF9C]" />

        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#E5E5EA] bg-white px-4 py-3 sm:gap-4 sm:px-8 sm:py-4">
          <div className="min-w-0">
            <h2 className="men-serif text-2xl font-normal tracking-tight text-[#0A0A0A]">{titre}</h2>
            {sousTitre && <p className="mt-0.5 text-sm text-[#86868B]">{sousTitre}</p>}
          </div>

          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#86868B] transition-colors hover:bg-[#F5F5F7] hover:text-[#0A0A0A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/25"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 py-4 sm:px-8 sm:py-6">
            {monte && children}
          </div>
        </div>

        {pied && (
          <footer className="shrink-0 border-t border-[#E5E5EA] bg-white px-4 py-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-4 sm:pb-4">
            {pied}
          </footer>
        )}
      </aside>
    </div>,
    document.body
  )
}