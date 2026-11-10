import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'

import { useAuth } from '../../contexts/useAuth'
import {
  listerDemandesEnAttenteService,
  listerPersonnelsDuService,
  listerPlanningService,
  type AbsencePlanning,
  type DemandeEnAttente,
  type PersonnelEquipe,
} from '../../services/chefServiceService'
import { Icon, Message, type IconName } from '../../components/men/ui'
import { delai, useCompteur } from '../../components/men/ui-outils'
import {
  CoquilleService,
  type VueService,
} from '../../components/men/miseEnPageRH'
import { messageErreurUtilisateur } from '../../lib/messages'
import { nomAffichageUtilisateur } from '../../lib/nomAffichageUtilisateur'

const TITRES_VUES: Record<VueService, { titre: string; description: string }> = {
  apercu: { titre: 'Vue d’ensemble', description: 'Activité du service' },
  demandes: { titre: 'Demandes à examiner', description: 'À valider' },
  personnels: { titre: 'Mon équipe', description: 'Agents du service' },
  formulaires: { titre: 'PDF officiels à signer', description: 'Classement par service' },
  planning: { titre: 'Planning', description: 'Absences du service' },
  'nouvelle-demande': { titre: 'Nouvelle demande', description: 'Créer une demande' },
}

const LIBELLES_STATUT: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  APPROUVE_CS: 'Approuvé',
  VALIDE_DIR: 'Validé',
  REJETE: 'Rejeté',
}

const COULEUR_STATUT: Record<string, string> = {
  EN_ATTENTE: '#F59E0B',
  APPROUVE_CS: '#1B1BFF',
  VALIDE_DIR: '#00FF9C',
  REJETE: '#F43F5E',
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
const GRIS = 'rounded-[24px] border border-[#B6B6C1] bg-[#C2C2CC]'
const BLANC = 'rounded-2xl bg-white shadow-[0_1px_2px_rgba(10,10,10,0.08)]'

const btnPrimaire =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1B1BFF] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(27,27,255,.3),0_8px_16px_-8px_rgba(27,27,255,.55)] transition duration-200 hover:bg-[#1B1BFF] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 disabled:pointer-events-none disabled:opacity-60'

const btnContour =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E5E5EA] bg-white px-4 text-sm font-semibold text-[#0A0A0A] transition duration-200 hover:border-[#E5E5EA] hover:bg-[#F0F0FF] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/15 disabled:pointer-events-none disabled:opacity-60'

const champ =
  'h-11 w-full rounded-xl border border-[#E5E5EA] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#5D5D66] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:bg-[#FAFAF8] disabled:text-[#5D5D66]'

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

function dateLisible(date: string): string {
  if (!date) return '—'
  const valeur = new Date(`${date.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(valeur.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(valeur)
}

function erreurAPI(erreur: unknown): string {
  return messageErreurUtilisateur(erreur, 'Impossible de charger ces informations. Réessayez dans quelques instants.')
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
  return LIBELLES_STATUT[statut] ?? statut.replaceAll('_', ' ')
}

function nomAgent(personnel: PersonnelEquipe): string {
  return personnel.nom_complet || `${personnel.prenoms} ${personnel.nom}`
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

function Avatar({ nom, className = 'h-9 w-9 text-[10px]' }: { nom: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-bold ring-1 ring-inset ring-black/5 ${teinteAvatar(nom)} ${className}`}>
      {initiales(nom)}
    </span>
  )
}

