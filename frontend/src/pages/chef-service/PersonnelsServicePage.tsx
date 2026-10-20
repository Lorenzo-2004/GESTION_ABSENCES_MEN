import { isAxiosError } from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'

import { useAuth } from '../../contexts/useAuth'
import {
  enregistrerAvisChefService,
  listerDemandesEnAttenteService,
  listerPersonnelsDuService,
  type AvisChefService,
  type DemandeEnAttente,
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

const btnActiver =
  'inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1B1BFF]/10 px-3 text-xs font-semibold text-[#1B1BFF] transition duration-200 hover:bg-[#1B1BFF] hover:text-white active:scale-[.97] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/20 disabled:pointer-events-none disabled:opacity-50'

const champ =
  'h-11 w-full rounded-xl border border-[#E5E5EA] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#5D5D66] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:bg-[#FAFAF8] disabled:text-[#5D5D66]'

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
  ambre: {
    fond: 'bg-[#C2C2CC]',
    ombre: 'shadow-[0_1px_2px_rgba(10,10,10,.04)]',
    accent: '#D97706',
    icone: 'bg-[#FFF0D6] text-[#9A4A0A]',
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

function messageErreur(erreur: unknown): string {
  if (isAxiosError(erreur)) {
    const donnees = erreur.response?.data as { detail?: string; message?: string; error?: string } | undefined
    return donnees?.detail ?? donnees?.message ?? donnees?.error ?? 'Impossible de charger le personnel du service.'
  }
  return 'Une erreur inattendue est survenue.'
}

function initiales(nom: string): string {
  const lettres = nom.split(/\s+/).filter(Boolean).slice(0, 2).map((mot) => mot[0]?.toUpperCase()).join('')
  return lettres || '?'
}

function teinteAvatar(nom: string): string {
  const somme = [...nom].reduce((total, c) => total + c.charCodeAt(0), 0)
  return AVATARS[somme % AVATARS.length]
}

/* ------------------------------------------------------------------ */
/*  Composants locaux                                                  */
/* ------------------------------------------------------------------ */

function Avatar({ nom, className = 'h-10 w-10 text-xs' }: { nom: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-bold ring-1 ring-inset ring-black/5 ${teinteAvatar(nom)} ${className}`}>
      {initiales(nom)}
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

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

export function PersonnelsServicePage() {
  const { utilisateur, chargement } = useAuth()
  const [vue, setVue] = useState<VueService>('personnels')

  const [personnels, setPersonnels] = useState<PersonnelEquipe[]>([])
  const [demandes, setDemandes] = useState<DemandeEnAttente[]>([])
  const [recherche, setRecherche] = useState('')
  const [enChargement, setEnChargement] = useState(true)
  const [chargementDemandes, setChargementDemandes] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreurDemandes, setErreurDemandes] = useState<string | null>(null)
  const [erreurAvis, setErreurAvis] = useState<string | null>(null)
  const [messageAvis, setMessageAvis] = useState('')
  const [avisEnCours, setAvisEnCours] = useState<number | null>(null)
  const [observations, setObservations] = useState<Record<number, string>>({})
  const [cleRechargement, setCleRechargement] = useState(0)

  const roleAutorise = utilisateur?.role === 'ROLE_CHEF_SERVICE' || utilisateur?.role === 'ROLE_RH'
  const serviceId = utilisateur?.personnel?.service ?? null
  const serviceLibelle = utilisateur?.personnel?.service_libelle

  const chargerDemandes = useCallback(async () => {
    if (utilisateur?.role !== 'ROLE_CHEF_SERVICE' && utilisateur?.role !== 'ROLE_RH') {
      setDemandes([])
      setChargementDemandes(false)
      return
    }
    setChargementDemandes(true)
    setErreurDemandes(null)
    try {
      setDemandes(await listerDemandesEnAttenteService())
    } catch (cause) {
      setDemandes([])
      setErreurDemandes(messageErreur(cause))
    } finally {
      setChargementDemandes(false)
    }
  }, [utilisateur?.role])

  useEffect(() => {
    if (chargement) return
    if (!utilisateur || !roleAutorise || serviceId === null) return
    const idService = serviceId
    let actif = true

    async function chargerPersonnels() {
      try {
        const resultat = await listerPersonnelsDuService(idService)
        if (actif) {
          setPersonnels(resultat)
          setErreur(null)
        }
      } catch (cause) {
        if (actif) {
          setErreur(messageErreur(cause))
          setPersonnels([])
        }
      } finally {
        if (actif) setEnChargement(false)
      }
    }
    void chargerPersonnels()
    return () => { actif = false }
  }, [chargement, utilisateur, roleAutorise, serviceId, cleRechargement])

  useEffect(() => {
    if (chargement || !utilisateur || !roleAutorise || serviceId === null) return
    void chargerDemandes()
  }, [chargement, utilisateur, roleAutorise, serviceId, cleRechargement, chargerDemandes])

  async function traiterDemande(idDemande: number, avis: AvisChefService) {
    if (avisEnCours !== null) return
    const demande = demandes.find((element) => element.id_demande === idDemande)
    const observation = (observations[idDemande] ?? '').trim()

    if (demande && ['PERMISSION', 'AUTORISATION'].includes(demande.type_absence) && !observation) {
      setErreurAvis('Une observation motivée est obligatoire pour ce type de demande.')
      setMessageAvis('')
      return
    }

    setAvisEnCours(idDemande)
    setErreurAvis(null)
    setMessageAvis('')

    try {
      await enregistrerAvisChefService(idDemande, avis, observation)
      setMessageAvis(avis === 'FAVORABLE' ? 'Le visa favorable a été enregistré.' : 'Le visa défavorable a été enregistré.')
      setObservations((precedentes) => ({ ...precedentes, [idDemande]: '' }))
      await chargerDemandes()
    } catch (cause) {
      setErreurAvis(messageErreur(cause))
    } finally {
      setAvisEnCours(null)
    }
  }

  const personnelsFiltres = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase('fr')
    if (!terme) return personnels
    return personnels.filter((personnel) => {
      const contenu = [personnel.im, personnel.nom, personnel.prenoms, personnel.nom_complet, personnel.corps, personnel.grade]
        .filter(Boolean).join(' ').toLocaleLowerCase('fr')
      return contenu.includes(terme)
    })
  }, [personnels, recherche])

  if (chargement) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8]">
        <span role="status" aria-label="Chargement" className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1B1BFF]/15 border-t-[#1B1BFF]" />
      </div>
    )
  }

  if (!utilisateur || !roleAutorise) return <Navigate to="/403" replace />

  if (serviceId === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8] p-6">
        <section className={`max-w-lg p-8 text-center ${carte}`}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/10 text-amber-700">
            <Icon name="alert" className="h-7 w-7" />
          </span>
          <h1 className="men-serif mt-5 text-2xl font-normal text-[#0A0A0A]">Aucun service associé</h1>
          <p className="mt-2 text-sm text-[#5D5D66]">Votre compte ne possède pas de service associé. Contactez l’administrateur.</p>
        </section>
      </div>
    )
  }

  const valeurAffichage = (n: number) => (enChargement ? 0 : n)
  const total = personnels.length || 1
  const part = (n: number) => Math.round((n / total) * 100)

  return (
    <CoquilleService
      vue={vue}
      onVue={setVue}
      titre={TITRES_VUES[vue].titre}
      description={TITRES_VUES[vue].description}
      actions={
        <button
          type="button"
          onClick={() => setCleRechargement((cle) => cle + 1)}
          disabled={enChargement}
          className={`${btnContour} !px-3 !h-9`}
          aria-label="Actualiser"
        >
          <Icon name="refresh" className={`h-4 w-4 ${enChargement ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <style>{STYLES}</style>

      <div className="min-w-0 space-y-6 rounded-[32px] border border-[#E5E5EA] bg-white p-3 sm:p-4">

      {erreur && (
        <Message key={erreur} type="erreur" onClose={() => setErreur(null)}>
          <span className="block text-xs">{erreur}</span>
          <button type="button" onClick={() => setCleRechargement((cle) => cle + 1)} className={`${btnActiver} mt-2`}>
            <Icon name="refresh" className="h-3.5 w-3.5" /> Réessayer
          </button>
        </Message>
      )}

      {/* Bandeau plein largeur : même composition que la vue d'ensemble RH */}
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
          <p className="men-serif text-2xl leading-tight text-[#71717B] sm:text-4xl">Mon équipe</p>
          <p className="mt-2 text-xs text-[#4F4F58]">{serviceLibelle || 'Agents affectés à votre service'} · {valeurAffichage(personnels.length)} agent{personnels.length > 1 ? 's' : ''} rattaché{personnels.length > 1 ? 's' : ''}</p>
          {(utilisateur.role === 'ROLE_CHEF_SERVICE' || utilisateur.role === 'ROLE_RH') && demandes.length > 0 && (
            <button type="button" onClick={() => void chargerDemandes()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#1B1BFF] px-4 text-xs font-semibold text-white transition hover:bg-[#1414D6] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25">
              Examiner les demandes <Icon name="arrow" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </section>

      {/* TUILES KPI - Ajustées plus petites */}
      <div className="grid gap-4 sm:grid-cols-3">
        <TuileKpi libelle="Agents" valeur={valeurAffichage(personnels.length)} note="Effectif retourné" part={100} icone="users" ton="bleu" retard={160} />
        <TuileKpi libelle="Résultats filtrés" valeur={valeurAffichage(personnelsFiltres.length)} note="Après recherche" part={part(personnelsFiltres.length)} icone="search" ton="bleuMoyen" retard={220} />
        <TuileKpi libelle="Demandes en attente" valeur={valeurAffichage(demandes.length)} note="Visa du chef" part={part(demandes.length)} icone="clock" ton="ambre" retard={280} />
      </div>

      {(utilisateur.role === 'ROLE_CHEF_SERVICE' || utilisateur.role === 'ROLE_RH') && (
        <Panneau
          titre="Demandes à valider"
          sousTitre={chargementDemandes ? 'Chargement…' : `${demandes.length} demande${demandes.length > 1 ? 's' : ''} en attente`}
          icone="clock"
          accent="#F59E0B"
          retard={340}
          action={
            <button type="button" onClick={() => void chargerDemandes()} disabled={chargementDemandes || avisEnCours !== null} className={`${btnContour} !h-9 !px-3`}>
              <Icon name="refresh" className={`h-4 w-4 ${chargementDemandes ? 'animate-spin' : ''}`} />
            </button>
          }
        >
          <div className="space-y-3">
            {erreurDemandes && <Message type="erreur" onClose={() => setErreurDemandes(null)}><span className="text-xs">{erreurDemandes}</span></Message>}
            {erreurAvis && <Message type="erreur" onClose={() => setErreurAvis(null)}><span className="text-xs">{erreurAvis}</span></Message>}
            {messageAvis && <Message type="succes" onClose={() => setMessageAvis('')}><span className="text-xs">{messageAvis}</span></Message>}

            {chargementDemandes ? (
              <div className="grid min-h-28 place-items-center">
                <span role="status" className="h-6 w-6 animate-spin rounded-full border-2 border-[#1B1BFF]/20 border-t-[#1B1BFF]" />
              </div>
            ) : demandes.length === 0 ? (
              <div className="py-8 text-center">
                <span className="rh-pop mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#00FF9C]/10 text-[#0A0A0A]">
                  <Icon name="check" className="h-6 w-6" />
                </span>
                <p className="mt-3 text-sm font-semibold text-[#0A0A0A]">Aucune demande en attente</p>
                <p className="mt-1 text-xs text-[#5D5D66]">Les nouvelles demandes de votre service apparaîtront ici.</p>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {demandes.map((demande, i) => {
                  const nom = demande.personnel_detail?.nom_complet || [demande.personnel_detail?.prenoms, demande.personnel_detail?.nom].filter(Boolean).join(' ') || `Personnel #${demande.personnel}`
                  const observationObligatoire = ['PERMISSION', 'AUTORISATION'].includes(demande.type_absence)

                  return (
                    <article key={demande.id_demande} className="rh-in rounded-2xl border border-[#E5E5EA] bg-white p-4" style={delai(Math.min(i, 10) * 40)}>
                      <div className="flex items-start gap-3">
                        <Avatar nom={nom} className="h-10 w-10 text-xs" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#0A0A0A]">{nom}</p>
                          {demande.personnel_detail?.im && <p className="mt-0.5 text-xs text-[#5D5D66]">IM : {demande.personnel_detail.im}</p>}
                          <p className="mt-1.5 text-sm font-medium text-[#0A0A0A]">{demande.type_absence_libelle || demande.type_absence}</p>
                          <p className="mt-0.5 text-xs text-[#5D5D66]">Du {demande.date_debut} au {demande.date_fin} · {demande.nombre_jours} j</p>
                          {demande.motif && <p className="mt-1.5 whitespace-pre-wrap text-xs text-[#5D5D66]">{demande.motif}</p>}
                        </div>
                      </div>

                      <label htmlFor={`observation-chef-${demande.id_demande}`} className="mt-3 block text-xs font-semibold text-[#5D5D66]">
                        Observation {observationObligatoire ? '(obligatoire)' : '(facultative)'}
                      </label>
                      <textarea
                        id={`observation-chef-${demande.id_demande}`}
                        value={observations[demande.id_demande] ?? ''}
                        onChange={(event) => setObservations((anciennes) => ({ ...anciennes, [demande.id_demande]: event.target.value }))}
                        rows={2}
                        disabled={avisEnCours === demande.id_demande}
                        placeholder="Motif ou précision…"
                        className="mt-1.5 w-full rounded-lg border border-[#E5E5EA] bg-white px-3 py-2 text-sm text-[#0A0A0A] outline-none transition focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:opacity-50"
                      />

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void traiterDemande(demande.id_demande, 'FAVORABLE')} disabled={avisEnCours !== null} className={`${btnPrimaire} !h-9 !bg-[#1B1BFF] !text-xs hover:!bg-[#1B1BFF]`}>
                          {avisEnCours === demande.id_demande ? <Icon name="loader" className="h-4 w-4 animate-spin" /> : <Icon name="check" className="h-4 w-4" />}
                          Accorder
                        </button>
                        <button type="button" onClick={() => void traiterDemande(demande.id_demande, 'DEFAVORABLE')} disabled={avisEnCours !== null} className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
                          <Icon name="alert" className="h-4 w-4" /> Rejeter
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </Panneau>
      )}

      <section className={`rh-in p-4 sm:p-5 ${carte}`}>
        <label className="group relative block">
          <span className="sr-only">Rechercher un agent</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5D5D66] transition-colors group-focus-within:text-[#1B1BFF]" />
          <input
            type="search"
            value={recherche}
            onChange={(event) => setRecherche(event.target.value)}
            placeholder="Nom, IM, corps ou grade…"
            className={`${champ} pl-10`}
          />
        </label>
      </section>

      <section className={`rh-in min-w-0 overflow-hidden ${carte}`} style={delai(400)}>
        <div className="flex flex-col gap-1 border-b border-[#E5E5EA] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-[#0A0A0A]">Liste des agents</h2>
            <p className="mt-0.5 text-xs text-[#5D5D66]">
              {enChargement ? 'Chargement…' : `${personnelsFiltres.length} agent${personnelsFiltres.length > 1 ? 's' : ''} affiché${personnelsFiltres.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {enChargement ? (
          <div className="overflow-x-auto p-4" aria-busy="true">
            <table className="w-full min-w-[1040px] border-collapse">
              <tbody className="divide-y divide-[#F5F5F7]">
                {Array.from({ length: 5 }, (_, index) => (
                  <tr key={index} aria-hidden="true">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#F5F5F7]" />
                        <div className="space-y-1.5">
                          <span className="block h-3.5 w-32 animate-pulse rounded bg-[#F5F5F7]" />
                          <span className="block h-2.5 w-20 animate-pulse rounded bg-[#F5F5F7]" />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className="block h-3.5 w-16 animate-pulse rounded bg-[#F5F5F7]" /></td>
                    <td className="px-3 py-3"><span className="block h-3.5 w-20 animate-pulse rounded bg-[#F5F5F7]" /></td>
                    <td className="px-3 py-3"><span className="block h-3.5 w-20 animate-pulse rounded bg-[#F5F5F7]" /></td>
                    <td className="px-4 py-3"><span className="block h-3.5 w-20 animate-pulse rounded bg-[#F5F5F7]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : personnelsFiltres.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <span className="rh-pop mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#1B1BFF]/10 text-[#1B1BFF] ring-8 ring-[#1B1BFF]/5">
              <Icon name="search" className="h-7 w-7" />
            </span>
            <p className="men-serif mt-4 text-2xl text-[#0A0A0A]">
              {personnels.length === 0 ? 'Aucun agent' : 'Aucun résultat'}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs text-[#5D5D66]">
              {personnels.length === 0 ? "Vérifiez les affectations de ce service." : 'Essayez un autre nom, IM, corps ou grade.'}
            </p>
            {recherche && (
              <button type="button" onClick={() => setRecherche('')} className="mt-3 text-xs font-semibold text-[#1B1BFF] hover:underline">
                Effacer la recherche
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-y border-[#E5E5EA] bg-[#F0F0FF] text-xs font-semibold text-[#5D5D66]">
                    <th scope="col" className="px-5 py-3">Agent</th>
                    <th scope="col" className="px-3 py-3">IM</th>
                    <th scope="col" className="px-3 py-3">Corps</th>
                    <th scope="col" className="px-3 py-3">Grade</th>
                    <th scope="col" className="px-5 py-3">Service</th>
                    {(utilisateur.role === 'ROLE_CHEF_SERVICE' || utilisateur.role === 'ROLE_RH') && <th scope="col" className="px-5 py-3">Planning</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F7]">
                  {personnelsFiltres.map((personnel, index) => {
                    const nom = personnel.nom_complet || [personnel.nom, personnel.prenoms].filter(Boolean).join(' ')
                    return (
                      <tr key={personnel.id_personnel} className="rh-in group relative transition-colors hover:bg-[#F0F0FF]" style={delai(Math.min(index, 10) * 40)}>
                        <td className="relative px-5 py-3">
                          <span className="absolute inset-y-2 left-0 w-[3px] scale-y-0 rounded-r-full bg-[#1B1BFF] transition-transform duration-300 group-hover:scale-y-100" />
                          <div className="flex items-center gap-3">
                            <Avatar nom={nom} className="h-10 w-10 text-xs" />
                            <div>
                              <p className="font-semibold text-[#0A0A0A]">{nom || 'Nom non renseigné'}</p>
                              <p className="mt-0.5 text-xs text-[#5D5D66]">ID : {personnel.id_personnel}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex rounded-md bg-[#FAFAF8] px-2.5 py-1 font-mono text-xs font-semibold text-[#0A0A0A]">
                            {personnel.im || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[#0A0A0A]">{personnel.corps || '—'}</td>
                        <td className="px-3 py-3 text-[#0A0A0A]">{personnel.grade || '—'}</td>
                        <td className="px-5 py-3 text-[#0A0A0A]">{personnel.service_libelle || serviceLibelle || '—'}</td>
                        {(utilisateur.role === 'ROLE_CHEF_SERVICE' || utilisateur.role === 'ROLE_RH') && (
                          <td className="px-5 py-3">
                            {personnel.id_personnel !== utilisateur.personnel?.id_personnel ? (
                              <Link
                                to={`/app/chef-service/nouvelle-demande?personnel=${personnel.id_personnel}`}
                                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1B1BFF]/10 px-3 text-xs font-semibold text-[#1B1BFF] transition hover:bg-[#1B1BFF] hover:text-white"
                              >
                                <Icon name="calendar" className="h-3.5 w-3.5" /> Préparer
                              </Link>
                            ) : (
                              <span className="text-xs font-medium text-[#5D5D66]">Pour vous</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-[#E5E5EA] px-5 py-3 text-xs text-[#5D5D66]">
              {personnelsFiltres.length} agent{personnelsFiltres.length > 1 ? 's' : ''} affiché{personnelsFiltres.length > 1 ? 's' : ''}{recherche.trim() ? ' pour cette recherche' : ''}.
            </p>
          </>
        )}
      </section>
      </div>
    </CoquilleService>
  )
}

export default PersonnelsServicePage