import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { Link, Navigate } from 'react-router'

import { useAuth } from '../../contexts/useAuth'
import {
  listerPersonnelsDuService,
  listerPlanningService,
  type AbsencePlanning,
  type PersonnelEquipe,
} from '../../services/chefServiceService'
import { Icon, Message, type IconName } from '../../components/men/ui'
import { delai, useCompteur } from '../../components/men/ui-outils'
import {
  CoquilleService,
  type VueService,
} from '../../components/men/miseEnPageRH'

const TITRES_VUES: Record<VueService, { titre: string; description: string }> = {
  apercu: { titre: "Vue d'ensemble", description: 'Suivi global des demandes et du service' },
  demandes: { titre: 'Demandes à examiner', description: 'Demandes en attente de visa' },
  personnels: { titre: 'Mon équipe', description: 'Agents rattachés à votre service' },
  planning: { titre: 'Planning', description: 'Vue mensuelle des absences' },
  'nouvelle-demande': { titre: 'Nouvelle demande', description: 'Déposer une demande personnelle' },
}

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const STYLES = `
@keyframes rh-in{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}
@keyframes rh-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes rh-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes rh-ring{from{stroke-dashoffset:var(--c)}to{stroke-dashoffset:var(--o)}}
@keyframes rh-pulse{0%{box-shadow:0 0 0 0 rgba(217,138,11,.45)}100%{box-shadow:0 0 0 7px rgba(217,138,11,0)}}
@keyframes rh-pop{0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:none}}
@keyframes rh-fade{from{opacity:0}to{opacity:1}}
@keyframes rh-orbit{to{transform:rotate(360deg)}}
@keyframes rh-sheen{from{transform:translateX(-120%)}to{transform:translateX(280%)}}

.rh-in{animation:rh-in .6s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.rh-draw{stroke-dasharray:1;animation:rh-draw 1.5s cubic-bezier(.4,0,.2,1) var(--d,150ms) backwards}
.rh-bar{transform-origin:left center;animation:rh-bar .9s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.rh-ring{animation:rh-ring 1.3s cubic-bezier(.22,1,.36,1) var(--d,300ms) backwards}
.rh-pulse{animation:rh-pulse 1.8s ease-out infinite}
.rh-pop{animation:rh-pop .45s cubic-bezier(.22,1,.36,1) backwards}
.rh-fade{animation:rh-fade .7s ease-out var(--d,0ms) backwards}
.rh-orbit{transform-origin:center;animation:rh-orbit 80s linear infinite}
.rh-sheen::after{content:"";position:absolute;inset:0;width:36%;pointer-events:none;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.18),transparent);
  animation:rh-sheen 1.5s cubic-bezier(.4,0,.2,1) var(--d,600ms) 1 backwards}

.men-serif{font-family:var(--font-serif,'Space Grotesk Variable','Space Grotesk','Inter Variable','Inter',sans-serif);font-weight:500;letter-spacing:-.01em}

@media (prefers-reduced-motion:reduce){
  .rh-in,.rh-draw,.rh-bar,.rh-ring,.rh-pulse,.rh-pop,.rh-fade,.rh-orbit,.rh-sheen::after{animation:none!important}
  .rh-draw{stroke-dasharray:none}
}
`

/* ------------------------------------------------------------------ */
/*  Styles partagés                                                    */
/* ------------------------------------------------------------------ */

const carte =
  'rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_1px_2px_rgba(15,36,55,0.04),0_10px_28px_-18px_rgba(15,36,55,0.14)]'

