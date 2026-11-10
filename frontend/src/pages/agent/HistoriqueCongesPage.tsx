import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'

import { useAuth } from '../../contexts/useAuth'
import { peutAccederEspaceAgent } from '../../lib/roles'
import {
  obtenirHistorique,
  type ElementHistorique,
  type StatutHistorique,
} from '../../services/historiqueCongesService'
import { Icon, Message, type IconName } from '../../components/men/ui'
import { delai, useCompteur } from '../../components/men/ui-outils'
import {
  CoquilleAgent,
  Tiroir,
  type VueAgent,
} from '../../components/men/miseEnPageRH'
import { messageErreurUtilisateur } from '../../lib/messages'

const STATUTS: { valeur: StatutHistorique; libelle: string }[] = [
  { valeur: 'EN_ATTENTE', libelle: 'En attente' },
  { valeur: 'APPROUVE_CS', libelle: 'Visa du chef de service' },
  { valeur: 'VALIDE_DIR', libelle: 'Validée par le directeur' },
  { valeur: 'REJETE', libelle: 'Rejetée' },
  { valeur: 'ARCHIVEE', libelle: 'Archivée' },
]

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

const btnContour =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E5E5EA] bg-white px-4 text-sm font-semibold text-[#0A0A0A] transition duration-200 hover:border-[#E5E5EA] hover:bg-[#F0F0FF] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/15 disabled:pointer-events-none disabled:opacity-60'

const champ =
  'h-11 w-full rounded-xl border border-[#E5E5EA] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#86868B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:bg-[#FAFAF8] disabled:text-[#86868B]'

const etiquette = 'mb-1.5 block text-sm font-medium text-[#0A0A0A]'

const TONS_KPI = {
  bleu: {
    fond: 'from-[#1B1BFF] via-[#1B1BFF] to-[#1B1BFF]',
    ombre: 'shadow-[0_22px_38px_-22px_rgba(27,27,255,.8)]',
  },
  bleuMoyen: {
    fond: 'from-[#1B1BFF] via-[#1B1BFF] to-[#38BDF8]',
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

const TITRES_VUES: Record<VueAgent, { titre: string; description: string }> = {
  apercu: { titre: "Vue d'ensemble", description: 'Demandes et soldes' },
  demandes: { titre: 'Mes demandes', description: 'Suivi des demandes' },
  'nouvelle-demande': { titre: 'Nouvelle demande', description: 'Créer une demande' },
  soldes: { titre: 'Mes soldes', description: 'Solde disponible' },
  historique: { titre: 'Historique', description: 'Validations' },
  profil: { titre: 'Mon profil', description: 'Fiche agent' },
}

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function libelleStatut(demande: ElementHistorique): string {
  return demande.statut_libelle || STATUTS.find((s) => s.valeur === demande.statut_demande)?.libelle || demande.statut_demande
}

function classeStatut(statut: StatutHistorique): string {
  switch (statut) {
    case 'EN_ATTENTE': return 'bg-amber-500/10 text-amber-700'
    case 'APPROUVE_CS': return 'bg-[#1B1BFF]/10 text-[#1B1BFF]'
    case 'VALIDE_DIR': return 'bg-[#00FF9C]/10 text-[#0A0A0A]'
    case 'REJETE': return 'bg-rose-500/10 text-rose-700'
    case 'ARCHIVEE': return 'bg-slate-500/10 text-[#86868B]'
    default: return 'bg-slate-500/10 text-[#86868B]'
  }
}

function dateLisible(date: string | null | undefined): string {
  if (!date) return '—'
  const valeur = new Date(`${date.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(valeur.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(valeur)
}

function dateHeureLisible(date: string): string {
  const valeur = new Date(date)
  if (Number.isNaN(valeur.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(valeur)
}

function erreurLisible(erreur: unknown): string {
  return messageErreurUtilisateur(erreur, "L’historique n’a pas pu être chargé. Réessayez dans quelques instants.")
}

/* ------------------------------------------------------------------ */
/*  Composants locaux                                                  */
/* ------------------------------------------------------------------ */

function BadgeStatut({ statut, libelle }: { statut: StatutHistorique; libelle: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${classeStatut(statut)}`}>
      <span className={`h-2 w-2 rounded-full ${statut === 'VALIDE_DIR' ? 'bg-[#00FF9C]' : statut === 'REJETE' ? 'bg-rose-500' : statut === 'APPROUVE_CS' ? 'bg-[#1B1BFF]' : statut === 'ARCHIVEE' ? 'bg-slate-400' : 'rh-pulse bg-amber-500'}`} />
      {libelle}
    </span>
  )
}

function TuileKpi({ libelle, valeur, note, icone, ton, retard }: {
  libelle: string
  valeur: number
  note: string
  icone: IconName
  ton: keyof typeof TONS_KPI
  retard: number
}) {
  const affiche = useCompteur(valeur)
  const s = TONS_KPI[ton]
  return (
    <div
      className={`rh-in rh-sheen relative overflow-hidden rounded-[20px] bg-gradient-to-br p-5 text-white sm:p-6 ${s.fond} ${s.ombre}`}
      style={{ ...delai(retard), '--d': `${retard}ms` } as React.CSSProperties}
    >
      <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -right-12 -top-14 h-48 w-48 text-white">
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
      <p className="relative mt-5 text-xs font-medium text-white/85">{note}</p>
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

export function HistoriqueCongesPage() {
  const { utilisateur, chargement } = useAuth()
  const [vue, setVue] = useState<VueAgent>('historique')

  const [historique, setHistorique] = useState<ElementHistorique[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [nombrePages, setNombrePages] = useState(1)

  const [rechercheSaisie, setRechercheSaisie] = useState('')
  const [recherche, setRecherche] = useState('')
  const [statut, setStatut] = useState<StatutHistorique | ''>('')

  const [chargementListe, setChargementListe] = useState(true)
  const [erreur, setErreur] = useState('')

  const [tiroirOuvert, setTiroirOuvert] = useState(false)
  const [demandeSelectionnee, setDemandeSelectionnee] = useState<ElementHistorique | null>(null)

  const chargerHistorique = useCallback(async () => {
    setChargementListe(true)
    setErreur('')
    try {
      const personnelId = utilisateur?.personnel?.id_personnel
      if (!personnelId) throw new Error('Aucune fiche du personnel n’est associée à ce compte.')
      const resultat = await obtenirHistorique({ personnelId, page, recherche, statut })
      setHistorique(resultat.resultats)
      setTotal(resultat.total)
      setNombrePages(Math.max(1, resultat.nombre_pages))
    } catch (cause) {
      setHistorique([])
      setTotal(0)
      setNombrePages(1)
      setErreur(erreurLisible(cause))
    } finally {
      setChargementListe(false)
    }
  }, [page, recherche, statut, utilisateur?.personnel?.id_personnel])

  useEffect(() => {
    if (chargement || !utilisateur || !peutAccederEspaceAgent(utilisateur.role)) return
    if (!utilisateur.personnel?.id_personnel) {
      setHistorique([])
      setErreur('Aucune fiche du personnel n’est associée à ce compte.')
      setChargementListe(false)
      return
    }
    void chargerHistorique()
  }, [chargerHistorique, chargement, utilisateur, utilisateur?.personnel?.id_personnel])

  if (chargement) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8]">
        <style>{STYLES}</style>
        <span role="status" aria-label="Chargement" className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1B1BFF]/15 border-t-[#1B1BFF]" />
      </div>
    )
  }

  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (!peutAccederEspaceAgent(utilisateur.role)) return <Navigate to="/app" replace />

  function rechercher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nouvelleRecherche = rechercheSaisie.trim()
    if (page === 1 && recherche === nouvelleRecherche) {
      void chargerHistorique()
      return
    }
    setChargementListe(true)
    setPage(1)
    setRecherche(nouvelleRecherche)
  }

  function filtrerStatut(valeur: string) {
    const nouveauStatut = valeur as StatutHistorique | ''
    if (page === 1 && statut === nouveauStatut) return
    setChargementListe(true)
    setPage(1)
    setStatut(nouveauStatut)
  }

  function changerPage(nouvellePage: number) {
    if (nouvellePage < 1 || nouvellePage > nombrePages || nouvellePage === page) return
    setChargementListe(true)
    setPage(nouvellePage)
  }

  function ouvrirDetail(demande: ElementHistorique) {
    setDemandeSelectionnee(demande)
    setTiroirOuvert(true)
  }

  const enAttente = historique.filter((d) => d.statut_demande === 'EN_ATTENTE').length
  const validees = historique.filter((d) => d.statut_demande === 'VALIDE_DIR').length
  const rejetees = historique.filter((d) => d.statut_demande === 'REJETE').length

  return (
    <CoquilleAgent
      vue={vue}
      onVue={setVue}
      titre={TITRES_VUES[vue].titre}
      description={TITRES_VUES[vue].description}
      actions={
        <button type="button" onClick={() => void chargerHistorique()} disabled={chargementListe} className={`${btnContour} !px-3`} aria-label="Actualiser">
          <Icon name="refresh" className={`h-4 w-4 ${chargementListe ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <style>{STYLES}</style>
      
      <div className="adm-root min-w-0 space-y-6">
        {!tiroirOuvert && erreur && (
          <Message key={erreur} type="erreur" onClose={() => setErreur('')}>
            <span className="text-sm">{erreur}</span>
          </Message>
        )}

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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
                {chargementListe ? 'Chargement…' : total > 0 ? `${total} demande${total > 1 ? 's' : ''} suivie${total > 1 ? 's' : ''}` : 'Aucun historique'}
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
                Consultez les actions des responsables et l’historique complet de chaque demande de congé.
              </p>
            </div>
          </section>

          <section className={`rh-in flex min-w-0 flex-col justify-center gap-6 p-6 sm:flex-row sm:items-center ${carte}`} style={delai(120)}>
            <div className="mx-auto grid h-36 w-36 shrink-0 place-items-center rounded-full border border-[#D9DDFF] bg-[#F6F7FF] p-[7px] shadow-[0_8px_22px_-12px_rgba(27,27,255,.22)] ring-8 ring-[#E9EBFF]/80 sm:mx-0">
              <div className="grid h-full w-full place-items-center rounded-full border border-[#BFC6FF] bg-[#E5E9FF] text-center shadow-[inset_0_1px_3px_rgba(27,27,255,.05)]">
                <p className="men-serif text-3xl leading-none tabular-nums text-[#0A0A0A]">{chargementListe ? '—' : total}</p>
                <p className="mt-1 text-xs font-medium text-[#86868B]">demandes</p>
              </div>
            </div>
            <ul className="min-w-0 flex-1 divide-y divide-[#F5F5F7]">
              <li className="pb-3">
                <div className="flex items-center gap-2 text-xs text-[#86868B]">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  En attente
                </div>
                <p className="men-serif mt-1 text-2xl tabular-nums text-[#0A0A0A]">{enAttente}</p>
              </li>
              <li className="pt-3">
                <div className="flex items-center gap-2 text-xs text-[#86868B]">
                  <span className="h-2 w-2 rounded-full bg-[#00FF9C]" />
                  Validées
                </div>
                <p className="men-serif mt-1 text-2xl tabular-nums text-[#0A0A0A]">{validees}</p>
              </li>
            </ul>
          </section>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TuileKpi libelle="Total" valeur={chargementListe ? 0 : total} note="Demandes suivies" icone="file" ton="bleu" retard={160} />
          <TuileKpi libelle="En attente" valeur={enAttente} note="En cours d’examen" icone="clock" ton="ambre" retard={220} />
          <TuileKpi libelle="Validées" valeur={validees} note="Décision favorable" icone="check" ton="vert" retard={280} />
          <TuileKpi libelle="Rejetées" valeur={rejetees} note="Décision défavorable" icone="alert" ton="bleuMoyen" retard={340} />
        </div>

        <Panneau titre="Rechercher" sousTitre="Filtrer les demandes" icone="search" accent="#1B1BFF" retard={400}>
          <form onSubmit={rechercher} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
            <div className="group">
              <label htmlFor="recherche-historique" className={etiquette}>Référence de la demande</label>
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]" />
                <input
                  id="recherche-historique"
                  type="search"
                  value={rechercheSaisie}
                  onChange={(event) => setRechercheSaisie(event.target.value)}
                  placeholder="Ex. DA-2026-00001"
                  className={`${champ} pl-10`}
                />
              </div>
            </div>
            <div className="group">
              <label htmlFor="statut-historique" className={etiquette}>État</label>
              <select id="statut-historique" value={statut} onChange={(event) => filtrerStatut(event.target.value)} className={champ}>
                <option value="">Tous les états</option>
                {STATUTS.map((option) => (
                  <option key={option.valeur} value={option.valeur}>{option.libelle}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={chargementListe} className={`${btnPrimaire} w-full sm:col-span-2 lg:col-span-1 lg:w-auto`}>
              <Icon name="search" className="h-4 w-4" /> Rechercher
            </button>
          </form>
        </Panneau>

        <section className={`rh-in min-w-0 overflow-hidden ${carte}`} style={delai(460)}>
          <div className="border-b border-[#E5E5EA] bg-[#F0F0FF] p-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <p className="text-base font-semibold text-[#0A0A0A]">Demandes enregistrées</p>
              {!chargementListe && (
                <p className="text-xs font-medium text-[#86868B]">{historique.length} résultat{historique.length > 1 ? 's' : ''} sur {total}</p>
              )}
            </div>
          </div>

          {chargementListe ? (
            <div className="overflow-x-auto p-3" aria-busy="true">
              <table className="w-full min-w-[800px] border-collapse">
                <tbody className="divide-y divide-[#F5F5F7]">
                  {Array.from({ length: 4 }, (_, index) => (
                    <tr key={index} aria-hidden="true">
                      <td className="px-4 py-4"><span className="block h-3 w-32 animate-pulse rounded bg-[#F5F5F7]" /><span className="mt-2 block h-2 w-20 animate-pulse rounded bg-[#F5F5F7]" /></td>
                      <td className="px-3 py-4"><span className="block h-3 w-32 animate-pulse rounded bg-[#F5F5F7]" /></td>
                      <td className="px-3 py-4"><span className="block h-3 w-32 animate-pulse rounded bg-[#F5F5F7]" /></td>
                      <td className="px-3 py-4"><span className="block h-3 w-16 animate-pulse rounded bg-[#F5F5F7]" /></td>
                      <td className="px-3 py-4"><span className="block h-6 w-20 animate-pulse rounded-full bg-[#F5F5F7]" /></td>
                      <td className="px-4 py-4"><span className="block h-3 w-24 animate-pulse rounded bg-[#F5F5F7]" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : historique.length === 0 ? (
            <div className="px-4 py-20 text-center">
              <span className="rh-pop mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#1B1BFF]/10 text-[#1B1BFF] ring-8 ring-[#1B1BFF]/5">
                <Icon name="clock" className="h-8 w-8" />
              </span>
              <p className="men-serif mt-5 text-2xl text-[#0A0A0A]">Aucun historique</p>
              <p className="mt-1 text-sm text-[#86868B]">Aucune demande ne correspond à cette recherche.</p>
              <button type="button" onClick={() => void chargerHistorique()} className={`${btnContour} mt-5`}>
                <Icon name="refresh" className="h-4 w-4" /> Réessayer
              </button>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#F5F5F7] md:hidden">
                {historique.map((demande) => (
                  <article key={demande.id_demande} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-[#0A0A0A]">{demande.numero_enregistrement || `Demande #${demande.id_demande}`}</p>
                        <p className="mt-1 break-words text-xs text-[#86868B]">{demande.type_absence_libelle || demande.type_absence}</p>
                      </div>
                      <BadgeStatut statut={demande.statut_demande} libelle={libelleStatut(demande)} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div><dt className="text-[#86868B]">Début</dt><dd className="mt-0.5 font-medium text-[#0A0A0A]">{dateLisible(demande.date_debut)}</dd></div>
                      <div><dt className="text-[#86868B]">Fin</dt><dd className="mt-0.5 font-medium text-[#0A0A0A]">{dateLisible(demande.date_fin)}</dd></div>
                      <div><dt className="text-[#86868B]">Durée</dt><dd className="mt-0.5 font-medium text-[#0A0A0A]">{demande.nombre_jours} j</dd></div>
                      <div>
                        <dt className="text-[#86868B]">Actions</dt>
                        <dd>
                          <button type="button" onClick={() => ouvrirDetail(demande)} className="mt-0.5 inline-flex items-center gap-1 font-semibold text-[#1B1BFF]">
                            <Icon name="right" className="h-3 w-3" />
                            {demande.validations?.length ? `${demande.validations.length} action${demande.validations.length > 1 ? 's' : ''}` : 'Voir'}
                          </button>
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-y border-[#E5E5EA] bg-[#F0F0FF] text-xs font-semibold text-[#86868B]">
                      <th scope="col" className="px-4 py-3">Référence</th>
                      <th scope="col" className="px-3 py-3">Type</th>
                      <th scope="col" className="px-3 py-3">Période</th>
                      <th scope="col" className="px-3 py-3">Durée</th>
                      <th scope="col" className="px-3 py-3">État</th>
                      <th scope="col" className="px-4 py-3">Suivi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F7]">
                    {historique.map((demande, index) => (
                      <tr key={demande.id_demande} className="rh-in group relative align-top transition-colors hover:bg-[#F0F0FF]" style={delai(Math.min(index, 10) * 40)}>
                        <td className="relative px-4 py-3">
                          <span className="absolute inset-y-2 left-0 w-[3px] scale-y-0 rounded-r-full bg-[#1B1BFF] transition-transform duration-300 group-hover:scale-y-100" />
                          <p className="font-semibold text-[#0A0A0A]">{demande.numero_enregistrement || `Demande #${demande.id_demande}`}</p>
                          <p className="mt-0.5 text-xs text-[#86868B]">Déposée le {dateLisible(demande.date_creation)}</p>
                        </td>
                        <td className="px-3 py-3 text-[#0A0A0A]">{demande.type_absence_libelle || demande.type_absence}</td>
                        <td className="px-3 py-3 text-[#0A0A0A]">
                          <p>{dateLisible(demande.date_debut)}</p>
                          <p className="mt-0.5 text-xs text-[#86868B]">au {dateLisible(demande.date_fin)}</p>
                        </td>
                        <td className="px-3 py-3 font-semibold tabular-nums text-[#0A0A0A]">{demande.nombre_jours} j</td>
                        <td className="px-3 py-3">
                          <BadgeStatut statut={demande.statut_demande} libelle={libelleStatut(demande)} />
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => ouvrirDetail(demande)} className="inline-flex items-center gap-1 rounded-lg bg-[#1B1BFF]/10 px-2.5 py-1 text-xs font-semibold text-[#1B1BFF] transition hover:bg-[#1B1BFF]/20">
                            <Icon name="right" className="h-3 w-3" />
                            {demande.validations?.length ? `${demande.validations.length} action${demande.validations.length > 1 ? 's' : ''}` : 'Voir'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className="flex flex-col gap-3 border-t border-[#E5E5EA] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-xs font-medium text-[#86868B]">
                  Page <span className="font-semibold text-[#0A0A0A]">{page}</span> / {nombrePages} · {total} résultat{total !== 1 ? 's' : ''}
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={page <= 1 || chargementListe} onClick={() => changerPage(page - 1)} className={`${btnContour} !h-9`}>
                    <Icon name="left" className="h-4 w-4" /> Précédent
                  </button>
                  <button type="button" disabled={page >= nombrePages || chargementListe} onClick={() => changerPage(page + 1)} className={`${btnContour} !h-9`}>
                    Suivant <Icon name="right" className="h-4 w-4" />
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      <Tiroir ouvert={tiroirOuvert} onFermer={() => setTiroirOuvert(false)} titre="Détail des validations" sousTitre="Suivi complet de la demande sélectionnée">
        {demandeSelectionnee && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-[#0A0A0A]">
                {demandeSelectionnee.numero_enregistrement || `Demande #${demandeSelectionnee.id_demande}`}
              </p>
              <p className="mt-1 text-xs text-[#86868B]">
                {demandeSelectionnee.type_absence_libelle || demandeSelectionnee.type_absence} · {demandeSelectionnee.nombre_jours} jour{demandeSelectionnee.nombre_jours !== 1 ? 's' : ''} · {dateLisible(demandeSelectionnee.date_debut)} → {dateLisible(demandeSelectionnee.date_fin)}
              </p>
            </div>
            {demandeSelectionnee.validations?.length ? (
              <ol className="relative space-y-4 border-l-2 border-[#E5E5EA] pl-4">
                {demandeSelectionnee.validations.map((validation) => (
                  <li key={validation.id_validation} className="relative">
                    <span className="absolute -left-[22px] top-3 grid h-3 w-3 place-items-center rounded-full bg-[#1B1BFF] shadow-sm" />
                    <div className="rounded-xl border border-[#E5E5EA] bg-white p-4">
                      <p className="text-sm font-semibold text-[#0A0A0A]">{validation.niveau_libelle || validation.niveau}</p>
                      <p className="mt-1 text-xs font-medium text-[#86868B]">{validation.avis_libelle || validation.avis}</p>
                      <p className="mt-1 text-xs text-[#86868B]">{dateHeureLisible(validation.date_action)}</p>
                      {validation.observation && (
                        <p className="mt-2 rounded-lg bg-[#FAFAF8] p-2.5 text-xs leading-relaxed text-[#86868B]">
                          {validation.observation}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-xl border border-dashed border-[#E5E5EA] bg-[#F0F0FF] p-4 text-xs text-[#86868B]">
                Aucune action enregistrée pour cette demande.
              </p>
            )}
            <button type="button" onClick={() => setTiroirOuvert(false)} className={`${btnPrimaire} w-full`}>
              Fermer
            </button>
          </div>
        )}
      </Tiroir>
    </CoquilleAgent>
  )
}

export default HistoriqueCongesPage