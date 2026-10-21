import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useAuth } from '../../contexts/useAuth'
import { peutAccederEspaceAgent } from '../../lib/roles'
import {
  obtenirMesDroits,
  type DroitsAnnuels,
} from '../../services/soldesService'
import { Icon, Message, type IconName } from '../../components/men/ui'
import { delai, useCompteur } from '../../components/men/ui-outils'
import {
  CoquilleAgent,
  type VueAgent,
} from '../../components/men/miseEnPageRH'
import { messageErreurUtilisateur } from '../../lib/messages'

const TITRES_VUES: Record<VueAgent, { titre: string; description: string }> = {
  apercu: { titre: "Vue d'ensemble", description: 'Suivi global des demandes et soldes' },
  demandes: { titre: 'Mes demandes', description: 'Consultez vos demandes et leur état' },
  'nouvelle-demande': { titre: 'Nouvelle demande', description: 'Déposez une demande ou une annonce d’absence' },
  soldes: { titre: 'Mes soldes', description: 'Droits à congé de l’année en cours' },
  historique: { titre: 'Historique', description: 'Détail des validations' },
  profil: { titre: 'Mon profil', description: 'Informations du personnel' },
}

/* ------------------------------------------------------------------ */
/*  Polices + animations (design system AdminComptesPage)              */
/* ------------------------------------------------------------------ */

const STYLES = `
.adm-root{font-family:'Inter Variable','Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;font-feature-settings:'tnum' 0}
.adm-root .men-serif{font-family:'Space Grotesk Variable','Space Grotesk','Inter Variable','Inter',sans-serif;font-weight:500;letter-spacing:-.015em}
.adm-root .tabular-nums{font-variant-numeric:tabular-nums}

@keyframes rh-in{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}
@keyframes rh-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes rh-pop{0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:none}}
@keyframes rh-pulse{0%{box-shadow:0 0 0 0 rgba(217,138,11,.45)}100%{box-shadow:0 0 0 7px rgba(217,138,11,0)}}
@keyframes rh-orbit{to{transform:rotate(360deg)}}
@keyframes rh-sheen{from{transform:translateX(-120%)}to{transform:translateX(280%)}}

.rh-in{animation:rh-in .6s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.rh-bar{transform-origin:left center;animation:rh-bar .9s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.rh-pop{animation:rh-pop .45s cubic-bezier(.22,1,.36,1) backwards}
.rh-pulse{animation:rh-pulse 1.8s ease-out infinite}
.rh-orbit{transform-origin:center;animation:rh-orbit 80s linear infinite}
.rh-sheen::after{content:"";position:absolute;inset:0;width:36%;pointer-events:none;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.18),transparent);
  animation:rh-sheen 1.5s cubic-bezier(.4,0,.2,1) var(--d,600ms) 1 backwards}

@media (prefers-reduced-motion:reduce){
  .rh-in,.rh-bar,.rh-pop,.rh-pulse,.rh-orbit,.rh-sheen::after{animation:none!important}
}
`

/* ------------------------------------------------------------------ */
/*  Styles partagés                                                    */
/* ------------------------------------------------------------------ */

const carte =
  'rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_1px_2px_rgba(15,36,55,0.04),0_10px_28px_-18px_rgba(15,36,55,0.14)]'

const btnPrimaire =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1B1BFF] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(27,27,255,.3),0_8px_16px_-8px_rgba(27,27,255,.55)] transition duration-200 hover:bg-[#1B1BFF] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 disabled:pointer-events-none disabled:opacity-60'

const selecteur =
  'h-10 rounded-xl border border-[#E5E5EA] bg-white px-3 text-sm font-semibold text-[#0A0A0A] outline-none transition hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15'

/* ------------------------------------------------------------------ */
/*  Palette de tons (identique à AdminComptesPage)                     */
/* ------------------------------------------------------------------ */

const TONS_KPI = {
  bleu: {
    fond: 'from-[#1B1BFF] via-[#1B1BFF] to-[#1B1BFF]',
    ombre: 'shadow-[0_22px_38px_-22px_rgba(27,27,255,.8)]',
  },
  vert: {
    fond: 'from-[#00FF9C] via-[#00FF9C] to-[#00FF9C]',
    ombre: 'shadow-[0_22px_38px_-22px_rgba(63,125,32,.8)]',
  },
  ambre: {
    fond: 'from-[#9A4A0A] via-[#B45309] to-[#D97706]',
    ombre: 'shadow-[0_22px_38px_-22px_rgba(180,83,9,.8)]',
  },
} as const

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function afficherErreur(erreur: unknown): string {
  return messageErreurUtilisateur(erreur, 'Impossible de charger vos droits à congé. Réessayez dans quelques instants.')
}

const reduit = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function useMontage() {
  const [pret, setPret] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPret(true)))
    return () => cancelAnimationFrame(id)
  }, [])
  return pret || reduit()
}