const btnPrimaire =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1B1BFF] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(27,27,255,.3),0_8px_16px_-8px_rgba(27,27,255,.55)] transition duration-200 hover:bg-[#1B1BFF] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 disabled:pointer-events-none disabled:opacity-60'

const btnContour =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E5E5EA] bg-white px-4 text-sm font-semibold text-[#0A0A0A] transition duration-200 hover:border-[#E5E5EA] hover:bg-[#F0F0FF] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/15 disabled:pointer-events-none disabled:opacity-60'

const TONS_KPI = {
  bleu: {
    fond: 'bg-[#C2C2CC]',
    ombre: 'shadow-[0_1px_2px_rgba(10,10,10,.04)]',
    accent: '#1B1BFF',
    icone: 'bg-white text-[#1B1BFF]',
  },
  bleuMoyen: {
    fond: 'bg-[#C2C2CC]',
    ombre: 'shadow-[0_1px_2px_rgba(10,10,10,.04)]',
    accent: '#1B1BFF',
    icone: 'bg-white text-[#1B1BFF]',
  },
  vert: {
    fond: 'bg-[#C2C2CC]',
    ombre: 'shadow-[0_1px_2px_rgba(10,10,10,.04)]',
    accent: '#00FF9C',
    icone: 'bg-[#00FF9C] text-[#0A0A0A]',
  },
} as const

const AVATARS = [
  'bg-[#1B1BFF]/10 text-[#1B1BFF]',
  'bg-[#00FF9C]/10 text-[#0A0A0A]',
  'bg-slate-500/10 text-slate-700',
  'bg-[#1B1BFF]/10 text-[#1B1BFF]',
  'bg-amber-500/10 text-amber-800',
]

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function dateISO(date: Date): string {
  const annee = date.getFullYear()
  const mois = String(date.getMonth() + 1).padStart(2, '0')
  const jour = String(date.getDate()).padStart(2, '0')
  return `${annee}-${mois}-${jour}`
}

function moisISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dateLisible(date: string): string {
  if (!date) return '—'
  const valeur = new Date(`${date.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(valeur.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(valeur)
}

function messageErreur(erreur: unknown): string {
  if (isAxiosError(erreur)) {
    if (erreur.response?.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
    if (erreur.response?.status === 403) return "Vous n'êtes pas autorisé à consulter ces données."
    const detail = erreur.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (!erreur.response) return 'Le serveur est injoignable. Vérifiez que Django fonctionne.'
  }
  return 'Une erreur est survenue lors du chargement du planning.'
}

function classeStatut(statut: string): string {
  switch (statut) {
    case 'EN_ATTENTE': return 'bg-amber-500/10 text-amber-700'
    case 'APPROUVE_CS': return 'bg-[#1B1BFF]/10 text-[#1B1BFF]'
    case 'VALIDE_DIR': return 'bg-[#00FF9C]/10 text-[#0A0A0A]'
    case 'REJETE': return 'bg-rose-500/10 text-rose-700'
    default: return 'bg-slate-500/10 text-[#5D5D66]'
  }
}

function libelleStatut(statut: string): string {
  switch (statut) {
    case 'APPROUVE_CS': return 'Visa du chef'
    case 'VALIDE_DIR': return 'Validée'
    default: return statut.replaceAll('_', ' ')
  }
}

function initiales(nom: string): string {
  const lettres = nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase()).join('')
  return lettres || '?'
}

function teinteAvatar(nom: string): string {
  const somme = [...nom].reduce((total, c) => total + c.charCodeAt(0), 0)
  return AVATARS[somme % AVATARS.length]
}

/* ------------------------------------------------------------------ */
/*  Composants locaux                                                  */
/* ------------------------------------------------------------------ */

function Avatar({ nom, className = 'h-9 w-9 text-xs' }: { nom: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-bold ring-1 ring-inset ring-black/5 ${teinteAvatar(nom)} ${className}`}>
      {initiales(nom)}
    </span>
  )
}

