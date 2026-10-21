import { useEffect, useState } from 'react'
import type {
  CSSProperties,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
} from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../../contexts/useAuth'
import {
  activerDecision,
  creerDecision,
  listerDecisions,
  listerPersonnelsRH,
  reporterReliquats,
  scannerDecision,
} from '../../services/rhDecisionsService'
import type {
  CreationDecision,
  DecisionConge,
  NatureDecision,
  PersonnelDecision,
  ResultatScanDecision,
} from '../../services/rhDecisionsService'
import { Icon, Message, type IconName } from '../../components/men/ui.tsx'
import { delai, useCompteur } from '../../components/men/ui-outils.ts'
import {
  decisionsParAnnee,
  decisionsParMois,
} from '../../components/men/graphiques.tsx'
import {
  CoquilleRH,
  Tiroir,
  type VueRH,
} from '../../components/men/miseEnPageRH.tsx'
import { messageErreurUtilisateur } from '../../lib/messages'
import { nomAffichageUtilisateur } from '../../lib/nomAffichageUtilisateur'
import { anneesTitreValides, entierValide, nomValide, normaliserAnneesTitre, normaliserEntier, normaliserNom, normaliserNumeroDecision, normaliserTexteLibre, MESSAGE_NOM } from '../../lib/validationChamps'

type FiltreDecision = 'toutes' | 'valides' | 'non_validees'
type ModeSaisie = 'scan' | 'manuel'

type ConfirmationRH =
  | { type: 'activation'; decision: DecisionConge }
  | { type: 'report'; annee: number }

const EXTENSIONS_SCAN_AUTORISEES = ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff']
const TAILLE_SCAN_MAXIMALE = 15 * 1024 * 1024

interface FormulaireDecision {
  numero_decision: string
  personnel: string
  direction: string
  budget: string
  imputation_budgetaire: string
  corps_grade: string
  indice: string
  annees_titre: string
  details_jours: string
  date_demande_reference: string
  date_emission: string
  signataire: string
  nature: NatureDecision
}

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const STYLES = `
@keyframes rh-in{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}
@keyframes rh-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes rh-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes rh-ring{from{stroke-dashoffset:var(--c)}to{stroke-dashoffset:var(--o)}}
@keyframes rh-pulse{0%{box-shadow:0 0 0 0 rgba(255,106,43,.45)}100%{box-shadow:0 0 0 7px rgba(255,106,43,0)}}
@keyframes rh-pop{0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:none}}
@keyframes rh-fade{from{opacity:0}to{opacity:1}}

.rh-in{animation:rh-in .6s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.rh-draw{stroke-dasharray:1;animation:rh-draw 1.5s cubic-bezier(.4,0,.2,1) var(--d,150ms) backwards}
.rh-bar{transform-origin:left center;animation:rh-bar .9s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.rh-ring{animation:rh-ring 1.3s cubic-bezier(.22,1,.36,1) var(--d,300ms) backwards}
.rh-pulse{animation:rh-pulse 1.8s ease-out infinite}
.rh-pop{animation:rh-pop .45s cubic-bezier(.22,1,.36,1) backwards}
.rh-fade{animation:rh-fade .7s ease-out var(--d,0ms) backwards}

.men-serif{font-family:var(--font-serif,'Space Grotesk Variable','Space Grotesk','Inter Variable','Inter',sans-serif);font-weight:500;letter-spacing:-.01em}

@media (prefers-reduced-motion:reduce){
  .rh-in,.rh-draw,.rh-bar,.rh-ring,.rh-pulse,.rh-pop,.rh-fade{animation:none!important}
  .rh-draw{stroke-dasharray:none}
}
`

/* ------------------------------------------------------------------ */
/*  Styles partagés                                                    */
/* ------------------------------------------------------------------ */

const carte =
  'rounded-[24px] border border-[#B4B4BF] bg-[#C2C2CC] shadow-none'

/* Dashboard : cartes grises bien visibles, éléments blancs à l'intérieur, bleu soutenu */
const GRIS = 'rounded-[24px] bg-[#C2C2CC]'
const BLANC = 'rounded-2xl border border-white bg-white shadow-[0_2px_8px_rgba(10,10,10,0.08)]'
const BLEU = '#1B1BFF'
const VERT = '#00FF9C'
const GRILLE_DECISIONS =
  'md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,.7fr)_minmax(0,1fr)_minmax(0,.9fr)_auto]'

const btnPrimaire =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1B1BFF] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(27,27,255,.3),0_8px_16px_-8px_rgba(27,27,255,.55)] transition duration-200 hover:bg-[#1414D6] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 disabled:pointer-events-none disabled:opacity-60'

const btnContour =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E5E5EA] bg-white px-4 text-sm font-semibold text-[#0A0A0A] transition duration-200 hover:border-[#E5E5EA] hover:bg-[#D0D0D9] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/15 disabled:pointer-events-none disabled:opacity-60'

const btnIcone =
  'grid h-9 w-9 place-items-center rounded-lg text-[#52525B] transition-colors hover:bg-[#1B1BFF]/10 hover:text-[#1B1BFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40 disabled:opacity-50'

const etiquette = 'mb-1.5 block text-sm font-medium text-[#0A0A0A]'

const champ =
  'h-11 w-full rounded-xl border border-[#E5E5EA] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#52525B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:bg-[#D0D0D9] disabled:text-[#52525B]'

const zoneTexte =
  'min-h-[100px] w-full resize-y rounded-xl border border-[#E5E5EA] bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#52525B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15'

const TITRES_VUES: Record<VueRH, { titre: string; description: string }> = {
  apercu: { titre: 'Vue d’ensemble', description: 'Suivi des décisions et des droits à congé' },
  decisions: { titre: 'Décisions', description: 'Consulter, rechercher et activer les soldes' },
  reports: { titre: 'Report des reliquats', description: 'Reporter les soldes d’une année vers la suivante' },
}

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function dateDuJour(): string {
  const maintenant = new Date()
  const annee = maintenant.getFullYear()
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0')
  const jour = String(maintenant.getDate()).padStart(2, '0')
  return `${annee}-${mois}-${jour}`
}

function formulaireInitial(): FormulaireDecision {
  return {
    numero_decision: '',
    personnel: '',
    direction: '',
    budget: 'Budget Général',
    imputation_budgetaire: '',
    corps_grade: '',
    indice: '',
    annees_titre: String(new Date().getFullYear()),
    details_jours: '',
    date_demande_reference: '',
    date_emission: dateDuJour(),
    signataire: '',
    nature: 'SAISIE_MANUELLE',
  }
}

function messageErreur(erreur: unknown): string {
  return messageErreurUtilisateur(erreur, 'L’opération n’a pas pu être effectuée. Vérifiez les informations puis réessayez.')
}

function nomPersonnel(personnel?: PersonnelDecision): string {
  if (!personnel) return 'Agent non renseigné'
  return (
    personnel.nom_complet ||
    [personnel.nom, personnel.prenoms].filter(Boolean).join(' ') ||
    `IM ${personnel.im}`
  )
}

function initiales(nom: string): string {
  const lettres = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase())
    .join('')
  return lettres || '?'
}

function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

/* ------------------------------------------------------------------ */
/*  Composants locaux                                                  */
/* ------------------------------------------------------------------ */

function Bascule<T extends string>({
  nom,
  valeur,
  onChange,
  options,
}: {
  nom: string
  valeur: T
  onChange: (valeur: T) => void
  options: { valeur: T; libelle: string }[]
}) {
  const index = Math.max(0, options.findIndex((option) => option.valeur === valeur))
  return (
    <div
      role="group"
      aria-label={nom}
      className="relative inline-grid shrink-0 rounded-xl bg-[#D0D0D9] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-lg bg-white shadow-[0_1px_2px_rgba(15,36,55,.1),0_2px_6px_-2px_rgba(15,36,55,.12)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.valeur}
          type="button"
          aria-pressed={option.valeur === valeur}
          onClick={() => onChange(option.valeur)}
          className={`relative z-10 whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/50 ${
            option.valeur === valeur ? 'text-[#1B1BFF]' : 'text-[#52525B] hover:text-[#0A0A0A]'
          }`}
        >
          {option.libelle}
        </button>
      ))}
    </div>
  )
}

