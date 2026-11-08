import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'

import { useAuth } from '../../contexts/useAuth'
import { peutAccederEspaceAgent } from '../../lib/roles'
import { typePossedeFicheOfficielle } from '../../services/congesService'
import {
  creerDemandeConge,
  recupererRegleTrancheAnnuelle,
  type RegleTrancheAnnuelle,
  type TypeAbsence,
} from '../../services/nouvelleDemandeService'
import {
  listerPersonnelsDuService,
  type PersonnelEquipe,
} from '../../services/chefServiceService'
import { listerPersonnelsRH } from '../../services/rhDecisionsService'
import { Icon, Message, type IconName } from '../../components/men/ui'
import { delai } from '../../components/men/ui-outils'
import {
  CoquilleAgent,
  CoquilleRH,
  CoquilleService,
  type VueAgent,
} from '../../components/men/miseEnPageRH'
import { messageErreurUtilisateur } from '../../lib/messages'
import { normaliserEntier, normaliserTexteLibre, texteContientLettres } from '../../lib/validationChamps'

const TYPES_ABSENCE: { valeur: TypeAbsence; libelle: string }[] = [
  { valeur: 'CONGE_ANNUEL', libelle: 'Congé annuel' },
  { valeur: 'PERMISSION', libelle: "Permission d’absence" },
  { valeur: 'AUTORISATION', libelle: 'Autorisation / faveur' },
  { valeur: 'MISSION', libelle: 'Ordre de mission' },
  { valeur: 'MATERNITE', libelle: 'Congé de maternité' },
  { valeur: 'PATERNITE', libelle: 'Congé de paternité' },
  { valeur: 'REPOS_SANITAIRE', libelle: 'Repos sanitaire' },
]

function typesAbsenceSelonProfil(statut?: string | null, sexe?: string | null) {
  const estStagiaire = statut?.toUpperCase() === 'STAGIAIRE'
  const sexeCode = sexe?.trim().toUpperCase()
  return TYPES_ABSENCE.filter(({ valeur }) => {
    if (estStagiaire && ['CONGE_ANNUEL', 'MATERNITE', 'PATERNITE'].includes(valeur)) return false
    if (['M', 'MASCULIN'].includes(sexeCode ?? '') && valeur === 'MATERNITE') return false
    if (['F', 'FEMININ', 'FÉMININ'].includes(sexeCode ?? '') && valeur === 'PATERNITE') return false
    return true
  })
}

const EXTENSIONS_AUTORISEES = ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff']
const TAILLE_MAXIMALE = 15 * 1024 * 1024
const JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL = 15
const JOURS_MAX_TRANCHE_CONGE_ANNUEL = 15

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

const champ =
  'h-11 w-full rounded-xl border border-[#E5E5EA] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#86868B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:bg-[#FAFAF8] disabled:text-[#86868B]'

const zoneTexte =
  'min-h-[100px] w-full resize-y rounded-xl border border-[#E5E5EA] bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#86868B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15'

const etiquette = 'mb-1.5 block text-sm font-medium text-[#0A0A0A]'

const TONS = {
  bleu: { chip: 'bg-[#1B1BFF]/10 text-[#1B1BFF]', barre: '#1B1BFF' },
  vert: { chip: 'bg-[#00FF9C]/10 text-[#0A0A0A]', barre: '#00FF9C' },
  ardoise: { chip: 'bg-slate-500/10 text-[#86868B]', barre: '#86868B' },
} as const

interface PointSignature {
  x: number
  y: number
  temps: number
}

interface PointVisuelSignature {
  x: number
  y: number
}

interface FormulaireDemande {
  type_absence: TypeAbsence
  annee_titre: string
  date_evenement_prevue: string
  motif: string
  date_debut: string
  date_fin: string
  lieu_jouissance: string
}

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function joursCalendaires(debut: string, fin: string): number | null {
  if (!debut || !fin) return null
  const dateDebut = new Date(`${debut}T00:00:00Z`).getTime()
  const dateFin = new Date(`${fin}T00:00:00Z`).getTime()
  if (Number.isNaN(dateDebut) || Number.isNaN(dateFin) || dateFin < dateDebut) return null
  return Math.floor((dateFin - dateDebut) / 86400000) + 1
}

function dateLocaleISO(date: Date): string {
  const annee = date.getFullYear()
  const mois = String(date.getMonth() + 1).padStart(2, '0')
  const jour = String(date.getDate()).padStart(2, '0')
  return `${annee}-${mois}-${jour}`
}

function ajouterJoursISO(dateISO: string, nombreJours: number): string {
  const [annee, mois, jour] = dateISO.split('-').map(Number)
  return new Date(Date.UTC(annee, mois - 1, jour + nombreJours)).toISOString().slice(0, 10)
}

function ajouterMoisCalendairesISO(dateISO: string, nombreMois: number): string {
  const [annee, mois, jour] = dateISO.split('-').map(Number)
  const premierJourCible = new Date(Date.UTC(annee, mois - 1 + nombreMois, 1))
  const anneeCible = premierJourCible.getUTCFullYear()
  const moisCible = premierJourCible.getUTCMonth()
  const dernierJourCible = new Date(Date.UTC(anneeCible, moisCible + 1, 0)).getUTCDate()
  return new Date(Date.UTC(anneeCible, moisCible, Math.min(jour, dernierJourCible)))
    .toISOString()
    .slice(0, 10)
}

function joursEntreISO(dateDepart: string, dateArrivee: string): number | null {
  if (!dateDepart || !dateArrivee) return null
  const convertir = (valeur: string) => {
    const [annee, mois, jour] = valeur.split('-').map(Number)
    return Date.UTC(annee, mois - 1, jour) / 86400000
  }
  const depart = convertir(dateDepart)
  const arrivee = convertir(dateArrivee)
  if (!Number.isFinite(depart) || !Number.isFinite(arrivee)) return null
  return arrivee - depart
}

function afficherDateISO(dateISO: string): string {
  const [annee, mois, jour] = dateISO.split('-')
  return `${jour}/${mois}/${annee}`
}

function messageErreur(erreur: unknown): string {
  return messageErreurUtilisateur(erreur, 'La demande n’a pas pu être enregistrée. Vérifiez les informations saisies puis réessayez.')
}

function libelleTypeAbsence(type: TypeAbsence): string {
  return TYPES_ABSENCE.find((item) => item.valeur === type)?.libelle ?? type.replace(/_/g, " ")
}

function motifAutomatiquePourType(type: TypeAbsence): boolean {
  return !typePossedeFicheOfficielle(type)
}

function initialiserFormulaire(): FormulaireDemande {
  return {
    type_absence: 'CONGE_ANNUEL',
    annee_titre: String(new Date().getFullYear()),
    date_evenement_prevue: '',
    motif: '',
    date_debut: '',
    date_fin: '',
    lieu_jouissance: '',
  }
}

/* ------------------------------------------------------------------ */
/*  Composants locaux                                                  */
/* ------------------------------------------------------------------ */

function CoquilleDemandeRole({
  dansEspaceService, dansEspaceRH, vueAgent, onVueAgent, titre, description, actions, children,
}: {
  dansEspaceService: boolean; dansEspaceRH: boolean; vueAgent: VueAgent; onVueAgent: (vue: VueAgent) => void; titre: string; description: string; actions: ReactNode; children: ReactNode
}) {
  const naviguer = useNavigate()

  if (dansEspaceRH) {
    return (
      <CoquilleRH
        vue="demande-agent"
        onVue={(vue) => naviguer(vue === 'demande-agent' ? '/app/rh/nouvelle-demande' : '/app/rh')}
        titre={titre}
        description={description}
        actions={actions}
      >
        {children}
      </CoquilleRH>
    )
  }
  if (dansEspaceService) {
    return (
      <CoquilleService vue="nouvelle-demande" onVue={() => undefined} titre={titre} description={description} actions={actions}>
        {children}
      </CoquilleService>
    )
  }
  return (
    <CoquilleAgent vue={vueAgent} onVue={onVueAgent} titre={titre} description={description} actions={actions}>
      {children}
    </CoquilleAgent>
  )
}