function BadgeStatut({ statut }: { statut: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${classeStatut(statut)}`}>
      <span className={`h-2 w-2 rounded-full ${statut === 'VALIDE_DIR' ? 'bg-[#00FF9C]' : statut === 'REJETE' ? 'bg-rose-500' : statut === 'APPROUVE_CS' ? 'bg-[#1B1BFF]' : 'rh-pulse bg-amber-500'}`} />
      {libelleStatut(statut)}
    </span>
  )
}

function TuileKpi({ libelle, valeur, note, part, icone, ton, retard }: {
  libelle: string
  valeur: number
  note: string
  part: number
  icone: IconName
  ton: keyof typeof TONS_KPI
  retard: number
}) {
  const affiche = useCompteur(valeur)
  const s = TONS_KPI[ton]
  const pct = Math.min(100, Math.max(0, part))

  return (
    <div
      className={`rh-in relative overflow-hidden rounded-[20px] ${s.fond} p-4 text-[#0A0A0A] shadow-none sm:p-5`}
      style={delai(retard)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#4F4F58]">{libelle}</p>
          <p className="men-serif mt-1.5 text-4xl leading-none tabular-nums text-[#0A0A0A]">{affiche}</p>
        </div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${s.icone}`}>
          <Icon name={icone} className="h-4 w-4" />
        </span>
      </div>
      <div className="relative mt-4">
        <div className="mb-1 flex items-baseline justify-between text-[11px] text-[#4F4F58]">
          <span>{note}</span>
          <span className="font-bold tabular-nums text-[#0A0A0A]">{Math.round(pct)}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white">
          <div
            className="rh-bar h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: s.accent, ...delai(retard + 350) }}
          />
        </div>
      </div>
    </div>
  )
}

function Panneau({ titre, sousTitre, icone, accent, action, retard, className = '', children }: {
  titre: string
  sousTitre?: string
  icone: IconName
  accent: string
  action?: React.ReactNode
  retard: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`rh-in relative flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-[#B6B6C1] bg-[#C2C2CC] p-5 sm:p-6 ${className}`} style={delai(retard)}>
      {/* Ligne d'accent supprimée */}
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${accent}1A`, color: accent }}>
            <Icon name={icone} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#0A0A0A]">{titre}</h2>
            {sousTitre && <p className="text-xs text-[#5D5D66]">{sousTitre}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Calendrier mensuel                                                 */
/* ------------------------------------------------------------------ */

function CalendrierMensuel({ moisReference, absences }: { moisReference: string; absences: AbsencePlanning[] }) {
  const [annee, mois] = moisReference.split('-').map(Number)
  const premierJour = new Date(annee, mois - 1, 1)
  const decalage = (premierJour.getDay() + 6) % 7
  const nombreJours = new Date(annee, mois, 0).getDate()
  const nombreCases = Math.ceil((decalage + nombreJours) / 7) * 7

  const cases = Array.from({ length: nombreCases }, (_, index) => {
    const jour = index - decalage + 1
    return jour >= 1 && jour <= nombreJours ? jour : null
  })

  const joursSemaine = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  function absencesDuJour(jour: number): AbsencePlanning[] {
    const cle = `${moisReference}-${String(jour).padStart(2, '0')}`
    return absences.filter((a) => a.date_debut.slice(0, 10) <= cle && a.date_fin.slice(0, 10) >= cle)
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-[#E5E5EA] bg-[#F0F0FF]">
          {joursSemaine.map((jour) => (
            <div key={jour} className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5D5D66]">
              {jour}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cases.map((jour, index) => {
            const cle = jour ? `${moisReference}-${String(jour).padStart(2, '0')}` : `vide-${index}`
            const evenements = jour ? absencesDuJour(jour) : []
            const aujourdHui = dateISO(new Date())

            return (
              <div
                key={cle}
                className={`min-h-28 border-b border-r border-[#E5E5EA] p-2 ${
                  jour === null ? 'bg-[#F0F0FF]' : index % 7 >= 5 ? 'bg-[#F0F0FF]' : 'bg-white'
                }`}
              >
                {jour !== null && (
                  <>
                    <div
                      className={`mb-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                        cle === aujourdHui ? 'bg-[#1B1BFF] text-white shadow-sm' : 'text-[#4F4F58]'
                      }`}
                    >
                      {jour}
                    </div>

                    <div className="space-y-1">
                      {evenements.slice(0, 2).map((absence) => (
                        <div
                          key={absence.id_demande}
                          title={`${absence.personnel_nom} · ${absence.type_absence_libelle}`}
                          className={`overflow-hidden rounded-md px-1.5 py-1 text-[10px] leading-4 ${classeStatut(absence.statut_demande)}`}
                        >
                          <p className="truncate font-semibold">{absence.personnel_nom}</p>
                          <p className="truncate opacity-80">{absence.type_absence_libelle}</p>
                        </div>
                      ))}
                      {evenements.length > 2 && (
                        <p className="px-1 text-[10px] font-medium text-[#5D5D66]">+ {evenements.length - 2} autre(s)</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

export function PlanningServicePage() {
  const { utilisateur, chargement } = useAuth()
  const [vue, setVue] = useState<VueService>('planning')

  const serviceId = utilisateur?.personnel?.service ?? null
  const rolesAutorises = ['ROLE_CHEF_SERVICE', 'ROLE_RH'] as const
  const roleAutorise = utilisateur ? (rolesAutorises as readonly string[]).includes(utilisateur.role) : false

  const [moisReference, setMoisReference] = useState(() => moisISO(new Date()))
  const [personnels, setPersonnels] = useState<PersonnelEquipe[]>([])
  const [absences, setAbsences] = useState<AbsencePlanning[]>([])
  const [erreurPersonnels, setErreurPersonnels] = useState('')
  const [erreurPlanning, setErreurPlanning] = useState('')
  const [chargementPlanning, setChargementPlanning] = useState(true)

  useEffect(() => {
    if (chargement || !utilisateur || !roleAutorise || serviceId === null) return
    const idService = serviceId
    let annule = false

    async function charger() {
      const [annee, mois] = moisReference.split('-').map(Number)
      const debutDate = new Date(annee, mois - 1, 1)
      const finDate = new Date(annee, mois, 0)
      const debut = dateISO(debutDate)
      const fin = dateISO(finDate)

      const [resultatPersonnels, resultatPlanning] = await Promise.allSettled([
        listerPersonnelsDuService(idService),
        listerPlanningService(debut, fin),
      ])

      if (annule) return

      if (resultatPersonnels.status === 'fulfilled') {
        setPersonnels(resultatPersonnels.value)
        setErreurPersonnels('')
      } else {
        setPersonnels([])
        setErreurPersonnels(messageErreur(resultatPersonnels.reason))
      }

      if (resultatPersonnels.status === 'fulfilled' && resultatPlanning.status === 'fulfilled') {
        const identifiantsService = new Set(resultatPersonnels.value.map((p) => p.id_personnel))
        setAbsences(resultatPlanning.value.filter((absence) => identifiantsService.has(absence.personnel_id)))
        setErreurPlanning('')
      } else if (resultatPlanning.status === 'rejected') {
        setAbsences([])
        setErreurPlanning(messageErreur(resultatPlanning.reason))
      } else {
        setAbsences([])
        setErreurPlanning('Impossible de déterminer les personnels du service.')
      }

      setChargementPlanning(false)
    }

    void charger()
    return () => { annule = true }
  }, [chargement, utilisateur, roleAutorise, serviceId, moisReference])

  if (chargement) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8]">
        <span role="status" aria-label="Chargement" className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1B1BFF]/15 border-t-[#1B1BFF]" />
      </div>
    )
  }

  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (!roleAutorise) return <Navigate to="/app" replace />

  if (!serviceId) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8] p-6">
        <section className={`max-w-lg p-8 text-center ${carte}`}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/10 text-amber-700">
            <Icon name="alert" className="h-7 w-7" />
          </span>
          <h1 className="men-serif mt-5 text-2xl font-normal text-[#0A0A0A]">Aucun service associé</h1>
          <p className="mt-2 text-sm text-[#5D5D66]">Votre compte n'est lié à aucun service. Vérifiez votre rattachement.</p>
        </section>
      </div>
    )
  }

  const dateMois = new Date(`${moisReference}-01T12:00:00`)
  const titreMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(dateMois)
  const personnelConnecte = utilisateur.personnel
  const nomService = personnelConnecte?.service_libelle || 'Mon service'

  function deplacerMois(decalage: number) {
    const [annee, mois] = moisReference.split('-').map(Number)
    const prochainMois = new Date(annee, mois - 1 + decalage, 1)
    setChargementPlanning(true)
    setMoisReference(moisISO(prochainMois))
  }

  function revenirAujourdHui() {
    setChargementPlanning(true)
    setMoisReference(moisISO(new Date()))
  }

  const debut = `${moisReference}-01`
  const fin = dateISO(new Date(Number(moisReference.slice(0, 4)), Number(moisReference.slice(5, 7)), 0))
  const absencesTriees = [...absences].sort((a, b) => a.date_debut.localeCompare(b.date_debut))
  const valeurAffichage = (n: number) => (chargementPlanning ? 0 : n)
  const total = absences.length || 1
  const part = (n: number) => Math.round((n / total) * 100)
  const nbValidees = absences.filter((a) => a.statut_demande === 'VALIDE_DIR').length

  return (
    <CoquilleService
      vue={vue}
      onVue={setVue}
      titre={TITRES_VUES[vue].titre}
      description={TITRES_VUES[vue].description}
      actions={
        <>
          <button type="button" onClick={() => deplacerMois(-1)} className={`${btnContour} !px-3 !h-9`} aria-label="Mois précédent">
            <Icon name="left" className="h-4 w-4" />
          </button>
          <div className="min-w-[8rem] rounded-xl border border-[#E5E5EA] bg-white px-3 py-2 text-center text-xs font-semibold capitalize text-[#0A0A0A]">
            {titreMois}
          </div>
          <button type="button" onClick={() => deplacerMois(1)} className={`${btnContour} !px-3 !h-9`} aria-label="Mois suivant">
            <Icon name="right" className="h-4 w-4" />
          </button>
          <button type="button" onClick={revenirAujourdHui} className={`${btnPrimaire} !px-3 !h-9`}>
            <Icon name="calendar" className="h-4 w-4" />
            <span className="hidden sm:inline">Aujourd’hui</span>
          </button>
        </>
      }
    >
      <style>{STYLES}</style>

      <div className="min-w-0 space-y-6 rounded-[32px] border border-[#E5E5EA] bg-white p-3 sm:p-4">

      {erreurPersonnels && <Message type="erreur" onClose={() => setErreurPersonnels('')}><span className="text-xs">{erreurPersonnels}</span></Message>}
      {erreurPlanning && <Message type="erreur" onClose={() => setErreurPlanning('')}><span className="text-xs">{erreurPlanning}</span></Message>}

      <section className="rh-in flex min-w-0 flex-col gap-4 rounded-[24px] bg-[#D0D0D9] p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between" style={delai(0)}>
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-[#E5E5EA] bg-white sm:h-24 sm:w-24">
            <span className="men-serif text-3xl tabular-nums sm:text-4xl">{new Date().getDate()}</span>
          </span>
          <div className="text-sm leading-snug">
            <p className="font-semibold capitalize text-[#0A0A0A]">{new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(new Date())},</p>
            <p className="capitalize text-[#5D5D66]">{new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date())}</p>
          </div>
        </div>
        <div className="min-w-0 lg:text-right">
          <h2 className="men-serif text-2xl leading-tight text-[#0A0A0A] sm:text-4xl">Bonjour</h2>
          <p className="men-serif text-2xl leading-tight text-[#71717B] sm:text-4xl">Planning des absences</p>
          <p className="mt-2 text-xs text-[#4F4F58]">{nomService} · {personnels.length} personnel(s) · {titreMois}</p>
          <Link to="/app/chef-service/personnel" className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#1B1BFF] px-4 text-xs font-semibold text-white transition hover:bg-[#1414D6] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25">
            <Icon name="calendar" className="h-3.5 w-3.5" /> Préparer une absence
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <TuileKpi libelle="Personnels" valeur={valeurAffichage(personnels.length)} note="Agents du service" part={100} icone="users" ton="bleu" retard={160} />
        <TuileKpi libelle="Absences" valeur={valeurAffichage(absences.length)} note="Sur le mois consulté" part={part(absences.length)} icone="calendar" ton="bleuMoyen" retard={220} />
        <TuileKpi libelle="Validées" valeur={valeurAffichage(nbValidees)} note="Par la direction" part={part(nbValidees)} icone="check" ton="vert" retard={280} />
      </div>

      <Panneau
        titre="Calendrier mensuel"
        sousTitre="Les absences affichées proviennent des demandes occupant le calendrier."
        icone="calendar"
        accent="#1B1BFF"
        retard={340}
        action={
          <div className="hidden flex-wrap gap-3 text-[11px] font-medium text-[#5D5D66] sm:flex">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#1B1BFF]" /> Visa chef</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#00FF9C]" /> Validée</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> En attente</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Rejetée</span>
          </div>
        }
      >
        {chargementPlanning ? (
          <div className="flex min-h-[200px] items-center justify-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1B1BFF]/20 border-t-[#1B1BFF]" />
            <span className="text-xs font-medium text-[#5D5D66]">Chargement du calendrier…</span>
          </div>
        ) : erreurPlanning ? (
          <div className="px-6 py-12 text-center text-xs text-[#5D5D66]">Le calendrier ne peut pas être affiché.</div>
        ) : absences.length === 0 ? (
          <div className="py-16 text-center">
            <span className="rh-pop mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#1B1BFF]/10 text-[#1B1BFF] ring-8 ring-[#1B1BFF]/5">
              <Icon name="calendar" className="h-7 w-7" />
            </span>
            <p className="men-serif mt-4 text-2xl text-[#0A0A0A]">Aucune absence planifiée</p>
            <p className="mt-1 text-xs text-[#5D5D66]">Aucune absence n'est enregistrée pour ce service sur cette période.</p>
          </div>
        ) : (
          <CalendrierMensuel moisReference={moisReference} absences={absences} />
        )}
      </Panneau>

      <section className={`rh-in min-w-0 overflow-hidden ${carte}`} style={delai(400)}>
        <div className="flex flex-col gap-1 border-b border-[#E5E5EA] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-[#0A0A0A]">Détail des absences</h2>
            <p className="mt-0.5 text-xs text-[#5D5D66]">{dateLisible(debut)} au {dateLisible(fin)}</p>
          </div>
          <p className="text-xs font-medium text-[#5D5D66]">{absencesTriees.length} absence{absencesTriees.length > 1 ? 's' : ''}</p>
        </div>

        {chargementPlanning ? (
          <div className="flex min-h-[120px] items-center justify-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1B1BFF]/20 border-t-[#1B1BFF]" />
            <span className="text-xs font-medium text-[#5D5D66]">Chargement…</span>
          </div>
        ) : absencesTriees.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#5D5D66]">Aucun détail à afficher pour ce mois.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-[#E5E5EA] bg-[#F0F0FF] text-xs font-semibold text-[#5D5D66]">
                  <th scope="col" className="px-6 py-3">Personnel</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3">Début</th>
                  <th scope="col" className="px-4 py-3">Fin</th>
                  <th scope="col" className="px-4 py-3">Durée</th>
                  <th scope="col" className="px-6 py-3">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F7]">
                {absencesTriees.map((absence, index) => (
                  <tr key={absence.id_demande} className="rh-in group relative transition-colors hover:bg-[#F0F0FF]" style={delai(Math.min(index, 10) * 40)}>
                    <td className="relative px-6 py-3">
                      <span className="absolute inset-y-2 left-0 w-[3px] scale-y-0 rounded-r-full bg-[#1B1BFF] transition-transform duration-300 group-hover:scale-y-100" />
                      <div className="flex items-center gap-2.5">
                        <Avatar nom={absence.personnel_nom} className="h-9 w-9 text-xs" />
                        <span className="font-semibold text-[#0A0A0A]">{absence.personnel_nom}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#0A0A0A]">{absence.type_absence_libelle || absence.type_absence}</td>
                    <td className="px-4 py-3 text-[#0A0A0A]">{dateLisible(absence.date_debut)}</td>
                    <td className="px-4 py-3 text-[#0A0A0A]">{dateLisible(absence.date_fin)}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-[#0A0A0A]">{absence.nombre_jours} j</td>
                    <td className="px-6 py-3"><BadgeStatut statut={absence.statut_demande} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </CoquilleService>
  )
}

export default PlanningServicePage