function BadgeStatut({ statut }: { statut: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${classeStatut(statut)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statut === 'VALIDE_DIR' ? 'bg-[#00FF9C]' : statut === 'REJETE' ? 'bg-rose-500' : statut === 'APPROUVE_CS' ? 'bg-[#1B1BFF]' : 'rh-pulse bg-amber-500'}`} />
      {libelleStatut(statut)}
    </span>
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
    <section className={`rh-in relative flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-[#B6B6C1] bg-[#C2C2CC] p-4 sm:p-5 ${className}`} style={delai(retard)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${accent}1A`, color: accent }}>
            <Icon name={icone} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[#0A0A0A]">{titre}</h2>
            {sousTitre && <p className="text-[11px] text-[#5D5D66]">{sousTitre}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </section>
  )
}

function Donut({ segments, taille = 110, epaisseur = 12, centre }: {
  segments: { libelle: string; valeur: number; couleur: string }[]
  taille?: number
  epaisseur?: number
  centre?: React.ReactNode
}) {
  const total = segments.reduce((s, seg) => s + seg.valeur, 0) || 1
  const r = (taille - epaisseur) / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="relative shrink-0" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} className="-rotate-90 drop-shadow-sm">
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="#E5E5EA" strokeWidth={epaisseur} />
        {segments.map((seg, i) => {
          const dash = (seg.valeur / total) * c
          const el = (
            <circle
              key={i}
              className="rh-ring"
              cx={taille / 2}
              cy={taille / 2}
              r={r}
              fill="none"
              stroke={seg.couleur}
              strokeWidth={epaisseur}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c - dash}
              style={{ '--c': c, '--o': offset, transform: `rotate(${(offset / c) * 360}deg)`, transformOrigin: 'center' } as React.CSSProperties}
            />
          )
          offset += dash
          return el
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{centre}</div>
    </div>
  )
}

function JaugeTaux({ ratio, pct }: { ratio: number; pct: number }) {
  const taille = 150
  const epaisseur = 10
  const rayon = (taille - epaisseur) / 2
  const circonference = 2 * Math.PI * rayon
  const decalage = circonference * (1 - Math.min(Math.max(ratio, 0), 1))

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[170px] rounded-full bg-[#0A0A0A] p-2 shadow-[0_18px_30px_-18px_rgba(10,10,10,0.7)]">
      <svg viewBox={`0 0 ${taille} ${taille}`} className="h-full w-full -rotate-90" role="img" aria-label={`Absences validées : ${Math.round(ratio * 100)} %`}>
        <circle cx={taille / 2} cy={taille / 2} r={rayon} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={epaisseur} />
        <circle className="rh-ring" cx={taille / 2} cy={taille / 2} r={rayon} fill="none" stroke="#00FF9C" strokeWidth={epaisseur} strokeLinecap="round" strokeDasharray={circonference} strokeDashoffset={decalage} style={{ '--c': circonference, '--o': decalage } as React.CSSProperties} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center text-white">
        <div>
          <p className="men-serif text-2xl leading-none tabular-nums">{pct}%</p>
          <p className="mt-1 text-[11px] text-white/70">Validées</p>
        </div>
      </div>
    </div>
  )
}

function MiniCourbe({ points }: { points: { libelle: string; valeur: number }[] }) {
  const largeur = 220
  const hauteur = 70
  const marge = 6
  const maximum = Math.max(1, ...points.map((point) => point.valeur))
  const x = (index: number) => marge + (points.length > 1 ? (index / (points.length - 1)) * (largeur - 2 * marge) : (largeur - 2 * marge) / 2)
  const y = (valeur: number) => hauteur - marge - (valeur / maximum) * (hauteur - 2 * marge)
  const chemin = points.reduce((acc, point, index) => {
    if (index === 0) return `M ${x(0)} ${y(point.valeur)}`
    const precedentX = x(index - 1)
    const precedentY = y(points[index - 1].valeur)
    const milieu = (precedentX + x(index)) / 2
    return `${acc} C ${milieu} ${precedentY} ${milieu} ${y(point.valeur)} ${x(index)} ${y(point.valeur)}`
  }, '')

  return (
    <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="h-[70px] w-full" role="img" aria-label="Départs en absence répartis sur la période consultée">
      <path className="rh-draw" pathLength={1} d={chemin} fill="none" stroke="#1B1BFF" strokeWidth="2.5" strokeLinecap="round" />
      <circle className="rh-pop" cx={x(points.length - 1)} cy={y(points[points.length - 1]?.valeur ?? 0)} r="4" fill="#fff" stroke="#1B1BFF" strokeWidth="2.5" style={{ animationDelay: '850ms' }} />
    </svg>
  )
}

function Legende({ segments }: { segments: { libelle: string; valeur: number; couleur: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.valeur, 0) || 1
  return (
    <ul className="min-w-0 flex-1 space-y-2">
      {segments.map((seg, i) => (
        <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-[#0A0A0A]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: seg.couleur }} />
            <span className="truncate">{seg.libelle}</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-[#0A0A0A]">
            {seg.valeur}
            <span className="ml-1 text-[#5D5D66]">{Math.round((seg.valeur / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/*  Mini-calendrier                                                    */
/* ------------------------------------------------------------------ */

const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function MiniCalendrier({ absences }: { absences: AbsencePlanning[] }) {
  const aujourdhui = dateISO(new Date())
  const [mois, setMois] = useState(() => {
    const maintenant = new Date()
    return new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
  })
  const [jourChoisi, setJourChoisi] = useState<string>(aujourdhui)

  const decalage = (mois.getDay() + 6) % 7
  const nombreJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate()
  const cases: (number | null)[] = [
    ...Array.from({ length: decalage }, () => null),
    ...Array.from({ length: nombreJours }, (_, index) => index + 1),
  ]

  function absentsDu(iso: string): AbsencePlanning[] {
    return absences.filter((a) => a.date_debut.slice(0, 10) <= iso && a.date_fin.slice(0, 10) >= iso)
  }

  function changerMois(variation: number) {
    setMois((precedent) => new Date(precedent.getFullYear(), precedent.getMonth() + variation, 1))
  }

  const libelleMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(mois)
  const absentsChoisis = absentsDu(jourChoisi)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => changerMois(-1)} aria-label="Mois précédent" className="grid h-7 w-7 place-items-center rounded-lg border border-[#E5E5EA] bg-white text-[#0A0A0A] transition hover:bg-[#F0F0FF] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40">
          <Icon name="left" className="h-3.5 w-3.5" />
        </button>
        <p className="text-xs font-semibold capitalize text-[#0A0A0A]">{libelleMois}</p>
        <button type="button" onClick={() => changerMois(1)} aria-label="Mois suivant" className="grid h-7 w-7 place-items-center rounded-lg border border-[#E5E5EA] bg-white text-[#0A0A0A] transition hover:bg-[#F0F0FF] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40">
          <Icon name="right" className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {JOURS_SEMAINE.map((lettre, index) => (
          <span key={index} className="py-1 text-[9px] font-semibold uppercase text-[#5D5D66]">{lettre}</span>
        ))}
        {cases.map((jour, index) => {
          if (jour === null) return <span key={`vide-${index}`} />
          const iso = dateISO(new Date(mois.getFullYear(), mois.getMonth(), jour))
          const nombre = absentsDu(iso).length
          const estChoisi = iso === jourChoisi
          const estAujourdhui = iso === aujourdhui

          return (
            <button
              key={iso}
              type="button"
              onClick={() => setJourChoisi(iso)}
              className={`relative mx-auto grid h-7 w-7 place-items-center rounded-lg text-[11px] font-medium tabular-nums transition focus:outline-none ${
                nombre >= 2
                  ? 'bg-[#1B1BFF] font-semibold text-white shadow-sm'
                  : nombre === 1
                    ? 'bg-[#1B1BFF]/10 font-semibold text-[#1B1BFF]'
                    : 'text-[#4F4F58] hover:bg-[#F0F0FF]'
              } ${estChoisi ? 'ring-2 ring-[#1B1BFF]/25 ring-offset-1 ring-offset-white' : ''} ${
                estAujourdhui && nombre === 0 ? 'border border-[#1B1BFF]/40' : ''
              }`}
            >
              {jour}
              {nombre > 0 && (
                <span className={`absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${nombre >= 2 ? 'bg-white' : 'bg-[#1B1BFF]'}`} />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 rounded-xl border border-[#E5E5EA] bg-[#F0F0FF] p-3">
        <p className="text-[11px] font-semibold text-[#0A0A0A]">Absents le {dateLisible(jourChoisi)}</p>
        {absentsChoisis.length === 0 ? (
          <p className="mt-1 text-[11px] text-[#5D5D66]">Personne d’absent ce jour.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {absentsChoisis.map((absence) => (
              <li key={absence.id_demande} className="flex items-center gap-2 text-[11px]">
                <Avatar nom={absence.personnel_nom} className="h-5 w-5 text-[8px]" />
                <span className="min-w-0 flex-1 truncate font-medium text-[#0A0A0A]">{absence.personnel_nom}</span>
                <span className="shrink-0 text-[10px] text-[#5D5D66]">{absence.type_absence_libelle || absence.type_absence}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

export function DashboardChefServicePage() {
  const { utilisateur, chargement } = useAuth()
  const serviceId = utilisateur?.personnel?.service ?? null
  const [vue, setVue] = useState<VueService>('apercu')

  const [personnels, setPersonnels] = useState<PersonnelEquipe[]>([])
  const [demandes, setDemandes] = useState<DemandeEnAttente[]>([])
  const [planning, setPlanning] = useState<AbsencePlanning[]>([])
  const [rechercheEquipe, setRechercheEquipe] = useState('')

  const [erreurPersonnel, setErreurPersonnel] = useState('')
  const [erreurDemandes, setErreurDemandes] = useState('')
  const [erreurPlanning, setErreurPlanning] = useState('')
  const [chargementDonnees, setChargementDonnees] = useState(true)

  const nombreAbsencesValidees = planning.filter((absence) => absence.statut_demande === 'VALIDE_DIR').length
  const nombreAbsencesEnAttente = planning.filter((absence) => absence.statut_demande === 'EN_ATTENTE').length
  const ratioValides = planning.length ? nombreAbsencesValidees / planning.length : 0
  const pourcentageAffiche = useCompteur(chargementDonnees ? 0 : Math.round(ratioValides * 100))
  const afficheAbsences = useCompteur(chargementDonnees ? 0 : planning.length)
  const afficheValidees = useCompteur(chargementDonnees ? 0 : nombreAbsencesValidees)
  const afficheEnAttente = useCompteur(chargementDonnees ? 0 : nombreAbsencesEnAttente)
  const nombrePersonnelsAvecAbsence = new Set(planning.map((absence) => absence.personnel_id)).size
  const affichePersonnelsAvecAbsence = useCompteur(chargementDonnees ? 0 : nombrePersonnelsAvecAbsence)

  const chargerDashboard = useCallback(async () => {
    if (!serviceId) { setChargementDonnees(false); return }

    const maintenant = new Date()
    const debutPeriode = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
    const finPeriode = new Date(maintenant)
    finPeriode.setDate(finPeriode.getDate() + 30)

    const debut = dateISO(debutPeriode)
    const fin = dateISO(finPeriode)

    const [resultatPersonnel, resultatDemandes, resultatPlanning] = await Promise.allSettled([
      listerPersonnelsDuService(serviceId),
      listerDemandesEnAttenteService(),
      listerPlanningService(debut, fin),
    ])

    if (resultatPersonnel.status === 'fulfilled') {
      setPersonnels(resultatPersonnel.value)
      setErreurPersonnel('')
    } else {
      setPersonnels([])
      setErreurPersonnel(erreurAPI(resultatPersonnel.reason))
    }

    if (resultatDemandes.status === 'fulfilled') {
      setDemandes(resultatDemandes.value)
      setErreurDemandes('')
    } else {
      setDemandes([])
      setErreurDemandes(erreurAPI(resultatDemandes.reason))
    }

    if (resultatPlanning.status === 'fulfilled') {
      setPlanning(resultatPlanning.value)
      setErreurPlanning('')
    } else {
      setPlanning([])
      setErreurPlanning(erreurAPI(resultatPlanning.reason))
    }

    setChargementDonnees(false)
  }, [serviceId])

  useEffect(() => {
    if (chargement || !utilisateur || !['ROLE_CHEF_SERVICE', 'ROLE_RH'].includes(utilisateur.role) || !serviceId) return
    void chargerDashboard()
  }, [chargement, utilisateur, serviceId, chargerDashboard])

  if (chargement) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8]">
        <span role="status" aria-label="Chargement" className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1B1BFF]/15 border-t-[#1B1BFF]" />
      </div>
    )
  }

  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (utilisateur.role !== 'ROLE_CHEF_SERVICE' && utilisateur.role !== 'ROLE_RH') return <Navigate to="/app" replace />

  const service = utilisateur.personnel?.service_libelle || 'Service non renseigné'

  if (!serviceId) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8] p-6">
        <section className={`max-w-lg p-8 text-center ${carte}`}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/10 text-amber-700">
            <Icon name="alert" className="h-7 w-7" />
          </span>
          <h1 className="men-serif mt-5 text-2xl font-normal text-[#0A0A0A]">Aucun service associé</h1>
          <p className="mt-2 text-sm text-[#5D5D66]">
            Votre compte n’est rattaché à aucun service. {utilisateur.role === 'ROLE_RH' ? 'L’espace Chef de service n’est pas disponible sans rattachement à un service.' : 'Contactez l’administrateur pour vérifier votre rattachement.'}
          </p>
          {utilisateur.role === 'ROLE_RH' && (
            <Link to="/app/rh" className={`${btnPrimaire} mt-5`}>
              <Icon name="building" className="h-4 w-4" /> Retour à l’espace RH
            </Link>
          )}
        </section>
      </div>
    )
  }

  const valeur = (n: number) => (chargementDonnees ? 0 : n)

  const parStatut = Object.entries(
    planning.reduce<Record<string, number>>((acc, absence) => {
      acc[absence.statut_demande] = (acc[absence.statut_demande] ?? 0) + 1
      return acc
    }, {}),
  ).map(([statut, nombre]) => ({
    libelle: libelleStatut(statut),
    valeur: nombre,
    couleur: COULEUR_STATUT[statut] ?? '#5D5D66',
  }))

  const equipeFiltree = personnels.filter((personnel) => {
    const requete = rechercheEquipe.trim().toLowerCase()
    if (!requete) return true
    return nomAgent(personnel).toLowerCase().includes(requete) || String(personnel.im).toLowerCase().includes(requete)
  })

  const planningTrie = planning.slice().sort((a, b) => a.date_debut.localeCompare(b.date_debut))

  const tableauDemandes = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-[#E5E5EA] bg-[#F0F0FF] text-xs font-semibold text-[#5D5D66]">
            <th scope="col" className="px-4 py-2.5">Personnel</th>
            <th scope="col" className="px-3 py-2.5">Type</th>
            <th scope="col" className="px-3 py-2.5">Période</th>
            <th scope="col" className="px-3 py-2.5">Durée</th>
            <th scope="col" className="px-4 py-2.5">État</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F5F5F7]">
          {demandes.map((demande) => {
            const nomPersonnel = demande.personnel_detail?.nom_complet || `Personnel #${demande.personnel}`
            return (
              <tr key={demande.id_demande} className="rh-in group relative transition-colors duration-200 hover:bg-[#F0F0FF]">
                <td className="relative px-4 py-3">
                  <span className="absolute inset-y-2 left-0 w-[3px] scale-y-0 rounded-r-full bg-[#1B1BFF] transition-transform duration-300 group-hover:scale-y-100" />
                  <div className="flex items-center gap-2.5">
                    <Avatar nom={nomPersonnel} className="h-8 w-8 text-[10px]" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#0A0A0A]">{nomPersonnel}</p>
                      {demande.personnel_detail?.im && <p className="mt-0.5 text-[11px] text-[#5D5D66]">IM : {demande.personnel_detail.im}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-[#0A0A0A]">{demande.type_absence_libelle || demande.type_absence}</td>
                <td className="px-3 py-3 text-[#0A0A0A]">
                  <p className="text-sm">{dateLisible(demande.date_debut)}</p>
                  <p className="mt-0.5 text-[11px] text-[#5D5D66]">au {dateLisible(demande.date_fin)}</p>
                </td>
                <td className="px-3 py-3 font-semibold tabular-nums text-[#0A0A0A]">{demande.nombre_jours} j</td>
                <td className="px-4 py-3"><BadgeStatut statut={demande.statut_demande} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const aucuneDemande = (
    <div className="px-4 py-14 text-center">
      <span className="rh-pop mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#00FF9C]/10 text-[#0A0A0A] ring-8 ring-[#00FF9C]/5">
        <Icon name="check" className="h-6 w-6" />
      </span>
      <p className="men-serif mt-4 text-2xl text-[#0A0A0A]">Aucune demande en attente</p>
    </div>
  )

  const listeAbsences = planningTrie.length === 0 && !erreurPlanning ? (
    <p className="rounded-xl border border-[#E5E5EA] bg-[#F0F0FF] px-4 py-6 text-center text-xs text-[#5D5D66]">
      Aucune absence prévue sur cette période.
    </p>
  ) : (
    <div className="space-y-2.5">
      {planningTrie.map((absence) => (
        <article key={absence.id_demande} className="rounded-xl border border-[#E5E5EA] bg-white p-3 transition-colors hover:bg-[#F0F0FF]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2.5">
              <Avatar nom={absence.personnel_nom} className="h-8 w-8 text-[10px]" />
              <div>
                <h3 className="text-xs font-semibold text-[#0A0A0A]">{absence.personnel_nom}</h3>
                <p className="mt-0.5 text-[11px] text-[#5D5D66]">{absence.type_absence_libelle || absence.type_absence}</p>
              </div>
            </div>
            <BadgeStatut statut={absence.statut_demande} />
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-[#5D5D66]">
            <Icon name="calendar" className="h-3.5 w-3.5" />
            {dateLisible(absence.date_debut)} <span>au</span> {dateLisible(absence.date_fin)}
            <span className="mx-1">·</span> {absence.nombre_jours} jour(s)
          </p>
        </article>
      ))}
    </div>
  )

  return (
    <CoquilleService
      vue={vue}
      onVue={setVue}
      badges={{ demandes: demandes.length }}
      titre={TITRES_VUES[vue].titre}
      description={TITRES_VUES[vue].description}
      actions={
        <button
          type="button"
          onClick={() => { setChargementDonnees(true); void chargerDashboard() }}
          disabled={chargementDonnees}
          className={`${btnContour} !px-3 !h-9`}
          aria-label="Actualiser"
        >
          <Icon name="refresh" className={`h-4 w-4 ${chargementDonnees ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualiser</span>
        </button>
      }
    >
      <style>{STYLES}</style>

      <div className="min-w-0 space-y-6 rounded-[32px] border border-[#E5E5EA] bg-white p-3 sm:p-4">

      {vue === 'apercu' && (
        <>
          {[erreurDemandes, erreurPersonnel, erreurPlanning].filter(Boolean).map((message) => (
            <Message key={message} type="erreur"><span className="text-xs">{message}</span></Message>
          ))}

          {/* Bannière date + accueil, calquée sur la vue d'ensemble RH */}
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
              <h2 className="men-serif text-2xl leading-tight text-[#0A0A0A] sm:text-4xl">{nomAffichageUtilisateur(utilisateur)}</h2>
              {(chargementDonnees || demandes.length > 0) && (
                <p className="men-serif text-2xl leading-tight text-[#71717B] sm:text-4xl">
                  {chargementDonnees ? 'Chargement des données' : `${demandes.length} demande${demandes.length > 1 ? 's' : ''} à examiner`}
                </p>
              )}
              <p className="mt-2 text-xs text-[#4F4F58]">{service} · suivi des demandes et des absences du service</p>
            </div>
          </section>

          {/* Indicateurs majeurs : mêmes proportions et surfaces que la référence */}
          <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-12">
            <section className={`rh-in flex min-w-0 flex-col justify-between p-5 lg:col-span-3 ${GRIS}`} style={delai(80)}>
              <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white"><Icon name="calendar" className="h-4 w-4" /></span>
                Absences
              </div>
              <div className="mt-4">
                <p className="men-serif text-4xl leading-none tabular-nums text-[#0A0A0A]">{afficheAbsences}</p>
                <p className="mt-1 text-xs text-[#4F4F58]">sur la période consultée</p>
              </div>
              <div className="mt-5 grid grid-cols-12 gap-1.5" aria-hidden="true">
                {Array.from({ length: 36 }, (_, index) => (
                  <span key={index} className={`rh-pop h-2.5 w-2.5 rounded-full ${index < Math.round(ratioValides * 36) ? 'bg-[#00FF9C]' : 'bg-white'}`} style={{ animationDelay: `${300 + index * 18}ms` }} />
                ))}
              </div>
            </section>

            <div className="grid min-w-0 gap-3 lg:col-span-4">
              <section className={`rh-in p-5 ${GRIS}`} style={delai(140)}>
                <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#00FF9C] text-[#0A0A0A]"><Icon name="check" className="h-4 w-4" /></span>
                  Validées par la direction
                </div>
                <p className="men-serif mt-3 text-3xl leading-none tabular-nums text-[#0A0A0A]">{afficheValidees}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="rh-bar h-full rounded-full bg-[#00FF9C]" style={{ width: `${Math.round(ratioValides * 100)}%`, ...delai(500) }} /></div>
              </section>
              <section className={`rh-in p-5 ${GRIS}`} style={delai(200)}>
                <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#FF6A2B] text-white"><Icon name="clock" className="h-4 w-4" /></span>
                  En attente
                </div>
                <p className="men-serif mt-3 text-3xl leading-none tabular-nums text-[#0A0A0A]">{afficheEnAttente}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="rh-bar h-full rounded-full bg-[#FF6A2B]" style={{ width: `${planning.length ? Math.round((nombreAbsencesEnAttente / planning.length) * 100) : 0}%`, ...delai(560) }} /></div>
              </section>
            </div>

            <div className="rh-in grid place-items-center p-1 lg:col-span-2" style={delai(320)}>
              <JaugeTaux ratio={chargementDonnees ? 0 : ratioValides} pct={pourcentageAffiche} />
            </div>

            <section className={`rh-in flex min-w-0 flex-col justify-between p-5 lg:col-span-3 ${GRIS}`} style={delai(380)}>
              <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white"><Icon name="users" className="h-4 w-4" /></span>
                Agents concernés
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="men-serif text-3xl leading-none tabular-nums text-[#0A0A0A]">{affichePersonnelsAvecAbsence}</p>
                  <p className="mt-1 text-xs text-[#4F4F58]">sur {valeur(personnels.length)} agent{personnels.length > 1 ? 's' : ''}</p>
                </div>
                <span className="inline-flex h-8 items-center rounded-full border border-[#E5E5EA] bg-white px-3 text-xs font-semibold tabular-nums text-[#1B1BFF]">{personnels.length ? Math.round((nombrePersonnelsAvecAbsence / personnels.length) * 100) : 0}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="rh-bar h-full rounded-full bg-[#00FF9C]" style={{ width: `${personnels.length ? Math.min(100, (nombrePersonnelsAvecAbsence / personnels.length) * 100) : 0}%`, ...delai(620) }} /></div>
              <div className="mt-2">
                <p className="text-[10px] font-medium text-[#4F4F58]">Départs répartis sur la période</p>
                <MiniCourbe points={(() => {
                  const maintenant = new Date()
                  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
                  const fin = new Date(maintenant)
                  fin.setDate(fin.getDate() + 30)
                  const duree = Math.max(1, fin.getTime() - debut.getTime())
                  const buckets = Array.from({ length: 6 }, (_, index) => ({ libelle: `S${index + 1}`, valeur: 0 }))
                  for (const absence of planning) {
                    const timestamp = new Date(`${absence.date_debut.slice(0, 10)}T12:00:00`).getTime()
                    if (!Number.isFinite(timestamp)) continue
                    const index = Math.max(0, Math.min(5, Math.floor(((timestamp - debut.getTime()) / duree) * 6)))
                    buckets[index].valeur += 1
                  }
                  return buckets
                })()} />
              </div>
            </section>
          </div>

          {/* Répartition et suivi, avec des cartes blanches intégrées aux surfaces grises */}
          <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-12">
            <section className={`rh-in min-w-0 p-5 sm:p-6 lg:col-span-4 ${GRIS}`} style={delai(440)}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-[#0A0A0A]">Répartition par statut</h3>
                <p className="text-xs text-[#4F4F58]">Absences de la période</p>
              </div>
              <div className={`${BLANC} flex min-h-[250px] flex-col items-center justify-center gap-4 p-4`}>
                {parStatut.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#5D5D66]">Aucune absence enregistrée.</p>
                ) : (
                  <>
                    <Donut segments={parStatut} taille={128} centre={<div><p className="men-serif text-2xl leading-none tabular-nums text-[#0A0A0A]">{planning.length}</p><p className="mt-1 text-[10px] text-[#5D5D66]">absences</p></div>} />
                    <Legende segments={parStatut} />
                  </>
                )}
              </div>
            </section>

            <section className={`rh-in min-w-0 p-5 sm:p-6 lg:col-span-8 ${GRIS}`} style={delai(500)}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-[#0A0A0A]">Suivi du service</h3>
                <p className="text-xs text-[#4F4F58]">Demandes à traiter et effectif rattaché</p>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className={`${BLANC} flex min-h-[230px] min-w-0 flex-col p-4`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#0A0A0A]">À examiner</p>
                    {demandes.length > 0 && <button type="button" onClick={() => setVue('demandes')} className="rounded-md text-xs font-semibold text-[#1B1BFF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40">Tout voir</button>}
                  </div>
                  {chargementDonnees ? (
                    <div className="grid flex-1 place-items-center"><span role="status" className="h-5 w-5 animate-spin rounded-full border-2 border-[#1B1BFF]/20 border-t-[#1B1BFF]" /></div>
                  ) : demandes.length === 0 ? (
                    <div className="grid flex-1 place-items-center text-center"><div><span className="rh-pop mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#00FF9C] text-[#0A0A0A]"><Icon name="check" className="h-5 w-5" /></span><p className="mt-3 text-xs text-[#5D5D66]">Rien à examiner</p></div></div>
                  ) : (
                    <ul className="space-y-2.5">
                      {demandes.slice(0, 4).map((demande, index) => {
                        const nomPersonnel = demande.personnel_detail?.nom_complet || `Personnel #${demande.personnel}`
                        return <li key={demande.id_demande} className="rh-in flex min-w-0 items-center gap-2.5" style={delai(580 + index * 60)}><Avatar nom={nomPersonnel} className="h-8 w-8 text-[10px]" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#0A0A0A]">{nomPersonnel}</p><p className="truncate text-[11px] text-[#5D5D66]">{demande.type_absence_libelle || demande.type_absence} · {demande.nombre_jours} j</p></div><span className="hidden shrink-0 text-[10px] text-[#5D5D66] sm:block">{dateLisible(demande.date_debut)}</span></li>
                      })}
                    </ul>
                  )}
                </div>

                <div className={`${BLANC} flex min-h-[230px] min-w-0 flex-col p-4`}>
                  <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[#0A0A0A]">Mon équipe</p><span className="rounded-full bg-[#C2C2CC] px-2.5 py-1 text-[10px] font-semibold text-[#0A0A0A]">{personnels.length} agent{personnels.length > 1 ? 's' : ''}</span></div>
                  {personnels.length === 0 ? (
                    <div className="grid flex-1 place-items-center text-center"><p className="text-xs text-[#5D5D66]">Aucun personnel rattaché.</p></div>
                  ) : (
                    <ul className="space-y-2.5">
                      {personnels.slice(0, 4).map((personnel, index) => (
                        <li key={personnel.id_personnel} className="rh-in flex min-w-0 items-center gap-2.5" style={delai(620 + index * 55)}><Avatar nom={nomAgent(personnel)} className="h-8 w-8 text-[10px]" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#0A0A0A]">{nomAgent(personnel)}</p><p className="truncate text-[11px] text-[#5D5D66]">IM : {personnel.im}</p></div><span className="hidden max-w-[6rem] truncate text-[10px] text-[#5D5D66] sm:block">{personnel.grade || personnel.corps || 'Agent'}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </div>

          <section className={`rh-in mt-3 rounded-[24px] border border-[#B6B6C1] bg-[#C2C2CC] p-5 sm:p-6`} style={delai(560)}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-semibold text-[#0A0A0A]">Calendrier des absences</h3><p className="text-xs text-[#4F4F58]">Sélectionnez un jour pour consulter les absents.</p></div>
              <button type="button" onClick={() => setVue('planning')} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#1B1BFF] transition hover:bg-[#1B1BFF] hover:text-white">Ouvrir le planning</button>
            </div>
            <div className={`${BLANC} p-4`}><MiniCalendrier absences={planning} /></div>
          </section>
        </>
      )}

      {vue === 'demandes' && (
        <section className={`rh-in min-w-0 overflow-hidden ${carte}`}>
          <div className="flex flex-col gap-3 border-b border-[#E5E5EA] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#0A0A0A]">Demandes à examiner</h2>
              <p className="mt-0.5 text-[11px] text-[#5D5D66]">{demandes.length} demande{demandes.length > 1 ? 's' : ''} en attente</p>
            </div>
          </div>
          {erreurDemandes && <div className="p-4"><Message type="erreur"><span className="text-xs">{erreurDemandes}</span></Message></div>}
          {demandes.length === 0 && !erreurDemandes ? aucuneDemande : tableauDemandes}
        </section>
      )}

      {vue === 'personnels' && (
        <>
          {erreurPersonnel && <Message type="erreur"><span className="text-xs">{erreurPersonnel}</span></Message>}

          <div className={`rh-in p-3 ${carte}`}>
            <label className="group relative block">
              <span className="sr-only">Rechercher</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5D5D66] transition-colors group-focus-within:text-[#1B1BFF]" />
              <input type="search" value={rechercheEquipe} onChange={(event) => setRechercheEquipe(event.target.value)} placeholder="Nom ou IM" className={`${champ} pl-9 h-10 text-xs`} />
            </label>
          </div>

          {equipeFiltree.length === 0 && !erreurPersonnel ? (
            <p className={`rounded-[20px] px-4 py-10 text-center text-xs text-[#5D5D66] ${carte}`}>Aucun agent trouvé.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {equipeFiltree.map((personnel, index) => (
                <article key={personnel.id_personnel} className={`rh-in relative overflow-hidden p-4 ${carte}`} style={delai(Math.min(index, 10) * 40)}>
                  <div className="flex items-center gap-3">
                    <Avatar nom={nomAgent(personnel)} className="h-10 w-10 text-xs" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[#0A0A0A]">{nomAgent(personnel)}</p>
                      <p className="mt-0.5 text-[11px] text-[#5D5D66]">IM : {personnel.im}</p>
                    </div>
                  </div>
                  <p className="mt-3 inline-flex rounded-lg bg-[#1B1BFF]/10 px-2 py-1 text-[10px] font-semibold text-[#1B1BFF]">
                    {personnel.grade || personnel.corps || 'Personnel'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {vue === 'planning' && (
        <>
          {erreurPlanning && <Message type="erreur"><span className="text-xs">{erreurPlanning}</span></Message>}
          <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
            <Panneau titre="Calendrier" sousTitre="Jours avec absences" icone="calendar" accent="#1B1BFF" retard={0} className="self-start">
              <MiniCalendrier absences={planning} />
            </Panneau>
            <Panneau titre="Absences" sousTitre={`${planning.length} événement${planning.length > 1 ? 's' : ''} sur la période`} icone="list" accent="#00FF9C" retard={60}>
              {listeAbsences}
            </Panneau>
          </div>
        </>
      )}

      {vue !== 'apercu' && (
        <div className="flex justify-center pt-2 lg:hidden">
          <button type="button" onClick={() => setVue('apercu')} className={btnPrimaire}>
            Retour à la vue d’ensemble
          </button>
        </div>
      )}
      </div>
    </CoquilleService>
  )
}

export default DashboardChefServicePage