function GroupeFormulaire({ icone, titre, ton = 'bleu', retard, children }: {
  icone: IconName
  titre: string
  ton?: keyof typeof TONS
  retard: number
  children: ReactNode
}) {
  return (
    <fieldset className={`rh-in min-w-0 overflow-hidden ${carte}`} style={delai(retard)}>
      <header className="flex items-center gap-3 border-b border-[#E5E5EA] bg-[#F0F0FF] px-5 py-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONS[ton].chip}`}>
          <Icon name={icone} className="h-4 w-4" />
        </span>
        <span className="text-sm font-bold text-[#0A0A0A]">{titre}</span>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </fieldset>
  )
}

function TuileKpi({ libelle, valeur, note, icone, accent, retard }: {
  libelle: string
  valeur: string
  note: string
  icone: IconName
  accent: string
  retard: number
}) {
  return (
    <div className={`rh-in flex flex-col p-5 sm:p-6 ${carte}`} style={delai(retard)}>
      <header className="mb-3 flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${accent}1A`, color: accent }}>
          <Icon name={icone} className="h-5 w-5" />
        </span>
        <h2 className="text-sm font-bold text-[#0A0A0A]">{libelle}</h2>
      </header>
      <p className="men-serif text-4xl leading-none tabular-nums text-[#0A0A0A]">{valeur}</p>
      <p className="mt-2 text-xs text-[#86868B]">{note}</p>
    </div>
  )
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

export function NouvelleDemandePage() {
  const { utilisateur, chargement } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const { pathname } = useLocation()
  const personnelCibleId = Number(searchParams.get('personnel') || 0)
  const dansEspaceService = pathname.startsWith('/app/chef-service')
  const estEspaceRHDelegue = pathname === '/app/rh/nouvelle-demande' && utilisateur?.role === 'ROLE_RH'
  const dansContexteSaisieDeleguee = dansEspaceService || estEspaceRHDelegue
  const estResponsableService = utilisateur?.role === 'ROLE_CHEF_SERVICE' || utilisateur?.role === 'ROLE_RH'
  const serviceId = utilisateur?.personnel?.service ?? null
  const demandePourUnAgent = dansContexteSaisieDeleguee && estResponsableService && personnelCibleId > 0
  const [vue, setVue] = useState<VueAgent>('nouvelle-demande')

  const [formulaire, setFormulaire] = useState<FormulaireDemande>(initialiserFormulaire)
  const [fichier, setFichier] = useState<File | null>(null)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [regleTrancheAnnuelle, setRegleTrancheAnnuelle] = useState<RegleTrancheAnnuelle | null>(null)
  const [chargementRegleTranche, setChargementRegleTranche] = useState(false)
  const [erreurRegleTranche, setErreurRegleTranche] = useState('')
  const [revisionRegleTranche, setRevisionRegleTranche] = useState(0)
  const [personnelCible, setPersonnelCible] = useState<PersonnelEquipe | null>(null)
  const [chargementPersonnelCible, setChargementPersonnelCible] = useState(false)
  const [personnelsDisponibles, setPersonnelsDisponibles] = useState<PersonnelEquipe[]>([])
  const [chargementListePersonnels, setChargementListePersonnels] = useState(false)
  const [erreurListePersonnels, setErreurListePersonnels] = useState('')
  const [rechercheAgent, setRechercheAgent] = useState('')
  const [signatureTracee, setSignatureTracee] = useState(false)
  const [confirmationSignatureDeleguee, setConfirmationSignatureDeleguee] = useState(false)
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const signatureTraitEnCours = useRef(false)
  const signatureDernierPoint = useRef<PointSignature | null>(null)
  const signatureDernierMilieu = useRef<PointVisuelSignature | null>(null)
  const signatureVitesse = useRef(0)
  const signatureHistorique = useRef<ImageData[]>([])
  const signatureNombreTraits = useRef(0)

  const referenceFichier = useRef<HTMLInputElement>(null)
  const personnelConcerne = demandePourUnAgent ? personnelCible : utilisateur?.personnel
  const personnelRegleId = demandePourUnAgent
    ? personnelCible?.id_personnel ?? null
    : utilisateur?.personnel?.id_personnel ?? null
  const typesAbsenceDisponibles = typesAbsenceSelonProfil(personnelConcerne?.statut, personnelConcerne?.sexe)

  useEffect(() => {
    if (!dansContexteSaisieDeleguee || !estResponsableService) {
      setPersonnelsDisponibles([])
      setChargementListePersonnels(false)
      setErreurListePersonnels('')
      return
    }

    if (!estEspaceRHDelegue && serviceId === null) {
      setPersonnelsDisponibles([])
      setChargementListePersonnels(false)
      setErreurListePersonnels('Votre compte n’est associé à aucun service.')
      return
    }

    let actif = true
    setChargementListePersonnels(true)
    setErreurListePersonnels('')

    const chargerListe = estEspaceRHDelegue
      ? listerPersonnelsRH().then((resultat) => resultat.elements.map((personnel) => ({
          id_personnel: personnel.id_personnel,
          im: personnel.im,
          nom: personnel.nom,
          prenoms: personnel.prenoms,
          nom_complet: personnel.nom_complet || [personnel.prenoms, personnel.nom].filter(Boolean).join(' '),
          corps: personnel.corps || '',
          grade: personnel.grade || '',
          sexe: (personnel as typeof personnel & { sexe?: string }).sexe,
          statut: personnel.statut,
          service: personnel.service ?? null,
          service_libelle: personnel.service_libelle ?? null,
        })))
      : listerPersonnelsDuService(serviceId as number)

    void chargerListe
      .then((personnels) => {
        if (actif) setPersonnelsDisponibles(personnels)
      })
      .catch((cause) => {
        if (actif) {
          setPersonnelsDisponibles([])
          setErreurListePersonnels(messageErreur(cause))
        }
      })
      .finally(() => { if (actif) setChargementListePersonnels(false) })

    return () => { actif = false }
  }, [dansContexteSaisieDeleguee, estResponsableService, estEspaceRHDelegue, serviceId])

  useEffect(() => {
    if (!dansContexteSaisieDeleguee || !estResponsableService || personnelCibleId <= 0) {
      setPersonnelCible(null)
      setChargementPersonnelCible(false)
      return
    }

    if (chargementListePersonnels) {
      setChargementPersonnelCible(true)
      return
    }

    setChargementPersonnelCible(false)
    if (erreurListePersonnels) {
      setPersonnelCible(null)
      setErreur(erreurListePersonnels)
      return
    }

    const cible = personnelsDisponibles.find((personnel) =>
      personnel.id_personnel === personnelCibleId
      && personnel.id_personnel !== utilisateur?.personnel?.id_personnel,
    )
    if (!cible) {
      setPersonnelCible(null)
      setErreur(estEspaceRHDelegue
        ? 'Cet agent est introuvable ou n’est pas disponible dans la liste RH.'
        : 'Ce personnel n’appartient pas à votre service ou n’est pas disponible.')
      return
    }

    setErreur('')
    setPersonnelCible(cible)
  }, [
    dansContexteSaisieDeleguee,
    estResponsableService,
    estEspaceRHDelegue,
    personnelCibleId,
    personnelsDisponibles,
    chargementListePersonnels,
    erreurListePersonnels,
    utilisateur?.personnel?.id_personnel,
  ])

  useEffect(() => {
    const typesAutorises = typesAbsenceSelonProfil(personnelConcerne?.statut, personnelConcerne?.sexe)
    setFormulaire((precedent) => {
      if (typesAutorises.some((type) => type.valeur === precedent.type_absence)) return precedent
      const nouveauType = typesAutorises[0]?.valeur ?? 'PERMISSION'
      return {
        ...precedent,
        type_absence: nouveauType,
        motif: motifAutomatiquePourType(nouveauType) ? libelleTypeAbsence(nouveauType) : '',
        date_debut: '',
        date_fin: '',
        date_evenement_prevue: '',
      }
    })
  }, [personnelConcerne?.id_personnel, personnelConcerne?.statut, personnelConcerne?.sexe])

  useEffect(() => {
    if (dansContexteSaisieDeleguee && !demandePourUnAgent) {
      setRegleTrancheAnnuelle(null)
      setChargementRegleTranche(false)
      setErreurRegleTranche('')
      return
    }

    if (formulaire.type_absence !== 'CONGE_ANNUEL') {
      setRegleTrancheAnnuelle(null)
      setChargementRegleTranche(false)
      setErreurRegleTranche('')
      return
    }

    const anneeTitre = Number(formulaire.annee_titre)
    if (!formulaire.annee_titre.trim() || !Number.isInteger(anneeTitre) || anneeTitre < 1900 || anneeTitre > 9999) {
      setRegleTrancheAnnuelle(null)
      setChargementRegleTranche(false)
      setErreurRegleTranche('')
      return
    }
    if (demandePourUnAgent && personnelRegleId === null) {
      setRegleTrancheAnnuelle(null)
      setChargementRegleTranche(false)
      setErreurRegleTranche('')
      return
    }

    let actif = true
    setRegleTrancheAnnuelle(null)
    setChargementRegleTranche(true)
    setErreurRegleTranche('')
    void recupererRegleTrancheAnnuelle(
      anneeTitre,
      demandePourUnAgent ? (personnelRegleId ?? undefined) : undefined,
    )
      .then((regle) => {
        if (!actif) return
        setRegleTrancheAnnuelle(regle)
        // Si l'agent a déjà choisi sa date de début pendant le chargement,
        // aligne immédiatement la première tranche sur 15 jours calendaires.
        if (regle.premiere_tranche) {
          setFormulaire((precedent) => {
            if (precedent.type_absence !== 'CONGE_ANNUEL' || !precedent.date_debut) return precedent
            const finObligatoire = ajouterJoursISO(precedent.date_debut, 14)
            return precedent.date_fin === finObligatoire
              ? precedent
              : { ...precedent, date_fin: finObligatoire }
          })
        }
      })
      .catch(() => {
        if (actif) setErreurRegleTranche('Impossible de vérifier les tranches de congé annuel. Réessayez avant de soumettre.')
      })
      .finally(() => {
        if (actif) setChargementRegleTranche(false)
      })

    return () => { actif = false }
  }, [
    formulaire.type_absence,
    formulaire.annee_titre,
    demandePourUnAgent,
    dansContexteSaisieDeleguee,
    personnelRegleId,
    revisionRegleTranche,
  ])

  useEffect(() => {
    if (!motifAutomatiquePourType(formulaire.type_absence)) return
    const motifAutomatique = libelleTypeAbsence(formulaire.type_absence)
    setFormulaire((precedent) => precedent.motif === motifAutomatique
      ? precedent
      : { ...precedent, motif: motifAutomatique })
  }, [formulaire.type_absence])

  if (chargement) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8]">
        <span role="status" aria-label="Chargement" className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1B1BFF]/15 border-t-[#1B1BFF]" />
      </div>
    )
  }

  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (!peutAccederEspaceAgent(utilisateur.role)) return <Navigate to="/app" replace />
  if (pathname.startsWith('/app/rh/nouvelle-demande') && utilisateur.role !== 'ROLE_RH') return <Navigate to="/app" replace />
  if (dansEspaceService && !['ROLE_CHEF_SERVICE', 'ROLE_RH'].includes(utilisateur.role)) return <Navigate to="/app" replace />

  const personnelsAffectables = personnelsDisponibles.filter(
    (personnel) => personnel.id_personnel !== utilisateur?.personnel?.id_personnel,
  )
  const personnelsFiltres = personnelsAffectables.filter((personnel) => {
    const recherche = rechercheAgent.trim().toLocaleLowerCase('fr-FR')
    if (!recherche) return true
    const texte = [personnel.nom_complet, personnel.im, personnel.service_libelle, personnel.corps, personnel.grade]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('fr-FR')
    return texte.includes(recherche)
  })
  const personnelsOptions = personnelCibleId > 0 && !personnelsFiltres.some((personnel) => personnel.id_personnel === personnelCibleId)
    ? [...personnelsAffectables.filter((personnel) => personnel.id_personnel === personnelCibleId), ...personnelsFiltres]
    : personnelsFiltres
  const congeFamilial = formulaire.type_absence === 'MATERNITE' || formulaire.type_absence === 'PATERNITE'
  const ficheOfficielleNecessaire = typePossedeFicheOfficielle(formulaire.type_absence)
  const dureeFamiliale = formulaire.type_absence === 'MATERNITE' ? 90 : formulaire.type_absence === 'PATERNITE' ? 15 : null
  const dateDebutCalculee = congeFamilial ? formulaire.date_evenement_prevue : formulaire.date_debut
  const dateFinCalculee = congeFamilial
    ? formulaire.date_evenement_prevue && dureeFamiliale
      ? ajouterJoursISO(formulaire.date_evenement_prevue, dureeFamiliale - 1)
      : ''
    : formulaire.date_fin
  const nombreJours = joursCalendaires(dateDebutCalculee, dateFinCalculee)
  const dateDuJour = dateLocaleISO(new Date())
  const debutCongeAnnuelMin = ajouterJoursISO(dateDuJour, 14)
  const debutCongeAnnuelMax = ajouterJoursISO(dateDuJour, 30)
  const debutMissionMin = ajouterJoursISO(dateDuJour, 7)
  const dateEvenementMin = formulaire.type_absence === 'MATERNITE'
    ? ajouterMoisCalendairesISO(dateDuJour, 1)
    : ajouterJoursISO(dateDuJour, 14)
  const dateEvenementMax = formulaire.type_absence === 'MATERNITE'
    ? ajouterMoisCalendairesISO(dateDuJour, 3)
    : ajouterJoursISO(dateDuJour, 30)

  function modifierChamp<K extends keyof FormulaireDemande>(cle: K, valeur: FormulaireDemande[K]) {
    if (cle === 'type_absence') {
      const type = valeur as TypeAbsence
      setFormulaire((precedent) => ({
        ...precedent,
        type_absence: type,
        motif: motifAutomatiquePourType(type) ? libelleTypeAbsence(type) : '',
      }))
      setErreur('')
      setSucces('')
      if (type !== 'CONGE_ANNUEL') {
        setRegleTrancheAnnuelle(null)
        setErreurRegleTranche('')
      }
      return
    }

    if (
      cle === 'date_debut'
      && formulaire.type_absence === 'CONGE_ANNUEL'
      && regleTrancheAnnuelle?.premiere_tranche
      && typeof valeur === 'string'
      && valeur
    ) {
      setFormulaire((precedent) => ({
        ...precedent,
        date_debut: valeur,
        date_fin: ajouterJoursISO(valeur, JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL - 1),
      }))
      setErreur('')
      setSucces('')
      return
    }

    let valeurSecurisee = valeur
    if (typeof valeur === 'string') {
      if (cle === 'annee_titre') valeurSecurisee = normaliserEntier(valeur, 4) as unknown as FormulaireDemande[K]
      else if (cle === 'motif' && !motifAutomatiquePourType(formulaire.type_absence)) valeurSecurisee = normaliserTexteLibre(valeur, true) as unknown as FormulaireDemande[K]
      else if (cle === 'lieu_jouissance') valeurSecurisee = normaliserTexteLibre(valeur).trimStart() as unknown as FormulaireDemande[K]
    }
    setFormulaire((precedent) => ({ ...precedent, [cle]: valeurSecurisee }))
    setErreur('')
    setSucces('')
  }

  function selectionnerFichier(evenement: ChangeEvent<HTMLInputElement>) {
    const selection = evenement.target.files?.[0] ?? null
    setErreur('')
    setSucces('')
    if (!selection) { setFichier(null); return }

    const extension = selection.name.toLowerCase().slice(selection.name.lastIndexOf('.'))
    if (!EXTENSIONS_AUTORISEES.includes(extension)) {
      setFichier(null); evenement.target.value = ''
      setErreur('Formats autorisés : PDF, JPG, JPEG, PNG, TIF et TIFF.')
      return
    }
    if (selection.size > TAILLE_MAXIMALE) {
      setFichier(null); evenement.target.value = ''
      setErreur('Le justificatif ne doit pas dépasser 15 Mo.')
      return
    }
    setFichier(selection)
  }

  function pointDepuisEvenement(event: ReactPointerEvent<HTMLCanvasElement>): PointSignature {
    const canvas = event.currentTarget
    const cadre = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - cadre.left) / Math.max(cadre.width, 1)) * canvas.width,
      y: ((event.clientY - cadre.top) / Math.max(cadre.height, 1)) * canvas.height,
      temps: performance.now(),
    }
  }

  function commencerSignature(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const contexte = canvas.getContext('2d')
    if (!contexte || signatureTraitEnCours.current) return

    try {
      signatureHistorique.current.push(contexte.getImageData(0, 0, canvas.width, canvas.height))
    } catch {
      setErreur('Impossible de préparer la signature. Rechargez le formulaire puis réessayez.')
      return
    }

    // Une nouvelle signature invalide l'historique de rétablissement.
    contexte.strokeStyle = '#111827'
    contexte.fillStyle = '#111827'
    contexte.lineCap = 'round'
    contexte.lineJoin = 'round'
    contexte.lineWidth = 2.6

    const point = pointDepuisEvenement(event)
    signatureDernierPoint.current = point
    signatureDernierMilieu.current = { x: point.x, y: point.y }
    signatureVitesse.current = 0
    signatureTraitEnCours.current = true

    // Un toucher immobile produit un point lisible plutôt qu'une signature vide.
    contexte.beginPath()
    contexte.arc(point.x, point.y, 1.6, 0, Math.PI * 2)
    contexte.fill()

    try { canvas.setPointerCapture(event.pointerId) } catch { /* Capture facultative selon le navigateur. */ }
    setSignatureTracee(true)
    setConfirmationSignatureDeleguee(false)
    setErreur('')
    setSucces('')
    event.preventDefault()
  }

  function continuerSignature(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!signatureTraitEnCours.current) return
    const canvas = event.currentTarget
    const contexte = canvas.getContext('2d')
    const precedent = signatureDernierPoint.current
    const milieuPrecedent = signatureDernierMilieu.current
    if (!contexte || !precedent || !milieuPrecedent) return

    const point = pointDepuisEvenement(event)
    const dx = point.x - precedent.x
    const dy = point.y - precedent.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance < 0.4) return

    // Interpolation quadratique + largeur variable selon la vitesse : le trait reste fluide
    // même lorsque la souris ou le doigt envoie peu de points.
    const duree = Math.max(point.temps - precedent.temps, 1)
    const vitesseInstantanee = distance / duree
    signatureVitesse.current = signatureVitesse.current * 0.65 + vitesseInstantanee * 0.35
    const largeur = Math.max(1.25, Math.min(3.4, 3.5 - signatureVitesse.current * 2.2))
    const milieu = { x: (precedent.x + point.x) / 2, y: (precedent.y + point.y) / 2 }

    contexte.beginPath()
    contexte.moveTo(milieuPrecedent.x, milieuPrecedent.y)
    contexte.quadraticCurveTo(precedent.x, precedent.y, milieu.x, milieu.y)
    contexte.strokeStyle = '#111827'
    contexte.lineWidth = largeur
    contexte.lineCap = 'round'
    contexte.lineJoin = 'round'
    contexte.stroke()

    signatureDernierPoint.current = point
    signatureDernierMilieu.current = milieu
    event.preventDefault()
  }

  function terminerSignature(event?: ReactPointerEvent<HTMLCanvasElement>) {
    if (signatureTraitEnCours.current) {
      const canvas = event?.currentTarget ?? signatureCanvasRef.current
      const contexte = canvas?.getContext('2d')
      const dernierPoint = signatureDernierPoint.current
      const dernierMilieu = signatureDernierMilieu.current
      if (contexte && dernierPoint && dernierMilieu) {
        contexte.beginPath()
        contexte.moveTo(dernierMilieu.x, dernierMilieu.y)
        contexte.lineTo(dernierPoint.x, dernierPoint.y)
        contexte.lineWidth = Math.max(1.25, Math.min(3.4, 3.5 - signatureVitesse.current * 2.2))
        contexte.lineCap = 'round'
        contexte.strokeStyle = '#111827'
        contexte.stroke()
      }
      signatureNombreTraits.current += 1
    }
    signatureTraitEnCours.current = false
    signatureDernierPoint.current = null
    signatureDernierMilieu.current = null
    signatureVitesse.current = 0
    if (event) {
      try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Capture déjà libérée. */ }
    }
  }

  function annulerDernierTraitSignature() {
    if (signatureTraitEnCours.current) terminerSignature()
    const canvas = signatureCanvasRef.current
    const contexte = canvas?.getContext('2d')
    const imagePrecedente = signatureHistorique.current.pop()
    if (!canvas || !contexte || !imagePrecedente) return

    contexte.putImageData(imagePrecedente, 0, 0)
    signatureNombreTraits.current = Math.max(0, signatureNombreTraits.current - 1)
    setSignatureTracee(signatureNombreTraits.current > 0)
    setConfirmationSignatureDeleguee(false)
    setErreur('')
    setSucces('')
  }

  function effacerSignature() {
    const canvas = signatureCanvasRef.current
    const contexte = canvas?.getContext('2d')
    if (canvas && contexte) contexte.clearRect(0, 0, canvas.width, canvas.height)
    signatureHistorique.current = []
    signatureNombreTraits.current = 0
    signatureDernierPoint.current = null
    signatureDernierMilieu.current = null
    signatureVitesse.current = 0
    signatureTraitEnCours.current = false
    setSignatureTracee(false)
    setConfirmationSignatureDeleguee(false)
    setErreur('')
    setSucces('')
  }

  async function soumettre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErreur('')
    setSucces('')

    if (demandePourUnAgent && (chargementPersonnelCible || !personnelCible)) {
      setErreur('Vérifiez le personnel concerné avant d’enregistrer la demande.')
      return
    }
    if (!congeFamilial && (!formulaire.date_debut || !formulaire.date_fin || nombreJoursInvalide())) {
      setErreur('Vérifiez les dates de début et de fin.')
      return
    }
    if (formulaire.type_absence === 'CONGE_ANNUEL') {
      if (chargementRegleTranche || !regleTrancheAnnuelle || erreurRegleTranche) {
        setErreur(erreurRegleTranche || 'La règle de tranche du congé annuel est en cours de vérification. Réessayez dans un instant.')
        return
      }
      if (regleTrancheAnnuelle.annee_titre !== Number(formulaire.annee_titre)) {
        setErreur('La règle de tranche ne correspond pas à l’année de titre choisie. Réessayez.')
        return
      }
      if (regleTrancheAnnuelle.historique_incoherent) {
        setErreur(regleTrancheAnnuelle.message_historique || 'Une ancienne tranche ne respecte pas la règle. La RH doit régulariser le dossier avant une nouvelle demande pour cette année.')
        return
      }
      if (regleTrancheAnnuelle.premiere_tranche && nombreJours !== JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL) {
        setErreur(`La première tranche du congé annuel doit être exactement de ${JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL} jours calendaires. La date de fin doit être ${JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL - 1} jours après la date de début.`)
        return
      }
      if (!regleTrancheAnnuelle.premiere_tranche && (nombreJours === null || nombreJours < 1 || nombreJours > JOURS_MAX_TRANCHE_CONGE_ANNUEL)) {
        setErreur(`Chaque tranche suivante doit durer de 1 à ${JOURS_MAX_TRANCHE_CONGE_ANNUEL} jours calendaires et respecter le solde disponible.`)
        return
      }
    }
    const delaiAvantDebut = joursEntreISO(dateDuJour, formulaire.date_debut)
    if (formulaire.type_absence === 'CONGE_ANNUEL' && (delaiAvantDebut === null || delaiAvantDebut < 14 || delaiAvantDebut > 30)) {
      setErreur(`Le congé annuel doit être déposé entre 14 et 30 jours avant sa date de début. Choisissez une date entre le ${afficherDateISO(debutCongeAnnuelMin)} et le ${afficherDateISO(debutCongeAnnuelMax)}.`)
      return
    }
    if (formulaire.type_absence === 'MISSION' && (delaiAvantDebut === null || delaiAvantDebut < 7)) {
      setErreur(`Une mission doit être annoncée au moins 7 jours avant son début. Choisissez une date à partir du ${afficherDateISO(debutMissionMin)}.`)
      return
    }
    const motifAutomatique = motifAutomatiquePourType(formulaire.type_absence)
    const motifDemande = motifAutomatique ? libelleTypeAbsence(formulaire.type_absence) : formulaire.motif.trim()
    if (!motifDemande) {
      setErreur('Renseignez le motif de votre demande.')
      return
    }
    if (!formulaire.lieu_jouissance.trim()) {
      setErreur('Le lieu de jouissance est obligatoire pour enregistrer la demande ou l’annonce.')
      return
    }
    if (!motifAutomatique && !texteContientLettres(formulaire.motif)) {
      setErreur('Décrivez le motif avec des mots ; une saisie composée uniquement de chiffres ou de symboles n’est pas acceptée.')
      return
    }
    if (!texteContientLettres(formulaire.lieu_jouissance)) {
      setErreur('Indiquez un lieu valide contenant au moins une lettre.')
      return
    }
    if (formulaire.type_absence === 'CONGE_ANNUEL') {
      const anneeTitre = Number(formulaire.annee_titre)
      if (!formulaire.annee_titre.trim() || !Number.isInteger(anneeTitre) || anneeTitre < 1900 || anneeTitre > 9999) {
        setErreur('Indiquez une année valide au titre de laquelle le congé annuel est demandé.')
        return
      }
    }

    if (congeFamilial && !formulaire.date_evenement_prevue) {
      setErreur('La date prévue d’accouchement est obligatoire pour une demande de maternité ou de paternité.')
      return
    }
    if (congeFamilial) {
      const delaiAvantEvenement = joursEntreISO(dateDuJour, formulaire.date_evenement_prevue)
      const evenementValide = formulaire.type_absence === 'MATERNITE'
        ? formulaire.date_evenement_prevue >= dateEvenementMin && formulaire.date_evenement_prevue <= dateEvenementMax
        : delaiAvantEvenement !== null && delaiAvantEvenement >= 14 && delaiAvantEvenement <= 30
      if (!evenementValide) {
        const intervalle = formulaire.type_absence === 'MATERNITE'
          ? `entre le ${afficherDateISO(dateEvenementMin)} et le ${afficherDateISO(dateEvenementMax)}`
          : `entre le ${afficherDateISO(dateEvenementMin)} et le ${afficherDateISO(dateEvenementMax)}`
        setErreur(`La date prévue d’accouchement doit être ${intervalle}.`)
        return
      }
    }

    // Une signature dessinée est requise avant chaque nouvelle soumission.
    if (!signatureTracee || !signatureCanvasRef.current) {
      setErreur('Veuillez signer dans la zone prévue avant de soumettre la demande.')
      return
    }
    if (demandePourUnAgent && !confirmationSignatureDeleguee) {
      setErreur('Confirmez que la signature présente est bien celle du demandeur concerné.')
      return
    }
    const signatureImage = signatureCanvasRef.current.toDataURL('image/png')
    if (!signatureImage.startsWith('data:image/png;base64,') || signatureImage.length < 150) {
      setErreur('La signature semble vide. Signez dans la zone puis réessayez.')
      return
    }

    // La période familiale est calculée automatiquement à partir de la date prévue.

    setEnvoiEnCours(true)
    try {
      const resultat = await creerDemandeConge({
        type_absence: formulaire.type_absence,
        ...(formulaire.type_absence === 'CONGE_ANNUEL'
          ? { annee_titre: Number(formulaire.annee_titre) }
          : {}),
        ...(congeFamilial
          ? { date_evenement_prevue: formulaire.date_evenement_prevue }
          : {}),
        ...(demandePourUnAgent && personnelCible ? { personnel: personnelCible.id_personnel } : {}),
        motif: motifDemande,
        ...(!congeFamilial ? {
          date_debut: formulaire.date_debut,
          date_fin: formulaire.date_fin,
        } : {}),
        lieu_jouissance: formulaire.lieu_jouissance.trim(),
        signature_agent: signatureImage,
        fichier_justificatif: fichier,
      })

      const reference = resultat.numero_enregistrement || `Demande #${resultat.id_demande}`
      const sujetDemande = demandePourUnAgent && personnelCible ? `La demande pour ${personnelCible.nom_complet}` : 'Votre demande'
      setSucces(`${sujetDemande} a bien été signée et envoyée. Référence : ${reference}. État : ${resultat.statut_libelle || 'En attente'}.`)

      setFormulaire(initialiserFormulaire())
      setRevisionRegleTranche((precedente) => precedente + 1)
      setFichier(null)
      const canvasSignature = signatureCanvasRef.current
      const contexteSignature = canvasSignature?.getContext('2d')
      if (canvasSignature && contexteSignature) {
        contexteSignature.clearRect(0, 0, canvasSignature.width, canvasSignature.height)
      }
      signatureHistorique.current = []
      signatureNombreTraits.current = 0
      signatureDernierPoint.current = null
      signatureDernierMilieu.current = null
      signatureVitesse.current = 0
      signatureTraitEnCours.current = false
      setSignatureTracee(false)
      setConfirmationSignatureDeleguee(false)
      if (referenceFichier.current) referenceFichier.current.value = ''
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setEnvoiEnCours(false)
    }
  }

  function nombreJoursInvalide(): boolean {
    if (!formulaire.date_debut || !formulaire.date_fin) return true
    const debut = new Date(`${formulaire.date_debut}T00:00:00Z`)
    const fin = new Date(`${formulaire.date_fin}T00:00:00Z`)
    return Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin < debut
  }

  const cheminRetour = estEspaceRHDelegue
    ? '/app/rh'
    : dansEspaceService
      ? '/app/chef-service'
      : '/app/agent/mes-demandes'
  const cheminSucces = estEspaceRHDelegue
    ? '/app/rh'
    : dansEspaceService
      ? '/app/chef-service/planning'
      : '/app/agent/mes-demandes'
  const libelleRetour = estEspaceRHDelegue
    ? 'Retour à la RH'
    : dansEspaceService
      ? 'Retour au service'
      : 'Mes demandes'

  return (
    <CoquilleDemandeRole
      dansEspaceService={dansEspaceService}
      dansEspaceRH={estEspaceRHDelegue}
      vueAgent={vue}
      onVueAgent={setVue}
      titre={
        demandePourUnAgent && personnelCible
          ? `Demande pour ${personnelCible.nom_complet}`
          : dansContexteSaisieDeleguee
            ? 'Demande pour un agent'
            : 'Nouvelle demande'
      }
      description={
        dansContexteSaisieDeleguee
          ? demandePourUnAgent
            ? estEspaceRHDelegue
              ? 'Préparer une demande pour un agent du ministère'
              : 'Saisie d’une demande pour un membre de votre service'
            : estEspaceRHDelegue
              ? 'Sélectionnez un agent du ministère avant de remplir sa demande.'
              : 'Sélectionnez un membre de votre service avant de remplir sa demande.'
          : ficheOfficielleNecessaire
            ? estResponsableService
              ? 'Déposez votre demande officielle ; elle sera transmise directement au Directeur.'
              : 'Complétez la fiche officielle pour le congé annuel, la permission ou l’autorisation d’absence.'
            : 'Déclarez votre absence ou votre événement ; aucune fiche officielle n’est requise pour ce type.'
      }
      actions={
        <Link to={cheminRetour} className={`${btnContour} !h-9`}>
          <Icon name="left" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{libelleRetour}</span>
        </Link>
      }
    >
      <style>{STYLES}</style>

      <div className="mx-auto max-w-4xl space-y-5">
        {erreur && <Message key={erreur} type="erreur" onClose={() => setErreur('')}><span className="text-xs">{erreur}</span></Message>}
        {succes && (
          <Message key={succes} type="succes" onClose={() => setSucces('')}>
            <span className="text-xs">{succes}</span>
            <Link to={cheminSucces} className="mt-2 flex items-center gap-1 text-xs font-semibold underline">
              <Icon name="right" className="h-3 w-3" />
              {estEspaceRHDelegue ? 'Retour à la RH' : dansEspaceService ? 'Consulter le planning' : 'Mes demandes'}
            </Link>
          </Message>
        )}

        {dansContexteSaisieDeleguee && (
          <section className={`rh-in overflow-hidden ${carte}`} style={delai(160)}>
            <header className="flex items-center gap-3 border-b border-[#E5E5EA] bg-[#F0F0FF] px-5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#1B1BFF]/10 text-[#1B1BFF]">
                <Icon name="users" className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#0A0A0A]">{estEspaceRHDelegue ? 'Agent concerné' : 'Personnel concerné'}</p>
                <p className="mt-0.5 text-xs text-[#5D5D66]">
                  {estEspaceRHDelegue
                    ? 'Recherchez un agent du ministère ; le formulaire et les règles sont identiques à ceux du chef de service.'
                    : 'Choisissez un membre de votre service pour préparer sa demande avec les mêmes règles de saisie.'}
                </p>
              </div>
            </header>
            <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)] sm:p-5">
              <div>
                <label htmlFor="recherche-agent-delegue" className={etiquette}>Rechercher par nom, IM ou service</label>
                <input
                  id="recherche-agent-delegue"
                  type="search"
                  value={rechercheAgent}
                  onChange={(event) => setRechercheAgent(event.target.value)}
                  placeholder="Ex. : nom, IM, service…"
                  className={champ}
                />
              </div>
              <div>
                <label htmlFor="agent-cible-delegue" className={etiquette}>Sélectionner l’agent *</label>
                <select
                  id="agent-cible-delegue"
                  value={personnelCibleId > 0 ? String(personnelCibleId) : ''}
                  onChange={(event) => {
                    setErreur('')
                    setSucces('')
                    setFormulaire(initialiserFormulaire())
                    setFichier(null)
                    setRegleTrancheAnnuelle(null)
                    setErreurRegleTranche('')
                    setConfirmationSignatureDeleguee(false)
                    effacerSignature()
                    if (referenceFichier.current) referenceFichier.current.value = ''
                    setSearchParams(event.target.value ? { personnel: event.target.value } : {}, { replace: true })
                  }}
                  disabled={chargementListePersonnels || Boolean(erreurListePersonnels)}
                  className={champ}
                >
                  <option value="">{chargementListePersonnels ? 'Chargement des agents…' : 'Choisir un agent'}</option>
                  {personnelsOptions.map((personnel) => (
                    <option key={personnel.id_personnel} value={String(personnel.id_personnel)}>
                      {personnel.nom_complet || `${personnel.prenoms} ${personnel.nom}`} — IM {personnel.im}{personnel.service_libelle ? ` · ${personnel.service_libelle}` : ''}
                    </option>
                  ))}
                </select>
                {erreurListePersonnels && <p className="mt-2 text-xs font-medium text-rose-700" role="alert">Impossible de charger les agents : {erreurListePersonnels}</p>}
                {!chargementListePersonnels && !erreurListePersonnels && personnelsOptions.length === 0 && (
                  <p className="mt-2 text-xs text-[#5D5D66]">Aucun agent ne correspond à cette recherche.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {dansContexteSaisieDeleguee && demandePourUnAgent && chargementPersonnelCible && (
          <section className="rounded-2xl border border-[#E5E5EA] bg-white p-5 text-sm text-[#5D5D66]" role="status">
            Chargement du dossier de l’agent sélectionné…
          </section>
        )}


        {(!dansContexteSaisieDeleguee || (demandePourUnAgent && Boolean(personnelCible) && !chargementPersonnelCible)) && (
          <>
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
              {dansContexteSaisieDeleguee && (
                <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
                  <Icon name="file" className="h-3.5 w-3.5" />
                  {estEspaceRHDelegue ? 'Espace RH · Saisie déléguée' : utilisateur.role === 'ROLE_RH' ? 'Espace Service RH' : 'Espace Chef de service'}
                </p>
              )}
              <h2 className="men-serif mt-5 max-w-lg text-3xl font-normal leading-[1.1] sm:text-4xl">
                {demandePourUnAgent && personnelCible ? `Demande pour ${personnelCible.nom_complet}` : 'Nouvelle demande'}
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
                {demandePourUnAgent
                  ? estEspaceRHDelegue
                    ? 'Préparez la demande pour l’agent sélectionné ; les mêmes règles de saisie que pour le chef de service sont appliquées.'
                    : 'Préparez la demande d’absence pour le personnel sélectionné.'
                  : dansEspaceService
                    ? 'Votre demande personnelle sera transmise directement au Directeur.'
                    : estResponsableService
                      ? 'Votre demande personnelle sera transmise directement au Directeur.'
                      : 'Renseignez les informations utiles puis soumettez la demande.'}
              </p>
            </div>
          </section>

          <TuileKpi
            libelle="Durée estimée"
            valeur={nombreJours === null ? '—' : String(nombreJours)}
            note={nombreJours === null ? 'Complétez les dates' : `jour${nombreJours > 1 ? 's' : ''} calendaires`}
            icone="calendar"
            accent="#1B1BFF"
            retard={120}
          />
        </div>

        {demandePourUnAgent && (
          <section className={`rh-in overflow-hidden ${carte}`} style={delai(180)}>
            <header className="flex items-center gap-3 border-b border-[#E5E5EA] bg-[#F0F0FF] px-5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#1B1BFF]/10 text-[#1B1BFF]">
                <Icon name="user" className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold text-[#0A0A0A]">Personnel concerné</span>
            </header>
            <div className="flex items-center gap-3 p-4">
              {chargementPersonnelCible ? (
                <p role="status" className="text-xs font-medium text-[#86868B]">Chargement du personnel…</p>
              ) : personnelCible ? (
                <>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1B1BFF]/10 text-xs font-bold text-[#1B1BFF]">
                    {personnelCible.nom_complet?.split(/\s+/).slice(0, 2).map((m) => m[0]?.toUpperCase()).join('') || '?'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0A0A0A]">{personnelCible.nom_complet}</p>
                    <p className="mt-0.5 text-xs text-[#86868B]">IM : {personnelCible.im} · {personnelCible.service_libelle || 'Votre service'}</p>
                  </div>
                </>
              ) : (
                <p role="alert" className="text-xs font-semibold text-rose-600">Le personnel ne peut pas être chargé.</p>
              )}
            </div>
          </section>
        )}

        <form onSubmit={soumettre} className="space-y-4">
          <GroupeFormulaire icone="calendar" titre="Type et dates" ton="bleu" retard={240}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="group md:col-span-2">
                <label htmlFor="type_absence" className={etiquette}>Type d’absence *</label>
                <select
                  id="type_absence"
                  required
                  value={formulaire.type_absence}
                  onChange={(event) => modifierChamp('type_absence', event.target.value as TypeAbsence)}
                  className={champ}
                >
                  {typesAbsenceDisponibles.map((type) => (
                    <option key={type.valeur} value={type.valeur}>{type.libelle}</option>
                  ))}
                </select>
                {personnelConcerne?.statut?.toUpperCase() === 'STAGIAIRE' && (
                  <p className="mt-1.5 text-xs font-medium text-amber-800">Le statut stagiaire ne permet pas les congés annuels, de maternité ou de paternité.</p>
                )}
              </div>

              {formulaire.type_absence === 'CONGE_ANNUEL' && (
                <div className="group md:col-span-2">
                  <label htmlFor="annee_titre" className={etiquette}>
                    Année au titre de laquelle le congé est demandé *
                  </label>
                  <input
                    id="annee_titre"
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={9999}
                    step={1}
                    required
                    value={formulaire.annee_titre}
                    onChange={(event) => modifierChamp('annee_titre', event.target.value)}
                    onKeyDown={(event) => { if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault() }}
                    onPaste={(event) => { const texte = event.clipboardData.getData('text'); if (/\D/.test(texte)) { event.preventDefault(); modifierChamp('annee_titre', texte.replace(/\D/g, '').slice(0, 4)) } }}
                    className={champ}
                  />
                  <p className="mt-1.5 text-xs font-medium text-[#86868B]">
                    Choisissez l’année de droits à utiliser. La demande sera vérifiée selon la décision RH et le solde disponibles pour cette année.
                  </p>
                  {chargementRegleTranche && (
                    <p className="mt-2 text-xs text-[#52525B]" role="status">Vérification de la tranche de congé annuel…</p>
                  )}
                  {erreurRegleTranche && (
                    <p className="mt-2 text-xs font-medium text-red-700" role="alert">{erreurRegleTranche}</p>
                  )}
                  {!chargementRegleTranche && regleTrancheAnnuelle && (
                    regleTrancheAnnuelle.historique_incoherent ? (
                      <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium leading-5 text-red-800" role="alert">
                        {regleTrancheAnnuelle.message_historique || 'Une ancienne tranche ne respecte pas la règle. La RH doit régulariser le dossier avant une nouvelle demande pour cette année.'}
                      </p>
                    ) : (
                      <p className="mt-2 rounded-lg border border-[#D9D9FF] bg-[#F0F0FF] p-3 text-xs font-medium leading-5 text-[#1B1BFF]" role="status">
                        {regleTrancheAnnuelle.premiere_tranche
                          ? `Première tranche : ${JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL} jours calendaires obligatoires. Après avoir choisi la date de début, la date de fin est proposée automatiquement à J+${JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL - 1}.`
                          : `Tranche suivante : choisissez de 1 à ${JOURS_MAX_TRANCHE_CONGE_ANNUEL} jours calendaires, selon votre solde disponible.`}
                      </p>
                    )
                  )}
                </div>
              )}

              {(formulaire.type_absence === 'MATERNITE' || formulaire.type_absence === 'PATERNITE') && (
                <div className="group md:col-span-2">
                  <label htmlFor="date_evenement_prevue" className={etiquette}>
                    Date prévue de l’accouchement *
                  </label>
                  <input
                    id="date_evenement_prevue"
                    type="date"
                    required
                    min={dateEvenementMin}
                    max={dateEvenementMax}
                    value={formulaire.date_evenement_prevue}
                    onChange={(event) => modifierChamp('date_evenement_prevue', event.target.value)}
                    className={champ}
                  />
                  <p className="mt-1.5 text-xs font-medium text-[#86868B]">
                    {formulaire.type_absence === 'MATERNITE'
                      ? `La date prévue doit être entre le ${afficherDateISO(dateEvenementMin)} et le ${afficherDateISO(dateEvenementMax)} (1 à 3 mois à l’avance).`
                      : `La date prévue doit être entre le ${afficherDateISO(dateEvenementMin)} et le ${afficherDateISO(dateEvenementMax)} (14 à 30 jours à l’avance).`}
                  </p>
                </div>
              )}

              {congeFamilial ? (
                <>
                  <div className="group">
                    <label htmlFor="date_debut_calculee" className={etiquette}>Date de début calculée</label>
                    <input
                      id="date_debut_calculee"
                      type="date"
                      value={dateDebutCalculee}
                      readOnly
                      aria-readonly="true"
                      className={`${champ} bg-[#FAFAF8] text-[#86868B]`}
                    />
                    <p className="mt-1.5 text-xs font-medium text-[#86868B]">La période est calculée automatiquement à partir de la date prévue d’accouchement.</p>
                  </div>
                  <div className="group">
                    <label htmlFor="date_fin_calculee" className={etiquette}>Date de fin calculée</label>
                    <input
                      id="date_fin_calculee"
                      type="date"
                      value={dateFinCalculee}
                      readOnly
                      aria-readonly="true"
                      className={`${champ} bg-[#FAFAF8] text-[#86868B]`}
                    />
                    <p className="mt-1.5 text-xs font-medium text-[#86868B]">Durée fixe : {dureeFamiliale} jours calendaires, calculée automatiquement.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="group">
                    <label htmlFor="date_debut" className={etiquette}>Date de début *</label>
                    <input
                      id="date_debut"
                      type="date"
                      required
                      min={formulaire.type_absence === 'CONGE_ANNUEL' ? debutCongeAnnuelMin : formulaire.type_absence === 'MISSION' ? debutMissionMin : undefined}
                      max={formulaire.type_absence === 'CONGE_ANNUEL' ? debutCongeAnnuelMax : undefined}
                      value={formulaire.date_debut}
                      onChange={(event) => modifierChamp('date_debut', event.target.value)}
                      className={champ}
                    />
                    {formulaire.type_absence === 'CONGE_ANNUEL' && (
                      <p className="mt-1.5 text-xs font-medium text-[#86868B]">
                        Déposez votre demande entre 14 et 30 jours avant le début, soit du {afficherDateISO(debutCongeAnnuelMin)} au {afficherDateISO(debutCongeAnnuelMax)}.
                      </p>
                    )}
                    {formulaire.type_absence === 'MISSION' && (
                      <p className="mt-1.5 text-xs font-medium text-[#86868B]">
                        La mission doit être déposée au moins 7 jours avant le début, à partir du {afficherDateISO(debutMissionMin)}.
                      </p>
                    )}
                  </div>

                  <div className="group">
                    <label htmlFor="date_fin" className={etiquette}>Date de fin *</label>
                    <input
                      id="date_fin"
                      type="date"
                      required
                      min={formulaire.type_absence === 'CONGE_ANNUEL' && regleTrancheAnnuelle?.premiere_tranche && formulaire.date_debut
                        ? ajouterJoursISO(formulaire.date_debut, JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL - 1)
                        : formulaire.date_debut || undefined}
                      max={formulaire.type_absence === 'CONGE_ANNUEL' && formulaire.date_debut
                        ? ajouterJoursISO(formulaire.date_debut, JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL - 1)
                        : undefined}
                      value={formulaire.date_fin}
                      onChange={(event) => modifierChamp('date_fin', event.target.value)}
                      className={champ}
                    />
                    {formulaire.type_absence === 'CONGE_ANNUEL' && (
                      <p className="mt-1.5 text-xs font-medium text-[#86868B]">
                        {regleTrancheAnnuelle?.premiere_tranche
                          ? `La première tranche doit couvrir exactement ${JOURS_PREMIERE_TRANCHE_CONGE_ANNUEL} jours calendaires.`
                          : `Une tranche ultérieure ne peut pas dépasser ${JOURS_MAX_TRANCHE_CONGE_ANNUEL} jours calendaires.`}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="flex items-center justify-between rounded-xl border border-[#E5E5EA] bg-[#F0F0FF] px-4 py-3 md:col-span-2">
                <p className="text-xs font-medium text-[#86868B]">Durée estimée</p>
                <p className="text-sm font-semibold text-[#1B1BFF]">
                  {nombreJours === null ? '—' : `${nombreJours} jour${nombreJours > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
          </GroupeFormulaire>

          <GroupeFormulaire icone="list" titre="Motif et lieu" ton="vert" retard={300}>
            <div className="grid grid-cols-1 gap-4">
              <div className="group">
                <label htmlFor="motif" className={etiquette}>
                  {motifAutomatiquePourType(formulaire.type_absence) ? 'Motif' : 'Motif *'}
                </label>
                {motifAutomatiquePourType(formulaire.type_absence) ? (
                  <input
                    id="motif"
                    type="text"
                    value={libelleTypeAbsence(formulaire.type_absence)}
                    readOnly
                    aria-readonly="true"
                    className={`${champ} bg-[#F0F0FF] font-semibold text-[#1B1BFF]`}
                  />
                ) : (
                  <textarea
                    id="motif"
                    rows={4}
                    required
                    value={formulaire.motif}
                    onChange={(event) => modifierChamp('motif', event.target.value)}
                    placeholder="Expliquez le motif de votre demande…"
                    className={zoneTexte}
                  />
                )}
                <p className="mt-1.5 text-xs font-medium text-[#86868B]">
                  {motifAutomatiquePourType(formulaire.type_absence)
                    ? 'Le motif est renseigné automatiquement selon le type d’absence ; aucune justification supplémentaire n’est demandée.'
                    : 'Ce motif sera repris dans la fiche officielle MEN.'}
                </p>
              </div>

              <div className="group">
                <label htmlFor="lieu_jouissance" className={etiquette}>Lieu de jouissance *</label>
                <input
                  id="lieu_jouissance"
                  type="text"
                  maxLength={200}
                  required
                  value={formulaire.lieu_jouissance}
                  onChange={(event) => modifierChamp('lieu_jouissance', event.target.value.replace(/[\r\n\t]/g, ' '))}
                  placeholder="Lieu où le congé sera passé"
                  className={champ}
                />
              </div>
            </div>
          </GroupeFormulaire>

          <GroupeFormulaire icone="upload" titre="Justificatif" ton="ardoise" retard={360}>
            <div className="group">
              <label htmlFor="fichier_justificatif" className={etiquette}>
                Fichier joint <span className="text-[#86868B]">(facultatif)</span>
              </label>
              <input
                ref={referenceFichier}
                id="fichier_justificatif"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
                
                onChange={selectionnerFichier}
                className="block w-full cursor-pointer rounded-xl border border-[#E5E5EA] bg-white px-3 py-2 text-sm text-[#0A0A0A] file:mr-3 file:rounded-lg file:border-0 file:bg-[#1B1BFF]/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#1B1BFF] file:transition hover:file:bg-[#1B1BFF]/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/15"
              />
              <p className="mt-1.5 text-xs font-medium text-[#86868B]">
                Formats acceptés : PDF, JPG, JPEG, PNG, TIF, TIFF · 15 Mo max. (facultatif)
              </p>

              {fichier && (
                <div className="rh-pop mt-3 flex items-center gap-2 rounded-xl border border-[#00FF9C]/35 bg-[#00FF9C] px-3 py-2 text-xs font-semibold text-[#0A0A0A]">
                  <Icon name="check" className="h-4 w-4 shrink-0" />
                  <span className="break-all">{fichier.name}</span>
                </div>
              )}
            </div>
          </GroupeFormulaire>

          <GroupeFormulaire icone="check" titre="Signature électronique du demandeur *" ton="bleu" retard={390}>
            <div className="space-y-3">
              <p className="text-sm leading-6 text-[#5D5D66]">Signez dans le cadre avec votre souris ou votre doigt. Cette signature sera enregistrée avec la demande et imprimée sur la fiche officielle lorsqu’un formulaire MEN est prévu.</p>
              <div className="overflow-hidden rounded-xl border border-[#D1D5DB] bg-white">
                <canvas
                  ref={signatureCanvasRef}
                  width={1440}
                  height={360}
                  aria-label="Zone de signature électronique"
                  onPointerDown={commencerSignature}
                  onPointerMove={continuerSignature}
                  onPointerUp={terminerSignature}
                  onPointerCancel={terminerSignature}
                  onLostPointerCapture={() => { signatureTraitEnCours.current = false }}
                  className="block h-[180px] w-full cursor-crosshair touch-none bg-white"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={`inline-flex items-center gap-2 text-xs font-medium ${signatureTracee ? 'text-emerald-700' : 'text-[#86868B]'}`}>
                  <span className={`h-2 w-2 rounded-full ${signatureTracee ? 'bg-emerald-500' : 'bg-[#D1D5DB]'}`} />
                  {signatureTracee ? 'Signature tracée, prête à être envoyée' : 'Signature requise avant la soumission'}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={annulerDernierTraitSignature} disabled={!signatureTracee} className={`${btnContour} !h-8 !px-3 !text-xs`}>
                    <Icon name="refresh" className="h-3.5 w-3.5" /> Annuler le dernier trait
                  </button>
                  <button type="button" onClick={effacerSignature} disabled={!signatureTracee} className={`${btnContour} !h-8 !px-3 !text-xs`}>
                    <Icon name="close" className="h-3.5 w-3.5" /> Effacer la signature
                  </button>
                </div>
              </div>
              {demandePourUnAgent && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <input type="checkbox" checked={confirmationSignatureDeleguee} onChange={(event) => setConfirmationSignatureDeleguee(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1B1BFF]" />
                  <span>Je confirme que la signature tracée est celle du demandeur concerné et qu’il a donné son accord pour cette demande.</span>
                </label>
              )}
              <p className="text-xs leading-5 text-[#86868B]">La date, le compte utilisé pour l’envoi et l’empreinte du fichier de signature sont conservés pour assurer la traçabilité.</p>
            </div>
          </GroupeFormulaire>

          <div className="rh-in flex flex-col-reverse items-center gap-3 pt-4 sm:flex-row sm:justify-end" style={delai(450)}>
            <Link to={cheminRetour} className={`${btnContour} w-full sm:w-auto`}>
              <Icon name="close" className="h-4 w-4" /> Annuler
            </Link>
            <button
              type="submit"
              disabled={
                envoiEnCours
                || chargementPersonnelCible
                || (demandePourUnAgent && !personnelCible)
                || (formulaire.type_absence === 'CONGE_ANNUEL' && (
                  chargementRegleTranche
                  || !regleTrancheAnnuelle
                  || Boolean(erreurRegleTranche)
                  || regleTrancheAnnuelle.historique_incoherent
                ))
              }
              className={`${btnPrimaire} w-full sm:w-auto`}
            >
              {envoiEnCours ? <Icon name="loader" className="h-4 w-4 animate-spin" /> : <Icon name="check" className="h-4 w-4" />}
              {envoiEnCours ? 'Envoi en cours…' : demandePourUnAgent ? 'Soumettre pour l’agent' : 'Soumettre la demande'}
            </button>
          </div>
        </form>
          </>
        )}
        {dansContexteSaisieDeleguee && !demandePourUnAgent && !chargementListePersonnels && !erreurListePersonnels && (
          <p className="rounded-xl border border-dashed border-[#B4B4BF] bg-white p-4 text-sm text-[#5D5D66]">
            {estEspaceRHDelegue
              ? 'Sélectionnez un agent ci-dessus pour afficher le formulaire. Les champs, contrôles et règles seront identiques à ceux de l’espace Chef de service.'
              : 'Sélectionnez un membre de votre service ci-dessus pour afficher le formulaire de sa demande.'}
          </p>
        )}
      </div>
    </CoquilleDemandeRole>
  )
}

export default NouvelleDemandePage