function GroupeFormulaire({
  icone,
  titre,
  tonChip,
  retard,
  children,
}: {
  icone: IconName
  titre: string
  tonChip: string
  retard: number
  children: ReactNode
}) {
  return (
    <fieldset
      className="rh-in min-w-0 rounded-2xl border border-[#B4B4BF] bg-[#C2C2CC] p-4 sm:p-5 shadow-[0_2px_8px_rgba(10,10,10,0.05)]"
      style={delai(retard)}
    >
      <legend className="sr-only">{titre}</legend>
      <div className="mb-4 flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tonChip}`}>
          <Icon name={icone} className="h-[18px] w-[18px]" />
        </span>
        <h3 className="text-sm font-semibold text-[#0A0A0A]">{titre}</h3>
      </div>
      {children}
    </fieldset>
  )
}

function Jauge({ ratio, pct }: { ratio: number; pct: number }) {
  const t = 150
  const e = 10
  const r = (t - e) / 2
  const c = 2 * Math.PI * r
  const o = c * (1 - Math.min(Math.max(ratio, 0), 1))
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[170px] rounded-full bg-[#0A0A0A] p-2 shadow-[0_18px_30px_-18px_rgba(10,10,10,0.7)]">
      <svg
        viewBox={`0 0 ${t} ${t}`}
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={`Décisions validées : ${Math.round(ratio * 100)} %`}
      >
        <circle cx={t / 2} cy={t / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={e} />
        <circle
          className="rh-ring"
          cx={t / 2}
          cy={t / 2}
          r={r}
          fill="none"
          stroke={VERT}
          strokeWidth={e}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={o}
          style={{ '--c': c, '--o': o } as CSSProperties}
        />
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
  const W = 220
  const H = 70
  const p = 6
  if (points.length === 0) return <div className="h-[70px]" />
  const max = Math.max(1, ...points.map((q) => q.valeur))
  const x = (i: number) => p + (points.length > 1 ? (i / (points.length - 1)) * (W - 2 * p) : (W - 2 * p) / 2)
  const y = (v: number) => H - p - (v / max) * (H - 2 * p)
  const chemin = points.reduce((c, point, i) => {
    if (i === 0) return `M ${x(0)} ${y(point.valeur)}`
    const px = x(i - 1)
    const py = y(points[i - 1].valeur)
    const m = (px + x(i)) / 2
    return `${c} C ${m} ${py} ${m} ${y(point.valeur)} ${x(i)} ${y(point.valeur)}`
  }, '')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[70px] w-full" role="img" aria-label="Décisions émises par mois">
      <path className="rh-draw" pathLength={1} d={chemin} fill="none" stroke={BLEU} strokeWidth="2.5" strokeLinecap="round" />
      <circle className="rh-pop" cx={x(points.length - 1)} cy={y(points[points.length - 1].valeur)} r="4" fill="#fff" stroke={BLEU} strokeWidth="2.5" style={{ animationDelay: '1100ms' }} />
    </svg>
  )
}

function Cercles({ elements }: { elements: { libelle: string; valeur: number }[] }) {
  const liste = [...elements].sort((a, b) => b.valeur - a.valeur).slice(0, 4)
  const n = liste.length
  const T = 250
  const min = 84
  const taille = (i: number) => (n === 1 ? T : T - (i * (T - min)) / (n - 1))
  const fonds = ['bg-[#1B1BFF] text-white', 'bg-[#1B1BFF]/40 text-[#0A0A0A]', 'bg-[#1B1BFF]/20 text-[#0A0A0A]', 'bg-[#1B1BFF]/10 text-[#0A0A0A]']
  if (n === 0) return <p className="py-10 text-center text-sm text-[#52525B]">Aucune donnée</p>
  return (
    <div className="relative mx-auto" style={{ width: T, height: T }}>
      {liste.map((e, i) => (
        <div
          key={e.libelle}
          className={`rh-pop absolute inset-x-0 bottom-0 mx-auto grid content-start justify-items-center rounded-full pt-3 ${fonds[n - 1 - i]}`}
          style={{ width: taille(i), height: taille(i), animationDelay: `${300 + i * 130}ms` }}
        >
          <span className="text-center leading-tight">
            <span className="men-serif block text-base tabular-nums">{e.valeur}</span>
            <span className="block text-[10px] opacity-80">{e.libelle}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function TuileFiltre({
  actif,
  icone,
  libelle,
  valeur,
  retard,
  teinte,
  onClick,
}: {
  actif: boolean
  icone: IconName
  libelle: string
  valeur: number
  retard: number
  teinte: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      style={delai(retard)}
      className={`rh-in group flex items-center justify-between gap-3 rounded-[24px] p-4 text-left transition duration-300 active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/30 sm:p-5 ${
        actif
          ? 'bg-[#1B1BFF] text-white shadow-[0_18px_32px_-18px_rgba(27,27,255,0.8)]'
          : 'bg-[#C2C2CC] text-[#0A0A0A] hover:bg-[#B2B2BE]'
      }`}
    >
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${actif ? 'text-white/85' : 'text-[#424249]'}`}>{libelle}</span>
        <span className="men-serif mt-1 block text-3xl leading-none tabular-nums">{valeur}</span>
      </span>
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform duration-300 group-hover:scale-110 ${
          actif ? 'bg-white/20 text-white' : teinte
        }`}
      >
        <Icon name={icone} className="h-5 w-5" />
      </span>
    </button>
  )
}

function Statut({ valide }: { valide: boolean }) {
  return valide ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#00FF9C] px-3 py-1 text-xs font-semibold text-[#0A0A0A]">
      <Icon name="check" className="h-3 w-3" />
      Valide
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#E5E5EA] bg-white px-3 py-1 text-xs font-semibold text-[#0A0A0A]">
      <span className="rh-pulse h-2 w-2 rounded-full bg-[#FF6A2B]" />
      À vérifier
    </span>
  )
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

export function DecisionsRHPage() {
  const { utilisateur, chargement } = useAuth()

  const [vue, setVue] = useState<VueRH>('apercu')
  const [tiroirOuvert, setTiroirOuvert] = useState(false)
  const [modeSaisie, setModeSaisie] = useState<ModeSaisie>('manuel')

  const [decisions, setDecisions] = useState<DecisionConge[]>([])
  const [toutesDecisions, setToutesDecisions] = useState<DecisionConge[]>([])
  const [personnels, setPersonnels] = useState<PersonnelDecision[]>([])
  const [formulaire, setFormulaire] = useState<FormulaireDecision>(formulaireInitial)

  const [rechercheDecision, setRechercheDecision] = useState('')
  const [filtre, setFiltre] = useState<FiltreDecision>('toutes')
  const [recherchePersonnel, setRecherchePersonnel] = useState('')
  const [fichierScan, setFichierScan] = useState<File | null>(null)
  const [resultatScan, setResultatScan] = useState<ResultatScanDecision | null>(null)
  const [glisse, setGlisse] = useState(false)

  const [chargementListe, setChargementListe] = useState(true)
  const [chargementStats, setChargementStats] = useState(true)
  const [chargementScan, setChargementScan] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [actionEnCours, setActionEnCours] = useState<number | null>(null)
  const [reportEnCours, setReportEnCours] = useState(false)

  const [anneeSource, setAnneeSource] = useState(String(new Date().getFullYear() - 1))
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationRH | null>(null)

  const total = toutesDecisions.length
  const nombreValides = toutesDecisions.filter((d) => d.est_valide).length
  const nombreAVerifier = total - nombreValides
  const nombreOCR = toutesDecisions.filter((d) => d.nature === 'OCR').length
  const nombreManuel = total - nombreOCR
  const ratioValides = total ? nombreValides / total : 0
  const pourcentage = Math.round(ratioValides * 100)
  const aTraiter = toutesDecisions.filter((d) => !d.est_valide)

  const valeurStat = (n: number) => (chargementStats ? 0 : n)
  const affTotal = useCompteur(valeurStat(total))
  const affValides = useCompteur(valeurStat(nombreValides))
  const affAVerifier = useCompteur(valeurStat(nombreAVerifier))
  const affPourcentage = useCompteur(valeurStat(pourcentage))

  async function chargerDecisions(recherche = rechercheDecision, statut = filtre) {
    setChargementListe(true)
    try {
      const resultat = await listerDecisions(recherche, statut)
      setDecisions(resultat.elements ?? [])
      setErreur('')
    } catch (e) {
      setErreur(`Impossible de charger les décisions. ${messageErreur(e)}`)
    } finally {
      setChargementListe(false)
    }
  }

  async function chargerStatistiques() {
    try {
      const resultat = await listerDecisions('', 'toutes')
      setToutesDecisions(resultat.elements ?? [])
    } catch (e) {
      setErreur(`Impossible de charger les statistiques. ${messageErreur(e)}`)
    } finally {
      setChargementStats(false)
    }
  }

  async function actualiser() {
    await Promise.all([chargerDecisions(), chargerStatistiques()])
  }

  async function chargerPersonnels(recherche = recherchePersonnel) {
    try {
      const resultat = await listerPersonnelsRH(recherche)
      setPersonnels(resultat.elements ?? [])
    } catch (e) {
      setErreur(`Impossible de charger la liste du personnel. ${messageErreur(e)}`)
    }
  }

  useEffect(() => {
    void chargerDecisions('', 'toutes')
    void chargerStatistiques()
    void chargerPersonnels('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (chargement) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8]">
        <span role="status" aria-label="Chargement" className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1B1BFF]/15 border-t-[#1B1BFF]" />
      </div>
    )
  }

  if (!utilisateur || utilisateur.role !== 'ROLE_RH') return <Navigate to="/app" replace />

  function modifierChamp(champ: keyof FormulaireDecision, valeur: string) {
    let valeurSecurisee = valeur
    switch (champ) {
      case 'numero_decision':
        valeurSecurisee = normaliserNumeroDecision(valeur)
        break
      case 'annees_titre':
        valeurSecurisee = normaliserAnneesTitre(valeur)
        break
      case 'indice':
        valeurSecurisee = normaliserEntier(valeur, 8)
        break
      case 'signataire':
        valeurSecurisee = normaliserNom(valeur)
        break
      case 'budget':
      case 'imputation_budgetaire':
      case 'corps_grade':
        valeurSecurisee = normaliserTexteLibre(valeur).slice(0, 180)
        break
      case 'details_jours':
        valeurSecurisee = normaliserTexteLibre(valeur, true)
        break
      default:
        break
    }
    setFormulaire((precedent) => ({ ...precedent, [champ]: valeurSecurisee }))
  }

  function selectionnerPersonnel(id: string) {
    const agent = personnels.find((personnel) => String(personnel.id_personnel) === id)
    setFormulaire((precedent) => ({
      ...precedent,
      personnel: id,
      direction: agent ? String(agent.direction) : precedent.direction,
      corps_grade: agent ? [agent.corps, agent.grade].filter(Boolean).join(' ') : precedent.corps_grade,
    }))
  }

  function viderChampFichier() {
    const input = document.getElementById('fichier-scan-decision') as HTMLInputElement | null
    if (input) input.value = ''
  }

  function reinitialiserFormulaire() {
    setFormulaire(formulaireInitial())
    setFichierScan(null)
    setResultatScan(null)
    setErreur('')
    setSucces('')
    viderChampFichier()
  }

  function changerMode(mode: ModeSaisie) {
    setModeSaisie(mode)
    if (mode === 'manuel' && !resultatScan) modifierChamp('nature', 'SAISIE_MANUELLE')
  }

  function ouvrirTiroir(mode: ModeSaisie) {
    setErreur('')
    setSucces('')
    changerMode(mode)
    setTiroirOuvert(true)
  }

  function fermerTiroir() {
    setTiroirOuvert(false)
  }

  function voirADeverifier() {
    setFiltre('non_validees')
    setVue('decisions')
    void chargerDecisions(rechercheDecision, 'non_validees')
  }

  async function traiterScan(fichier: File | null) {
    setResultatScan(null)
    setErreur('')
    setSucces('')
    if (!fichier) {
      setFichierScan(null)
      return
    }

    const extension = fichier.name.toLowerCase().slice(fichier.name.lastIndexOf('.'))
    if (!EXTENSIONS_SCAN_AUTORISEES.includes(extension)) {
      setFichierScan(null)
      viderChampFichier()
      setErreur('Format du scan non autorisé. Utilisez un PDF, JPG, JPEG, PNG, TIF ou TIFF.')
      return
    }
    if (fichier.size > TAILLE_SCAN_MAXIMALE) {
      setFichierScan(null)
      viderChampFichier()
      setErreur('Le scan ne doit pas dépasser 15 Mo.')
      return
    }

    setFichierScan(fichier)
    setChargementScan(true)
    try {
      const resultat = await scannerDecision(fichier)
      setResultatScan(resultat)
      const extrait = resultat.donnees_extraites
      const agent = resultat.agent

      if (agent) {
        setPersonnels((precedent) =>
          precedent.some((p) => p.id_personnel === agent.id_personnel) ? precedent : [agent, ...precedent],
        )
      }

      setFormulaire((precedent) => ({
        ...precedent,
        numero_decision: extrait.numero_decision ? normaliserNumeroDecision(extrait.numero_decision) : precedent.numero_decision,
        personnel: agent ? String(agent.id_personnel) : precedent.personnel,
        direction: agent ? String(agent.direction) : precedent.direction,
        corps_grade: agent ? [agent.corps, agent.grade].filter(Boolean).join(' ') : precedent.corps_grade,
        indice: extrait.indice !== null && extrait.indice !== undefined ? normaliserEntier(String(extrait.indice), 8) : precedent.indice,
        annees_titre: normaliserAnneesTitre(extrait.annees_titre?.trim() || (extrait.annees?.length > 0 ? extrait.annees.join(', ') : precedent.annees_titre)),
        nature: extrait.source === 'OCR' ? 'OCR' : 'SAISIE_MANUELLE',
      }))

      setSucces(
        extrait.source === 'OCR'
          ? 'Scan analysé. Vérifiez chaque information avant l’enregistrement.'
          : 'Le texte n’a pas pu être extrait. Vous pouvez saisir les informations manuellement.',
      )
    } catch (e) {
      setErreur(`Le scan n’a pas pu être analysé. Vous pouvez continuer en saisissant les informations manuellement. ${messageErreur(e)}`)
      setFormulaire((precedent) => ({ ...precedent, nature: 'SAISIE_MANUELLE' }))
    } finally {
      setChargementScan(false)
    }
  }

  function deposerFichier(evenement: DragEvent<HTMLLabelElement>) {
    evenement.preventDefault()
    setGlisse(false)
    if (chargementScan || enregistrement) return
    const fichier = evenement.dataTransfer.files?.[0]
    if (fichier) void traiterScan(fichier)
  }

  function retirerFichier() {
    viderChampFichier()
    void traiterScan(null)
  }

  async function soumettreDecision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErreur('')
    setSucces('')

    if (!formulaire.personnel || !formulaire.direction) {
      setErreur('Sélectionnez un agent dont la direction est renseignée.')
      return
    }
    if (!formulaire.numero_decision.trim()) {
      setErreur('Le numéro de décision est obligatoire.')
      return
    }
    if (!/[\p{L}\p{N}]/u.test(normaliserNumeroDecision(formulaire.numero_decision))) {
      setErreur('Saisissez un numéro de décision contenant des lettres ou des chiffres.')
      return
    }
    if (
      resultatScan?.numero_deja_utilise &&
      resultatScan.donnees_extraites.numero_decision?.trim() === formulaire.numero_decision.trim()
    ) {
      setErreur('Ce numéro de décision existe déjà dans la base. Vérifiez le scan ou corrigez le numéro avant l’enregistrement.')
      return
    }
    if (!formulaire.annees_titre.trim()) {
      setErreur('L’année au titre du congé est obligatoire.')
      return
    }
    if (!anneesTitreValides(formulaire.annees_titre)) {
      setErreur('Indiquez une année ou une plage d’années valide, par exemple 2026 ou 2025-2026.')
      return
    }
    if (formulaire.indice && !entierValide(formulaire.indice, 0, 99999999)) {
      setErreur('L’indice doit être un nombre entier positif.')
      return
    }
    if (formulaire.signataire.trim() && !nomValide(formulaire.signataire)) {
      setErreur(`Le signataire : ${MESSAGE_NOM}`)
      return
    }
    if (!formulaire.date_emission) {
      setErreur('La date d’émission est obligatoire.')
      return
    }

    const donnees: CreationDecision = {
      numero_decision: formulaire.numero_decision.trim(),
      personnel: Number(formulaire.personnel),
      direction: Number(formulaire.direction),
      budget: formulaire.budget.trim() || 'Budget Général',
      imputation_budgetaire: formulaire.imputation_budgetaire.trim(),
      corps_grade: formulaire.corps_grade.trim(),
      indice: formulaire.indice ? Number(formulaire.indice) : null,
      annees_titre: formulaire.annees_titre.trim(),
      details_jours: formulaire.details_jours.trim(),
      date_demande_reference: formulaire.date_demande_reference || null,
      date_emission: formulaire.date_emission,
      signataire: formulaire.signataire.trim(),
      nature: formulaire.nature,
    }

    setEnregistrement(true)
    try {
      const nouvelleDecision = await creerDecision(donnees, fichierScan)
      setFormulaire(formulaireInitial())
      setFichierScan(null)
      setResultatScan(null)
      viderChampFichier()
      setTiroirOuvert(false)
      setVue('decisions')
      setSucces(`La décision n° ${nouvelleDecision.numero_decision} a bien été enregistrée. Vérifiez les informations puis activez les droits si la décision est valide.`)
      await actualiser()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnregistrement(false)
    }
  }

  function confirmerActivation(decision: DecisionConge) {
    setConfirmation({ type: 'activation', decision })
  }

  async function executerConfirmation() {
    const action = confirmation
    if (!action) return

    setErreur('')
    setSucces('')

    if (action.type === 'activation') {
      setActionEnCours(action.decision.id_decision)
      try {
        await activerDecision(action.decision.id_decision)
        setSucces(`Les droits de congé associés à la décision n° ${action.decision.numero_decision} ont bien été activés.`)
        await actualiser()
      } catch (e) {
        setErreur(messageErreur(e))
      } finally {
        setActionEnCours(null)
        setConfirmation(null)
      }
      return
    }

    setReportEnCours(true)
    try {
      const resultat = await reporterReliquats(action.annee)
      setSucces(`Le report des reliquats de ${action.annee} vers ${action.annee + 1} est terminé. ${resultat.nombre_soldes_reportes} solde(s) ont été mis à jour.`)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setReportEnCours(false)
      setConfirmation(null)
    }
  }

  function executerReport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErreur('')
    setSucces('')
    const annee = Number(anneeSource)
    if (!Number.isInteger(annee) || annee < 1900 || annee >= new Date().getFullYear()) {
      setErreur('Saisissez une année antérieure à l’année en cours.')
      return
    }
    setConfirmation({ type: 'report', annee })
  }

  function ajusterAnnee(variation: number) {
    const maximum = new Date().getFullYear() - 1
    const courante = Number(anneeSource) || maximum
    setAnneeSource(String(Math.min(maximum, Math.max(1900, courante + variation))))
  }

  function rechercherAgentAuClavier(evenement: KeyboardEvent<HTMLInputElement>) {
    if (evenement.key === 'Enter') {
      evenement.preventDefault()
      void chargerPersonnels()
    }
  }

  const agentSelectionne = personnels.find((personnel) => String(personnel.id_personnel) === formulaire.personnel)
  const courbeMensuelle = decisionsParMois(toutesDecisions, 6)
  const repartitionAnnees = decisionsParAnnee(toutesDecisions)
  const anneeCibleValide = anneeSource !== '' && Number.isInteger(Number(anneeSource))
  const anneeCible = anneeCibleValide ? Number(anneeSource) + 1 : null

  const maintenant = new Date()
  const jourDuMois = maintenant.getDate()
  const jourSemaine = majuscule(maintenant.toLocaleDateString('fr-FR', { weekday: 'long' }))
  const moisCourant = majuscule(maintenant.toLocaleDateString('fr-FR', { month: 'long' }))
  const nbPoints = 36
  const pointsRemplis = total ? Math.round(ratioValides * nbPoints) : 0
  const sommeCourbe = courbeMensuelle.reduce((s, p) => s + p.valeur, 0)
  const dernierMois = courbeMensuelle.length ? courbeMensuelle[courbeMensuelle.length - 1].valeur : 0
  const moisPrecedent = courbeMensuelle.length > 1 ? courbeMensuelle[courbeMensuelle.length - 2].valeur : 0
  const variation = dernierMois - moisPrecedent
  const titreHero = chargementStats
    ? 'Chargement des données'
    : nombreAVerifier > 0
      ? `${nombreAVerifier} décision${nombreAVerifier > 1 ? 's' : ''} à vérifier`
      : ''

  const messages = (
    <>
      {erreur && <Message key={erreur} type="erreur" onClose={() => setErreur('')}>{erreur}</Message>}
      {succes && <Message key={succes} type="succes" onClose={() => setSucces('')}>{succes}</Message>}
    </>
  )

  return (
    <CoquilleRH
      vue={vue}
      onVue={setVue}
      badges={{ decisions: nombreAVerifier }}
      titre={TITRES_VUES[vue].titre}
      description={TITRES_VUES[vue].description}
      actions={
        <>
          {utilisateur.personnel?.service != null && (
            <Link to="/app/chef-service" className={`${btnContour} !h-9`}>
              <Icon name="building" className="h-4 w-4" />
              <span className="hidden sm:inline">
                Espace du service
                {utilisateur.personnel.service_libelle ? ` · ${utilisateur.personnel.service_libelle}` : ''}
              </span>
            </Link>
          )}
          <button type="button" onClick={() => void actualiser()} disabled={chargementListe || chargementStats} aria-label="Actualiser" title="Actualiser" className={`${btnContour} !px-3 !h-9`}>
            <Icon name="refresh" className={`h-4 w-4 ${chargementListe ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => ouvrirTiroir('scan')} className={`${btnContour} !h-9`}>
            <Icon name="upload" className="h-4 w-4" />
            <span className="hidden sm:inline">Importer un scan</span>
          </button>
          <button type="button" onClick={() => ouvrirTiroir('manuel')} className={`${btnPrimaire} !h-9`}>
            <Icon name="plus" className="h-4 w-4" />
            <span className="hidden sm:inline">Saisie manuelle</span>
          </button>
        </>
      }
    >
      <style>{STYLES}</style>

      {!tiroirOuvert && messages}

      {/* ============================ VUE D'ENSEMBLE ============================ */}
      {vue === 'apercu' && (
        <div className="min-w-0 rounded-[32px] border border-[#E5E5EA] bg-white p-3 sm:p-4">
          {/* En-tête */}
          <section
            className="rh-in flex min-w-0 flex-col gap-4 rounded-[24px] bg-[#D0D0D9] p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between"
            style={delai(0)}
          >
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-[#E5E5EA] bg-white sm:h-24 sm:w-24">
                <span className="men-serif text-3xl tabular-nums sm:text-4xl">{jourDuMois}</span>
              </span>
              <div className="text-sm leading-snug">
                <p className="font-semibold text-[#0A0A0A]">{jourSemaine},</p>
                <p className="text-[#52525B]">{moisCourant}</p>
              </div>
            </div>
            <div className="min-w-0">
              <h2 className="men-serif text-2xl leading-tight text-[#0A0A0A] sm:text-4xl">{nomAffichageUtilisateur(utilisateur)}</h2>
              {titreHero && <p className="men-serif text-2xl leading-tight text-[#52525B] sm:text-4xl">{titreHero}</p>}
            </div>
          </section>

          {/* Statistiques */}
          <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-12">
            <section className={`rh-in flex flex-col justify-between p-5 lg:col-span-3 ${GRIS}`} style={delai(80)}>
              <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white">
                  <Icon name="file" className="h-4 w-4" />
                </span>
                Décisions
              </div>
              <div className="mt-4">
                <p className="men-serif text-4xl leading-none tabular-nums text-[#0A0A0A]">{affTotal}</p>
                <p className="mt-1 text-xs text-[#424249]">au total</p>
              </div>
              <div className="mt-5 grid grid-cols-12 gap-1.5" aria-hidden="true">
                {Array.from({ length: nbPoints }, (_, i) => (
                  <span
                    key={i}
                    className={`rh-pop h-2.5 w-2.5 rounded-full ${i < pointsRemplis ? 'bg-[#00FF9C]' : total ? 'bg-[#FF6A2B]' : 'bg-[#AFAFB9]'}`}
                    style={{ animationDelay: `${300 + i * 18}ms` }}
                  />
                ))}
              </div>
            </section>

            <div className="grid gap-3 lg:col-span-4">
              <section className={`rh-in p-5 ${GRIS}`} style={delai(140)}>
                <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#00FF9C] text-[#0A0A0A]">
                    <Icon name="check" className="h-4 w-4" />
                  </span>
                  Valides
                </div>
                <p className="men-serif mt-3 text-3xl leading-none tabular-nums text-[#0A0A0A]">{affValides}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
                  <div className="rh-bar h-full rounded-full bg-[#00FF9C]" style={{ width: `${pourcentage}%`, ...delai(500) }} />
                </div>
              </section>

              <section className={`rh-in p-5 ${GRIS}`} style={delai(200)}>
                <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#FF6A2B] text-white">
                    <Icon name="clock" className="h-4 w-4" />
                  </span>
                  À vérifier
                </div>
                <p className="men-serif mt-3 text-3xl leading-none tabular-nums text-[#0A0A0A]">{affAVerifier}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
                  <div className="rh-bar h-full rounded-full bg-[#FF6A2B]" style={{ width: `${total ? 100 - pourcentage : 0}%`, ...delai(560) }} />
                </div>
              </section>
            </div>

            <div className="rh-in grid place-items-center lg:col-span-2" style={delai(320)}>
              <Jauge ratio={chargementStats ? 0 : ratioValides} pct={affPourcentage} />
            </div>

            <section className={`rh-in flex flex-col justify-between p-5 lg:col-span-3 ${GRIS}`} style={delai(380)}>
              <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white">
                  <Icon name="calendar" className="h-4 w-4" />
                </span>
                Décisions émises
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="men-serif text-3xl leading-none tabular-nums text-[#0A0A0A]">{valeurStat(sommeCourbe)}</p>
                  <p className="mt-1 text-xs text-[#424249]">sur les 6 derniers mois</p>
                </div>
                <span className="inline-flex h-8 items-center rounded-full border border-[#E5E5EA] bg-white px-3 text-xs font-semibold tabular-nums text-[#1B1BFF]">
                  {variation >= 0 ? '+' : '−'}
                  {Math.abs(valeurStat(variation))}
                </span>
              </div>
              <div className="mt-4">
                <MiniCourbe points={courbeMensuelle} />
              </div>
            </section>
          </div>

          {/* Années + suivi */}
          <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-12">
            <section className={`rh-in p-5 sm:p-6 lg:col-span-4 ${GRIS}`} style={delai(440)}>
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-[#0A0A0A]">Par année au titre du congé</h3>
                <p className="text-xs text-[#424249]">Les années les plus récentes</p>
              </div>
              <Cercles elements={repartitionAnnees} />
            </section>

            <section className={`rh-in min-w-0 p-5 sm:p-6 lg:col-span-8 ${GRIS}`} style={delai(500)}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-[#0A0A0A]">Suivi des décisions</h3>
                <p className="text-xs text-[#424249]">Origine des données et décisions à traiter</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className={`flex min-h-[230px] min-w-0 flex-col p-4 ${BLANC}`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#0A0A0A]">À vérifier</p>
                    {aTraiter.length > 0 && (
                      <button type="button" onClick={voirADeverifier} className="rounded-md text-xs font-semibold text-[#1B1BFF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40">
                        Tout voir
                      </button>
                    )}
                  </div>
                  {aTraiter.length === 0 ? (
                    <div className="grid flex-1 place-items-center text-center">
                      <div>
                        <span className="rh-pop mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#00FF9C] text-[#0A0A0A]">
                          <Icon name="check" className="h-5 w-5" />
                        </span>
                        <p className="mt-3 text-sm text-[#52525B]">Rien à vérifier</p>
                      </div>
                    </div>
                  ) : (
                    <ul className="space-y-2.5">
                      {aTraiter.slice(0, 4).map((decision, i) => {
                        const nom = nomPersonnel(decision.personnel_detail)
                        const enCours = actionEnCours === decision.id_decision
                        return (
                          <li key={decision.id_decision} className="rh-in flex items-center gap-2.5" style={delai(600 + i * 70)}>
                            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1B1BFF] text-[11px] font-bold text-white">
                              {initiales(nom)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-[#0A0A0A]">{decision.numero_decision}</p>
                              <p className="truncate text-[11px] text-[#52525B]">{nom}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void confirmerActivation(decision)}
                              disabled={enCours}
                              aria-label={`Activer les soldes de la décision ${decision.numero_decision}`}
                              title="Activer les soldes"
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#C2C2CC] text-[#0A0A0A] transition hover:bg-[#1B1BFF] hover:text-white active:scale-90 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 disabled:opacity-50"
                            >
                              <Icon name={enCours ? 'loader' : 'bolt'} className={`h-4 w-4 ${enCours ? 'animate-spin' : ''}`} />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <div className={`flex min-h-[230px] flex-col justify-between p-4 ${BLANC}`}>
                  <p className="text-sm font-semibold text-[#0A0A0A]">Origine des données</p>
                  <div className="space-y-5">
                    {[
                      { libelle: 'Scan (OCR)', valeur: nombreOCR, couleur: BLEU },
                      { libelle: 'Saisie manuelle', valeur: nombreManuel, couleur: '#86868B' },
                    ].map((ligne, i) => (
                      <div key={ligne.libelle}>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="text-[#52525B]">{ligne.libelle}</span>
                          <span className="font-semibold tabular-nums text-[#0A0A0A]">{valeurStat(ligne.valeur)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#C2C2CC]">
                          <div
                            className="rh-bar h-full rounded-full"
                            style={{
                              width: `${total ? (ligne.valeur / total) * 100 : 0}%`,
                              backgroundColor: ligne.couleur,
                              ...delai(600 + i * 100),
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ================================ DÉCISIONS ================================ */}
      {vue === 'decisions' && (
        <div className="min-w-0 rounded-[32px] border border-[#E5E5EA] bg-white p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Filtrer les décisions">
            <TuileFiltre
              actif={filtre === 'toutes'}
              icone="file"
              libelle="Toutes"
              teinte="bg-white text-[#0A0A0A]"
              valeur={valeurStat(total)}
              retard={0}
              onClick={() => {
                setFiltre('toutes')
                void chargerDecisions(rechercheDecision, 'toutes')
              }}
            />
            <TuileFiltre
              actif={filtre === 'valides'}
              icone="check"
              libelle="Valides"
              teinte="bg-[#00FF9C] text-[#0A0A0A]"
              valeur={valeurStat(nombreValides)}
              retard={70}
              onClick={() => {
                setFiltre('valides')
                void chargerDecisions(rechercheDecision, 'valides')
              }}
            />
            <TuileFiltre
              actif={filtre === 'non_validees'}
              icone="clock"
              libelle="À vérifier"
              teinte="bg-[#FF6A2B] text-white"
              valeur={valeurStat(nombreAVerifier)}
              retard={140}
              onClick={() => {
                setFiltre('non_validees')
                void chargerDecisions(rechercheDecision, 'non_validees')
              }}
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void chargerDecisions(rechercheDecision, filtre)
            }}
            className="rh-in mt-3 flex min-w-0 flex-col gap-3 rounded-[24px] bg-[#D0D0D9] p-3 sm:flex-row sm:items-center sm:p-4"
            style={delai(200)}
          >
            <label className="group relative min-w-0 flex-1">
              <span className="sr-only">Rechercher une décision</span>
              <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52525B] transition-colors group-focus-within:text-[#1B1BFF]" />
              <input
                value={rechercheDecision}
                onChange={(e) => setRechercheDecision(e.target.value)}
                placeholder="Numéro, IM ou nom"
                className="h-12 w-full rounded-full border border-[#E5E5EA] bg-white pl-11 pr-4 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#52525B] focus:border-[#1B1BFF] focus:ring-4 focus:ring-[#1B1BFF]/15"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              {!chargementListe && (
                <p className="text-xs text-[#424249]">
                  <span className="font-semibold text-[#0A0A0A]">{decisions.length}</span> résultat{decisions.length > 1 ? 's' : ''}
                </p>
              )}
              <button
                type="submit"
                disabled={chargementListe}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#1B1BFF] px-6 text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(27,27,255,0.8)] transition duration-200 hover:bg-[#1414D6] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/30 disabled:pointer-events-none disabled:opacity-60"
              >
                Rechercher
              </button>
            </div>
          </form>

          <section className="rh-in mt-3 rounded-[24px] border border-[#B4B4BF] bg-[#C2C2CC] p-2 sm:p-3" style={delai(260)} aria-busy={chargementListe}>
            {chargementListe ? (
              <ul className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <li key={i} aria-hidden="true" className="flex items-center gap-4 rounded-2xl bg-white p-4">
                    <span className="h-11 w-11 animate-pulse rounded-full bg-[#C2C2CC]" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3.5 w-40 animate-pulse rounded bg-[#C2C2CC]" />
                      <span className="block h-2.5 w-24 animate-pulse rounded bg-[#C2C2CC]" />
                    </span>
                    <span className="h-7 w-20 animate-pulse rounded-full bg-[#C2C2CC]" />
                  </li>
                ))}
              </ul>
            ) : decisions.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <span className="rh-pop mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#1B1BFF] text-white shadow-[0_16px_30px_-14px_rgba(27,27,255,0.8)]">
                  <Icon name="file" className="h-7 w-7" />
                </span>
                <p className="men-serif mt-5 text-2xl text-[#0A0A0A]">Aucune décision</p>
                <p className="mt-1 text-sm text-[#424249]">Rien ne correspond pour le moment.</p>
              </div>
            ) : (
              <>
                <div className={`hidden gap-4 px-5 pb-2 pt-1 text-xs font-medium text-[#424249] md:grid ${GRILLE_DECISIONS}`}>
                  <span>Décision</span>
                  <span>Agent</span>
                  <span>Année(s)</span>
                  <span>Émission</span>
                  <span>Statut</span>
                  <span className="w-[150px]" />
                </div>
                <ul className="space-y-2">
                  {decisions.map((decision, index) => {
                    const nom = nomPersonnel(decision.personnel_detail)
                    const estOCR = decision.nature === 'OCR'
                    const enCours = actionEnCours === decision.id_decision
                    return (
                      <li
                        key={decision.id_decision}
                        className={`rh-in group relative grid items-center gap-3 overflow-hidden rounded-2xl bg-white p-4 transition duration-200 hover:shadow-[0_14px_26px_-18px_rgba(27,27,255,0.55)] md:gap-4 md:px-5 ${GRILLE_DECISIONS}`}
                        style={delai(Math.min(index, 10) * 45)}
                      >
                        <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] origin-center scale-y-0 rounded-r-full bg-[#1B1BFF] transition-transform duration-300 group-hover:scale-y-100" />

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#0A0A0A]">{decision.numero_decision}</p>
                          <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${estOCR ? 'bg-[#1B1BFF] text-white' : 'bg-[#C2C2CC] text-[#424249]'}`}>
                            {estOCR && <Icon name="scan" className="h-3 w-3" />}
                            {decision.nature_libelle || decision.nature || '—'}
                          </span>
                        </div>

                        <div className="flex min-w-0 items-center gap-3">
                          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1B1BFF] text-xs font-bold text-white">
                            {initiales(nom)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#0A0A0A]">{nom}</p>
                            <p className="text-xs text-[#52525B]">IM : {decision.personnel_detail?.im || '—'}</p>
                          </div>
                        </div>

                        <p className="text-sm font-semibold tabular-nums text-[#0A0A0A]">
                          <span className="mr-2 text-xs font-medium text-[#52525B] md:hidden">Année(s)</span>
                          {decision.annees_titre}
                        </p>

                        <p className="inline-flex items-center gap-1.5 text-sm text-[#0A0A0A]">
                          <Icon name="calendar" className="h-3.5 w-3.5 text-[#52525B]" />
                          {decision.date_emission || '—'}
                        </p>

                        <div>
                          <Statut valide={decision.est_valide} />
                        </div>

                        <div className="md:flex md:w-[150px] md:justify-end">
                          <button
                            type="button"
                            onClick={() => void confirmerActivation(decision)}
                            disabled={enCours}
                            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#C2C2CC] px-4 text-xs font-semibold text-[#0A0A0A] transition duration-200 hover:bg-[#1B1BFF] hover:text-white active:scale-[.97] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 disabled:pointer-events-none disabled:opacity-50 md:w-auto"
                          >
                            {enCours ? <Icon name="loader" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="bolt" className="h-3.5 w-3.5" />}
                            Activer les soldes
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>
        </div>
      )}

      {/* ================================ REPORTS ================================ */}
      {vue === 'reports' && (
        <section className={`rh-in mx-auto max-w-3xl p-5 sm:p-7 ${carte}`}>
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#1B1BFF]/10 text-[#1B1BFF]">
              <Icon name="refresh" className="h-6 w-6" />
            </span>
            <div>
              <h2 className="men-serif text-2xl text-[#0A0A0A]">Choisir l’année à reporter</h2>
              <p className="mt-1 text-sm text-[#52525B]">À la création d’un solde N+1, le reliquat N est repris automatiquement. Cette action RH permet aussi de recalculer les soldes déjà présents pour N+1 puis de propager le report aux années suivantes.</p>
            </div>
          </div>
          <form onSubmit={executerReport} className="mt-8">
            <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-2xl border border-white/70 bg-white p-5 text-center shadow-[0_2px_8px_rgba(10,10,10,0.06)]">
                <p className="text-xs font-medium text-[#52525B]">Année source</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button type="button" onClick={() => ajusterAnnee(-1)} aria-label="Année précédente" className="grid h-9 w-9 place-items-center rounded-full border border-[#E5E5EA] bg-white text-[#0A0A0A] transition hover:bg-[#B2B2BE] active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/50">
                    <Icon name="minus" className="h-4 w-4" />
                  </button>
                  <label className="relative">
                    <span className="sr-only">Année source</span>
                    <input id="annee_source" type="number" min="1900" max={new Date().getFullYear() - 1} required value={anneeSource} onChange={(e) => setAnneeSource(e.target.value)} className="men-serif w-32 rounded-md border-b-2 border-transparent bg-transparent text-center text-5xl leading-none tabular-nums text-[#0A0A0A] outline-none transition focus:border-[#1B1BFF]/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  </label>
                  <button type="button" onClick={() => ajusterAnnee(1)} aria-label="Année suivante" className="grid h-9 w-9 place-items-center rounded-full border border-[#E5E5EA] bg-white text-[#0A0A0A] transition hover:bg-[#B2B2BE] active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/50">
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#1B1BFF] text-white shadow-[0_10px_22px_-8px_rgba(27,27,255,.7)] sm:rotate-0 rotate-90">
                <Icon name="arrow" className="h-5 w-5" />
              </span>
              <div className="rounded-2xl border border-white/70 bg-white p-5 text-center shadow-[0_2px_8px_rgba(10,10,10,0.06)]">
                <p className="text-xs font-medium text-[#1B1BFF]">Année cible</p>
                <p key={anneeCible ?? 'vide'} aria-live="polite" className="rh-pop men-serif mt-3 text-5xl leading-[1.1] tabular-nums text-[#1B1BFF]">{anneeCible ?? '—'}</p>
              </div>
            </div>
            <button type="submit" disabled={reportEnCours} className={`${btnPrimaire} mt-8 w-full`}>
              {reportEnCours ? <Icon name="loader" className="h-4 w-4 animate-spin" /> : <Icon name="refresh" className="h-4 w-4" />}
              {reportEnCours ? 'Report en cours' : 'Reporter les reliquats'}
            </button>
          </form>
        </section>
      )}

      {/* ================================ TIROIR ================================ */}
      <Tiroir
        ouvert={tiroirOuvert}
        onFermer={fermerTiroir}
        titre="Nouvelle décision"
        sousTitre={modeSaisie === 'scan' ? 'Le scan est analysé, puis vous vérifiez les informations.' : 'Renseignez la décision à la main.'}
        pied={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={reinitialiserFormulaire} className={btnContour}>
              <Icon name="refresh" className="h-4 w-4" /> Réinitialiser
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={fermerTiroir} className={`${btnContour} flex-1 sm:flex-none`}>Annuler</button>
              <button type="submit" form="formulaire-decision" disabled={enregistrement || chargementScan} className={`${btnPrimaire} flex-1 sm:flex-none`}>
                {enregistrement ? <Icon name="loader" className="h-4 w-4 animate-spin" /> : <Icon name="check" className="h-4 w-4" />}
                {enregistrement ? 'Enregistrement' : 'Enregistrer'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {tiroirOuvert && messages}
          <Bascule<ModeSaisie>
            nom="Mode de saisie"
            valeur={modeSaisie}
            onChange={changerMode}
            options={[
              { valeur: 'scan', libelle: 'Importer un scan' },
              { valeur: 'manuel', libelle: 'Saisie manuelle' },
            ]}
          />

          {modeSaisie === 'scan' && (
            <div className="space-y-3">
              <label
                htmlFor="fichier-scan-decision"
                onDragOver={(evenement) => { evenement.preventDefault(); setGlisse(true) }}
                onDragLeave={() => setGlisse(false)}
                onDrop={deposerFichier}
                className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed px-6 py-10 text-center transition duration-300 focus-within:ring-4 focus-within:ring-[#1B1BFF]/15 ${glisse ? 'scale-[1.01] border-[#1B1BFF]/25 bg-[#1B1BFF]/[0.06]' : 'border-[#B4B4BF] bg-[#D0D0D9] hover:border-[#1B1BFF]/25 hover:bg-[#C2C2CC]'} ${chargementScan || enregistrement ? 'pointer-events-none opacity-80' : ''}`}
              >
                <span className={`grid h-14 w-14 place-items-center rounded-2xl bg-[#1B1BFF]/10 text-[#1B1BFF] transition-transform duration-300 ${glisse ? '-translate-y-1 scale-110' : 'group-hover:-translate-y-1'}`}>
                  <Icon name={chargementScan ? 'scan' : 'upload'} className="h-7 w-7" />
                </span>
                <span className="text-sm font-semibold text-[#0A0A0A]">{chargementScan ? 'Analyse en cours' : 'Déposer un scan ou parcourir'}</span>
                <span className="text-xs text-[#52525B]">PDF, JPG, JPEG, PNG ou TIFF · 15 Mo maximum</span>
                <input id="fichier-scan-decision" type="file" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => void traiterScan(e.target.files?.[0] ?? null)} disabled={chargementScan || enregistrement} className="sr-only" />
                {chargementScan && (
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-[#1B1BFF]/10">
                    <span className="men-indet block h-full w-2/5 rounded-full bg-[#1B1BFF]" />
                  </span>
                )}
              </label>

              {fichierScan && (
                <div className="rh-pop flex items-center gap-3 rounded-xl border border-[#E5E5EA] bg-white px-3.5 py-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#1B1BFF]/10 text-[#1B1BFF]">
                    <Icon name="file" className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#0A0A0A]">{fichierScan.name}</span>
                  <button type="button" onClick={retirerFichier} disabled={chargementScan || enregistrement} className={btnIcone}><Icon name="close" className="h-4 w-4" /></button>
                </div>
              )}

              {resultatScan && (
                <div className="rh-pop space-y-3 rounded-2xl border border-[#E5E5EA] bg-white p-4">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#1B1BFF]/10 px-2.5 py-1.5 text-xs font-semibold text-[#1B1BFF]">
                    <Icon name="scan" className="h-3.5 w-3.5" />
                    {resultatScan.nature || 'Saisie manuelle'}
                  </span>
                  {resultatScan.agent ? (
                    <div className="flex items-center gap-3 rounded-xl border border-[#00FF9C]/35 bg-[#00FF9C] px-3.5 py-3 text-sm text-[#0A0A0A]">
                      <Icon name="check" className="h-4 w-4 shrink-0" />
                      <span className="min-w-0"><strong className="font-semibold">{nomPersonnel(resultatScan.agent)}</strong><span className="opacity-80"> · IM {resultatScan.agent.im}</span></span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-[#B4B4BF] bg-[#D0D0D9] px-3.5 py-3 text-sm text-amber-900">
                      <Icon name="alert" className="h-4 w-4 shrink-0" /> Aucun agent lié à l’IM reconnu. Vérifiez l’IM et sélectionnez l’agent manuellement.
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 rounded-xl border border-[#E5E5EA] bg-[#FAFAF8] p-3 text-xs sm:grid-cols-2">
                    <p><span className="font-semibold">IM reconnu :</span> {resultatScan.donnees_extraites.im || 'Non reconnu'}</p>
                    <p><span className="font-semibold">Numéro :</span> {resultatScan.donnees_extraites.numero_decision || 'Non reconnu'}</p>
                    <p><span className="font-semibold">Indice :</span> {resultatScan.donnees_extraites.indice ?? 'Non reconnu'}</p>
                    <p><span className="font-semibold">Année(s) :</span> {resultatScan.donnees_extraites.annees_titre || (resultatScan.donnees_extraites.annees?.join(', ') || 'Non reconnue(s)')}</p>
                  </div>

                  {resultatScan.numero_deja_utilise && (
                    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
                      <strong>Attention : ce numéro de décision existe déjà.</strong> Vérifiez le document et ne l’enregistrez pas une deuxième fois avec le même numéro.
                    </div>
                  )}

                  {(resultatScan.donnees_extraites.champs_manquants?.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                      <p className="font-semibold">Champs à vérifier ou compléter</p>
                      <ul className="mt-1 list-inside list-disc">
                        {resultatScan.donnees_extraites.champs_manquants?.map((champManquant) => <li key={champManquant}>{champManquant}</li>)}
                      </ul>
                    </div>
                  )}
                  {(resultatScan.donnees_extraites.avertissements?.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                      <p className="font-semibold">Avertissements de lecture OCR</p>
                      <ul className="mt-1 list-inside list-disc">
                        {resultatScan.donnees_extraites.avertissements?.map((avertissement) => <li key={avertissement}>{avertissement}</li>)}
                      </ul>
                    </div>
                  )}
                  {resultatScan.donnees_extraites.texte_brut && (
                    <details className="group text-sm">
                      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-[#0A0A0A] [&::-webkit-details-marker]:hidden">
                        <Icon name="right" className="h-4 w-4 transition-transform duration-200 group-open:rotate-90" />
                        Texte détecté
                      </summary>
                      <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-[#D0D0D9] p-3 text-xs text-[#0A0A0A]">{resultatScan.donnees_extraites.texte_brut}</pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          <form id="formulaire-decision" onSubmit={soumettreDecision} className="space-y-4">
            <GroupeFormulaire icone="file" titre="Décision" tonChip="bg-[#1B1BFF]/10 text-[#1B1BFF]" retard={0}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="group">
                  <label htmlFor="numero_decision" className={etiquette}>Numéro</label>
                  <input id="numero_decision" required value={formulaire.numero_decision} onChange={(e) => modifierChamp('numero_decision', e.target.value)} className={champ} />
                </div>
                <div className="group">
                  <label htmlFor="date_emission" className={etiquette}>Date d’émission</label>
                  <input id="date_emission" type="date" required value={formulaire.date_emission} onChange={(e) => modifierChamp('date_emission', e.target.value)} className={champ} />
                </div>
                <div className="group">
                  <label htmlFor="annees_titre" className={etiquette}>Année(s) au titre du congé</label>
                  <input id="annees_titre" required inputMode="text" maxLength={80} pattern="[0-9 ,\-]+" placeholder="2026 ou 2025-2026" value={formulaire.annees_titre} onChange={(e) => modifierChamp('annees_titre', e.target.value)} className={champ} />
                </div>
              </div>
            </GroupeFormulaire>

            <GroupeFormulaire icone="user" titre="Agent" tonChip="bg-[#1B1BFF]/10 text-[#1B1BFF]" retard={70}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="group">
                  <label htmlFor="recherche_personnel" className={etiquette}>Rechercher</label>
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52525B] transition-colors group-focus-within:text-[#1B1BFF]" />
                      <input id="recherche_personnel" value={recherchePersonnel} onChange={(e) => setRecherchePersonnel(e.target.value)} onKeyDown={rechercherAgentAuClavier} placeholder="Nom, prénom ou IM" className={`${champ} pl-10`} />
                    </div>
                    <button type="button" onClick={() => void chargerPersonnels()} className={`${btnContour} !h-11 !px-3`}><Icon name="search" className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="group">
                  <label htmlFor="personnel" className={etiquette}>Agent concerné</label>
                  <select id="personnel" required value={formulaire.personnel} onChange={(e) => selectionnerPersonnel(e.target.value)} className={champ}>
                    <option value="">Sélectionner un agent</option>
                    {personnels.map((personnel) => (
                      <option key={personnel.id_personnel} value={personnel.id_personnel}>{nomPersonnel(personnel)} — IM {personnel.im}</option>
                    ))}
                  </select>
                  {agentSelectionne && (
                    <p className="rh-pop mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#52525B]">
                      <span className="inline-flex items-center gap-1.5"><Icon name="building" className="h-3.5 w-3.5" />{agentSelectionne.direction_libelle || formulaire.direction || 'Non renseignée'}</span>
                      {agentSelectionne.statut && <span className="rounded-md bg-[#1B1BFF]/10 px-2 py-0.5 font-medium text-[#1B1BFF]">{agentSelectionne.statut}</span>}
                    </p>
                  )}
                </div>
              </div>
            </GroupeFormulaire>

            <GroupeFormulaire icone="wallet" titre="Budget et grade" tonChip="bg-[#1B1BFF]/10 text-[#1B1BFF]" retard={140}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="group"><label htmlFor="budget" className={etiquette}>Budget</label><input id="budget" value={formulaire.budget} onChange={(e) => modifierChamp('budget', e.target.value)} className={champ} /></div>
                <div className="group"><label htmlFor="imputation_budgetaire" className={etiquette}>Imputation budgétaire</label><input id="imputation_budgetaire" value={formulaire.imputation_budgetaire} onChange={(e) => modifierChamp('imputation_budgetaire', e.target.value)} className={champ} /></div>
                <div className="group"><label htmlFor="corps_grade" className={etiquette}>Corps / grade</label><input id="corps_grade" value={formulaire.corps_grade} onChange={(e) => modifierChamp('corps_grade', e.target.value)} className={champ} /></div>
                <div className="group"><label htmlFor="indice" className={etiquette}>Indice</label><input id="indice" type="number" min="0" max="99999999" step="1" inputMode="numeric" value={formulaire.indice} onChange={(e) => modifierChamp('indice', e.target.value)} onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }} className={champ} /></div>
              </div>
            </GroupeFormulaire>

            <GroupeFormulaire icone="list" titre="Compléments" tonChip="bg-slate-500/10 text-[#52525B]" retard={210}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="group"><label htmlFor="date_demande_reference" className={etiquette}>Date de demande de référence</label><input id="date_demande_reference" type="date" value={formulaire.date_demande_reference} onChange={(e) => modifierChamp('date_demande_reference', e.target.value)} className={champ} /></div>
                <div className="group"><label htmlFor="signataire" className={etiquette}>Signataire</label><input id="signataire" value={formulaire.signataire} onChange={(e) => modifierChamp('signataire', e.target.value)} className={champ} /></div>
                <div className="group sm:col-span-2"><label htmlFor="details_jours" className={etiquette}>Détails des jours</label><textarea id="details_jours" rows={3} value={formulaire.details_jours} onChange={(e) => modifierChamp('details_jours', e.target.value)} className={zoneTexte} /></div>
              </div>
            </GroupeFormulaire>
          </form>
        </div>
      </Tiroir>

      {confirmation && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[#0A0A0A]/45 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="rh-confirmation-title"
            aria-describedby="rh-confirmation-description"
            className="men-modal w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-[0_24px_70px_-20px_rgba(10,10,10,.45)] sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1B1BFF]/10 text-[#1B1BFF] ring-8 ring-[#1B1BFF]/5">
                <Icon name={confirmation.type === 'activation' ? 'check' : 'refresh'} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="rh-confirmation-title" className="men-serif text-xl font-semibold text-[#0A0A0A]">
                  {confirmation.type === 'activation' ? 'Confirmer l’activation des droits' : 'Confirmer le report des reliquats'}
                </h2>
                <p id="rh-confirmation-description" className="mt-2 text-sm leading-6 text-[#52525B]">
                  {confirmation.type === 'activation'
                    ? `La décision n° ${confirmation.decision.numero_decision} sera validée et les droits de congé correspondants seront initialisés.`
                    : `Les reliquats non consommés de ${confirmation.annee} seront reportés sur ${confirmation.annee + 1}. Cette opération mettra à jour les soldes concernés.`}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={actionEnCours !== null || reportEnCours}
                onClick={() => setConfirmation(null)}
                className={btnContour}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={actionEnCours !== null || reportEnCours}
                onClick={() => void executerConfirmation()}
                className={btnPrimaire}
              >
                {actionEnCours !== null || reportEnCours
                  ? 'Traitement en cours…'
                  : confirmation.type === 'activation' ? 'Activer les droits' : 'Effectuer le report'}
              </button>
            </div>
          </section>
        </div>
      )}
    </CoquilleRH>
  )
}