/* ------------------------------------------------------------------ */
/*  Composants locaux                                                  */
/* ------------------------------------------------------------------ */

interface Segment {
  libelle: string
  valeur: number
  couleur: string
}

function BadgeStatut({ actif }: { actif: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        actif ? 'bg-[#00FF9C]/10 text-[#0A0A0A]' : 'bg-amber-500/10 text-amber-700'
      }`}
    >
      <span className="relative flex h-2 w-2">
        {actif ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF9C] opacity-50 motion-reduce:animate-none" />
        ) : (
          <span className="absolute inline-flex h-full w-full rh-pulse rounded-full bg-amber-500" />
        )}
        <span className={`relative h-2 w-2 rounded-full ${actif ? 'bg-[#00FF9C]' : 'bg-amber-500'}`} />
      </span>
      {actif ? 'Actif' : 'Non activé'}
    </span>
  )
}

function Donut({
  segments,
  taille = 128,
  epaisseur = 14,
  centre,
}: {
  segments: Segment[]
  taille?: number
  epaisseur?: number
  centre?: ReactNode
}) {
  const pret = useMontage()
  const total = segments.reduce((s, seg) => s + seg.valeur, 0)
  const r = (taille - epaisseur) / 2
  const c = 2 * Math.PI * r
  const visibles = segments.filter((s) => s.valeur > 0)
  const espace = visibles.length > 1 ? 4 : 0
  let cumul = 0

  return (
    <div className="relative shrink-0" style={{ width: taille, height: taille }}>
      <svg
        width={taille}
        height={taille}
        viewBox={`0 0 ${taille} ${taille}`}
        role="img"
        aria-label={segments.map((s) => `${s.libelle} : ${s.valeur}`).join(', ')}
      >
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="#E5E5EA" strokeWidth={epaisseur} />
        {total > 0 &&
          visibles.map((seg, i) => {
            const longueur = (seg.valeur / total) * c
            const trait = Math.max(longueur - espace, 0.01)
            const el = (
              <circle
                key={seg.libelle}
                cx={taille / 2}
                cy={taille / 2}
                r={r}
                fill="none"
                stroke={seg.couleur}
                strokeWidth={epaisseur}
                strokeLinecap="butt"
                strokeDasharray={`${pret ? trait : 0} ${c}`}
                strokeDashoffset={-cumul}
                transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
                style={{
                  transition: reduit() ? 'none' : `stroke-dasharray 1s cubic-bezier(.22,1,.36,1) ${i * 130}ms`,
                }}
              />
            )
            cumul += longueur
            return el
          })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{centre}</div>
    </div>
  )
}

function Legende({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, seg) => s + seg.valeur, 0)
  return (
    <ul className="w-full min-w-0 flex-1 divide-y divide-[#F5F5F7]">
      {segments.map((seg, i) => (
        <li
          key={seg.libelle}
          className="rh-in flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0"
          style={delai(300 + i * 70)}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.couleur }} />
          <span className="min-w-0 flex-1 truncate font-medium text-[#0A0A0A]">{seg.libelle}</span>
          <span className="font-semibold tabular-nums text-[#0A0A0A]">{seg.valeur}</span>
          <span className="w-10 text-right text-xs tabular-nums text-[#86868B]">
            {total ? Math.round((seg.valeur / total) * 100) : 0}%
          </span>
        </li>
      ))}
    </ul>
  )
}

function TuileKpi({
  libelle,
  valeur,
  note,
  part,
  icone,
  ton,
  retard,
}: {
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
      className={`rh-in rh-sheen relative overflow-hidden rounded-[20px] bg-gradient-to-br p-5 text-white sm:p-6 ${s.fond} ${s.ombre}`}
      style={{ ...delai(retard), '--d': `${retard}ms` } as React.CSSProperties}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 200 200"
        className="pointer-events-none absolute -right-12 -top-14 h-48 w-48 text-white"
      >
        <g className="rh-orbit" fill="none" stroke="currentColor">
          <circle cx="100" cy="100" r="90" strokeOpacity=".12" />
          <circle cx="100" cy="100" r="64" strokeOpacity=".16" strokeDasharray="2 8" />
          <path d="M100 10 A90 90 0 0 1 190 100" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white/85">{libelle}</p>
          <p className="men-serif mt-2 text-5xl leading-none tabular-nums">{affiche}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur-sm">
          <Icon name={icone} className="h-5 w-5" />
        </span>
      </div>

      <div className="relative mt-5">
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-white/85">
          <span>{note}</span>
          <span className="font-bold tabular-nums text-white">{Math.round(pct)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
          <div
            className="rh-bar h-full rounded-full bg-white"
            style={{ width: `${pct}%`, ...delai(retard + 350) }}
          />
        </div>
      </div>
    </div>
  )
}

function Panneau({
  titre,
  sousTitre,
  icone,
  accent,
  action,
  retard,
  className = '',
  children,
}: {
  titre: string
  sousTitre?: string
  icone: IconName
  accent: string
  action?: ReactNode
  retard: number
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`rh-in relative flex min-w-0 flex-col overflow-hidden ${carte} ${className}`} style={delai(retard)}>
      <header className="flex items-center justify-between gap-3 border-b border-[#E5E5EA] bg-[#F0F0FF] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${accent}1A`, color: accent }}>
            <Icon name={icone} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[#0A0A0A]">{titre}</h2>
            {sousTitre && <p className="text-xs text-[#86868B]">{sousTitre}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">{children}</div>
    </section>
  )
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

export function MesSoldesPage() {
  const { utilisateur, chargement } = useAuth()
  const anneeActuelle = new Date().getFullYear()
  const [vue, setVue] = useState<VueAgent>('soldes')

  const [annee, setAnnee] = useState(anneeActuelle)
  const [droits, setDroits] = useState<DroitsAnnuels | null>(null)
  const [chargementDroits, setChargementDroits] = useState(true)
  const [erreur, setErreur] = useState('')

  const chargerDroits = useCallback(async (anneeDemandee: number) => {
    setChargementDroits(true)
    try {
      const reponse = await obtenirMesDroits(anneeDemandee)
      setDroits(reponse)
      setErreur('')
    } catch (cause) {
      setDroits(null)
      setErreur(afficherErreur(cause))
    } finally {
      setChargementDroits(false)
    }
  }, [])

  useEffect(() => {
    void chargerDroits(annee)
  }, [annee, chargerDroits])

  if (chargement) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8]">
        <style>{STYLES}</style>
        <span
          role="status"
          aria-label="Chargement"
          className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1B1BFF]/15 border-t-[#1B1BFF]"
        />
      </div>
    )
  }

  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (!peutAccederEspaceAgent(utilisateur.role)) return <Navigate to="/app" replace />

  const anneesDisponibles = Array.from({ length: 7 }, (_, i) => anneeActuelle + 1 - i)

  const joursEngages = droits?.jours_engages ?? 0
  const joursDisponibles = droits?.jours_disponibles ?? 0
  const totalDroits = (droits?.droit_annuel ?? 0) + (droits?.report_anterieur ?? 0)
  const joursPris = droits?.jours_pris ?? 0

  const pourcentageUtilise = totalDroits > 0
    ? Math.min(100, Math.max(0, (joursPris / totalDroits) * 100))
    : 0

  const valeurAffichage = (n: number) => (chargementDroits ? 0 : n)

  const segmentsSolde = useMemo<Segment[]>(
    () => [
      { libelle: 'Jours pris', valeur: joursPris, couleur: '#F59E0B' },
      { libelle: 'Jours disponibles', valeur: joursDisponibles, couleur: '#00FF9C' },
    ],
    [joursPris, joursDisponibles]
  )

  return (
    <CoquilleAgent
      vue={vue}
      onVue={setVue}
      titre={TITRES_VUES[vue].titre}
      description={TITRES_VUES[vue].description}
      actions={
        <select
          id="annee-solde"
          aria-label="Année de référence"
          value={annee}
          onChange={(event) => setAnnee(Number(event.target.value))}
          className={selecteur}
        >
          {anneesDisponibles.map((valeur) => (
            <option key={valeur} value={valeur}>{valeur}</option>
          ))}
        </select>
      }
    >
      <style>{STYLES}</style>

      <div className="adm-root min-w-0 space-y-6">
        {erreur && (
          <Message key={erreur} type="erreur" onClose={() => setErreur('')}>
            <span className="text-sm">{erreur}</span>
          </Message>
        )}

        {/* ---- HERO : carte gradient + état du solde ---- */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="rh-in rh-sheen relative min-w-0 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1B1BFF] via-[#1B1BFF] to-[#1B1BFF] p-6 text-white shadow-[0_20px_38px_-20px_rgba(10,61,92,.75)] sm:p-8">
            <svg aria-hidden="true" viewBox="0 0 400 400" className="pointer-events-none absolute -right-24 -top-28 h-[420px] w-[420px] text-white">
              <g className="rh-orbit" fill="none" stroke="currentColor" strokeLinecap="round">
                <circle cx="200" cy="200" r="190" strokeOpacity=".07" />
                <circle cx="200" cy="200" r="150" strokeOpacity=".09" strokeDasharray="2 10" />
                <circle cx="200" cy="200" r="110" strokeOpacity=".12" />
                <path d="M200 10 A190 190 0 0 1 390 200" strokeOpacity=".28" strokeWidth="2" />
                <path d="M200 90 A110 110 0 0 1 310 200" strokeOpacity=".22" strokeWidth="2" />
              </g>
            </svg>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:36px_36px]" />

            <div className="relative flex h-full min-w-0 flex-col">
              <h2 className="men-serif mt-2 max-w-lg text-3xl font-normal leading-[1.1] sm:text-4xl">
                Mes droits à congé
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
                Consultez vos droits annuels, vos reports et les jours encore disponibles.
              </p>
              <div className="mt-auto pt-7">
                <div className="mb-2 flex items-baseline justify-between text-xs text-white/70">
                  <span>Jours pris</span>
                  <span className="tabular-nums">{valeurAffichage(joursPris)} sur {valeurAffichage(totalDroits)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div className="rh-bar h-full rounded-full bg-white" style={{ width: `${Math.round(pourcentageUtilise)}%`, ...delai(600) }} />
                </div>
              </div>
            </div>
          </section>

          <Panneau
            titre="État du solde"
            sousTitre={`Année ${annee}`}
            icone="calendar"
            accent="#00FF9C"
            retard={120}
            action={
              droits ? (
                <BadgeStatut actif={droits.actif} />
              ) : undefined
            }
          >
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Donut
                segments={segmentsSolde}
                centre={
                  <div>
                    <p className="men-serif text-3xl leading-none tabular-nums text-[#0A0A0A]">
                      {valeurAffichage(joursDisponibles)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-[#86868B]">jours dispo.</p>
                  </div>
                }
              />
              <Legende segments={segmentsSolde} />
            </div>
          </Panneau>
        </div>

        {/* ---- KPI en tuiles gradient ---- */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TuileKpi
            libelle="Droit annuel"
            valeur={valeurAffichage(droits?.droit_annuel ?? 0)}
            note="Quota annuel enregistré"
            part={totalDroits > 0 ? ((droits?.droit_annuel ?? 0) / totalDroits) * 100 : 0}
            icone="calendar"
            ton="bleu"
            retard={160}
          />
          <TuileKpi
            libelle="Reliquat reporté"
            valeur={valeurAffichage(droits?.report_anterieur ?? 0)}
            note="Périodes précédentes"
            part={totalDroits > 0 ? ((droits?.report_anterieur ?? 0) / totalDroits) * 100 : 0}
            icone="refresh"
            ton="bleu"
            retard={220}
          />
          <TuileKpi
            libelle="Jours pris"
            valeur={valeurAffichage(joursPris)}
            note="Déjà déduits"
            part={pourcentageUtilise}
            icone="bolt"
            ton="ambre"
            retard={280}
          />
          <TuileKpi
            libelle="Jours disponibles"
            valeur={valeurAffichage(joursDisponibles)}
            note="Solde après engagements"
            part={totalDroits > 0 ? (joursDisponibles / totalDroits) * 100 : 0}
            icone="check"
            ton="vert"
            retard={340}
          />
        </div>

        {/* ---- État détaillé / chargement / erreur ---- */}
        {chargementDroits ? (
          <section className={`rh-in flex min-h-[180px] items-center justify-center gap-3 ${carte}`} style={delai(400)}>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1B1BFF]/20 border-t-[#1B1BFF]" />
            <span className="text-xs font-medium text-[#86868B]">Chargement des droits {annee}…</span>
          </section>
        ) : droits ? (
          <>
            {!droits.actif && (
              <section className={`rh-in relative overflow-hidden ${carte}`} style={delai(400)}>
                <header className="flex items-center gap-3 border-b border-[#E5E5EA] bg-[#F0F0FF] px-5 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-700">
                    <Icon name="alert" className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-bold text-[#0A0A0A]">Droits non activés pour {annee}</span>
                </header>
                <div className="p-4">
                  <p className="text-xs leading-relaxed text-[#86868B]">
                    Aucun solde actif n’est enregistré pour cette année. Vérifiez auprès des ressources humaines si la décision annuelle a été enregistrée et validée.
                  </p>
                </div>
              </section>
            )}

            <Panneau
              titre={`Détail du solde ${annee}`}
              sousTitre="Droits cumulés, engagements et décision"
              icone="calendar"
              accent="#1B1BFF"
              retard={460}
            >
              <div className="mb-2 flex justify-between text-xs font-medium text-[#86868B]">
                <span>Jours pris</span>
                <span>{Math.round(pourcentageUtilise)} % du droit total</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-[#F5F5F7]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pourcentageUtilise)}
              >
                <div
                  className="rh-bar h-full rounded-full bg-gradient-to-r from-[#1B1BFF] to-[#1B1BFF]"
                  style={{ width: `${pourcentageUtilise}%`, ...delai(600) }}
                />
              </div>

              <div className="mt-6 grid gap-4 border-t border-[#E5E5EA] pt-5 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-[#86868B]">Droits cumulés</p>
                  <p className="men-serif mt-1 text-2xl tabular-nums text-[#0A0A0A]">
                    {totalDroits} <span className="text-sm font-medium text-[#86868B]">jours</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#86868B]">Jours engagés</p>
                  <p className="men-serif mt-1 text-2xl tabular-nums text-[#0A0A0A]">
                    {joursEngages} <span className="text-sm font-medium text-[#86868B]">jours</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#86868B]">Décision annuelle</p>
                  <p className={`mt-1 text-xs font-semibold ${droits.decision_valide ? 'text-[#0A0A0A]' : 'text-amber-700'}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name={droits.decision_valide ? 'check' : 'clock'} className="h-3.5 w-3.5" />
                      {droits.decision_valide ? 'Vérifiée' : 'Non validée'}
                    </span>
                  </p>
                </div>
              </div>
            </Panneau>

            <p className="px-2 text-center text-xs text-[#86868B]">
              Les droits affichés tiennent compte des décisions RH enregistrées. Les soldes définitifs sont établis selon les règles administratives en vigueur.
            </p>
          </>
        ) : (
          <section className={`rh-in p-8 text-center ${carte}`} style={delai(400)}>
            <span className="rh-pop mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#1B1BFF]/10 text-[#1B1BFF] ring-8 ring-[#1B1BFF]/5">
              <Icon name="alert" className="h-8 w-8" />
            </span>
            <p className="men-serif mt-5 text-2xl text-[#0A0A0A]">Soldes indisponibles</p>
            <p className="mt-1 text-sm text-[#86868B]">Les droits de l’année sélectionnée ne peuvent pas être affichés.</p>
            <button type="button" onClick={() => void chargerDroits(annee)} className={`${btnPrimaire} mt-6`}>
              <Icon name="refresh" className="h-4 w-4" /> Réessayer
            </button>
          </section>
        )}
      </div>
    </CoquilleAgent>
  )
}

export default MesSoldesPage