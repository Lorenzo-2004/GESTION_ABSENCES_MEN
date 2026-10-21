import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Navigate } from 'react-router'

import { useAuth } from '../../contexts/useAuth'
import {
  enregistrerAvisDirecteur,
  listerDemandesEnAttenteDirection,
  type AvisDirecteur,
  type DemandeDirection,
  type ValidationDemande,
} from '../../services/directeurService'
import { Icon, Message } from '../../components/men/ui'
import { delai, useCompteur } from '../../components/men/ui-outils'
import {
  CoquilleDirecteur,
  Tiroir,
  type VueDirecteur,
} from '../../components/men/miseEnPageRH'
import { messageErreurUtilisateur } from '../../lib/messages'
import { nomAffichageUtilisateur } from '../../lib/nomAffichageUtilisateur'

const TITRES_VUES: Record<VueDirecteur, { titre: string; description: string }> = {
  apercu: { titre: 'Vue d’ensemble', description: 'Suivi des validations de la direction' },
  demandes: { titre: 'Décisions à rendre', description: 'Demandes qui attendent votre avis définitif' },
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

const champ =
  'h-11 w-full rounded-xl border border-[#E5E5EA] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#5D5D66] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:bg-[#FAFAF8] disabled:text-[#5D5D66]'

const zoneTexte =
  'min-h-[100px] w-full resize-y rounded-xl border border-[#E5E5EA] bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#5D5D66] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15'

const GRIS = 'rounded-[24px] bg-[#C2C2CC]'
const BLANC = 'rounded-2xl bg-white shadow-[0_1px_2px_rgba(10,10,10,0.08)]'

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

function dateLisible(date?: string | null): string {
  if (!date) return '—'
  const valeur = new Date(`${date.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(valeur.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(valeur)
}

function nomPersonnel(demande: DemandeDirection): string {
  const personnel = demande.personnel_detail
  if (personnel?.nom_complet) return personnel.nom_complet
  const nom = `${personnel?.prenoms ?? ''} ${personnel?.nom ?? ''}`.trim()
  return nom || `Personnel #${demande.personnel}`
}

function initiales(nom: string): string {
  const lettres = nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase()).join('')
  return lettres || '?'
}

function teinteAvatar(nom: string): string {
  const somme = [...nom].reduce((total, c) => total + c.charCodeAt(0), 0)
  return AVATARS[somme % AVATARS.length]
}

function messageErreur(erreur: unknown): string {
  return messageErreurUtilisateur(erreur, 'Impossible de traiter la validation. Vérifiez les informations puis réessayez.')
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
    case 'APPROUVE_CS': return 'Visa chef'
    case 'EN_ATTENTE': return 'En attente'
    case 'VALIDE_DIR': return 'Validée'
    case 'REJETE': return 'Rejetée'
    default: return statut.replaceAll('_', ' ')
  }
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

function BadgeStatut({ statut }: { statut: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${classeStatut(statut)}`}>
      <span className={`h-2 w-2 rounded-full ${statut === 'VALIDE_DIR' ? 'bg-[#00FF9C]' : statut === 'REJETE' ? 'bg-rose-500' : statut === 'APPROUVE_CS' ? 'bg-[#1B1BFF]' : 'rh-pulse bg-amber-500'}`} />
      {libelleStatut(statut)}
    </span>
  )
}

function Cercles({ elements }: { elements: { libelle: string; valeur: number }[] }) {
  const liste = [...elements].sort((a, b) => b.valeur - a.valeur).slice(0, 4)
  const T = 250
  const min = 84
  const taille = (i: number) => (liste.length === 1 ? T : T - (i * (T - min)) / Math.max(1, liste.length - 1))
  const fonds = [
    'bg-[#1B1BFF] text-white',
    'bg-[#1B1BFF]/40 text-[#0A0A0A]',
    'bg-[#1B1BFF]/20 text-[#0A0A0A]',
    'bg-[#1B1BFF]/10 text-[#0A0A0A]',
  ]
  if (liste.length === 0) return <p className="py-10 text-center text-sm text-[#5D5D66]">Aucune donnée disponible.</p>

  return (
    <div className="relative mx-auto" style={{ width: T, height: T }}>
      {liste.map((element, index) => (
        <div
          key={element.libelle}
          className={`rh-pop absolute inset-x-0 bottom-0 mx-auto grid content-start justify-items-center rounded-full pt-3 ${fonds[liste.length - 1 - index]}`}
          style={{ width: taille(index), height: taille(index), animationDelay: `${300 + index * 130}ms` }}
        >
          <span className="text-center leading-tight">
            <span className="men-serif block text-base tabular-nums">{element.valeur}</span>
            <span className="block max-w-[100px] px-1 text-[10px] opacity-80">{element.libelle}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function Anneau({
  ratio,
  centre,
  taille = 150,
  epaisseur = 12,
  couleur = '#00FF9C',
}: {
  ratio: number
  centre: ReactNode
  taille?: number
  epaisseur?: number
  couleur?: string
}) {
  const r = (taille - epaisseur) / 2
  const c = 2 * Math.PI * r
  const ratioNormalise = Math.min(Math.max(ratio, 0), 1)
  const o = c * (1 - ratioNormalise)

  return (
    <div
      className="relative mx-auto shrink-0 rounded-full bg-[#0A0A0A] p-2 shadow-[0_18px_30px_-18px_rgba(10,10,10,0.7)]"
      style={{ width: 150, height: 150 }}
    >
      <svg
        width={150}
        height={150}
        viewBox={`0 0 ${taille} ${taille}`}
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={`Taux : ${Math.round(ratioNormalise * 100)} %`}
      >
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={epaisseur}
        />

        <circle
          className="rh-ring"
          cx={taille / 2}
          cy={taille / 2}
          r={r}
          fill="none"
          stroke={couleur}
          strokeWidth={epaisseur}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={o}
          style={
            {
              '--c': c,
              '--o': o,
            } as React.CSSProperties
          }
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center text-center text-white">
        {centre}
      </div>
    </div>
  )
}

function HistoriqueAvis({ validations }: { validations: ValidationDemande[] }) {
  if (validations.length === 0) {
    return <p className="rounded-xl border border-[#E5E5EA] bg-[#F0F0FF] px-4 py-4 text-sm text-[#5D5D66]">Aucun avis enregistré pour le moment.</p>
  }
  return (
    <ol className="space-y-3 border-l-2 border-[#E5E5EA] pl-4">
      {validations.map((validation) => (
        <li key={validation.id_validation} className="relative">
          <span className="absolute -left-[22px] top-3 grid h-3 w-3 place-items-center rounded-full bg-[#1B1BFF] shadow-sm" />
          <div className="rounded-xl border border-[#E5E5EA] bg-white p-3.5">
            <p className="text-sm font-semibold text-[#0A0A0A]">
              {validation.niveau_libelle || validation.niveau} · {validation.avis_libelle || validation.avis}
            </p>
            {validation.observation && (
              <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-[#FAFAF8] p-2.5 text-xs leading-5 text-[#4F4F58]">{validation.observation}</p>
            )}
            <p className="mt-2 text-xs text-[#5D5D66]">{dateLisible(validation.date_action)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

export function DashboardDirecteurPage() {
  const { utilisateur, chargement } = useAuth()
  const [vue, setVue] = useState<VueDirecteur>('apercu')

  const [demandes, setDemandes] = useState<DemandeDirection[]>([])
  const [recherche, setRecherche] = useState('')
  const [chargementDonnees, setChargementDonnees] = useState(true)
  const [erreur, setErreur] = useState('')

  const [tiroirOuvert, setTiroirOuvert] = useState(false)
  const [selection, setSelection] = useState<number | null>(null)
  const [avis, setAvis] = useState<AvisDirecteur>('FAVORABLE')
  const [observation, setObservation] = useState('')
  const [erreurAction, setErreurAction] = useState('')
  const [messageSucces, setMessageSucces] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)

  const chargerDemandes = useCallback(async () => {
    setChargementDonnees(true)
    setErreur('')
    try {
      const resultats = await listerDemandesEnAttenteDirection()
      setDemandes(resultats)
      setSelection((precedente) =>
        precedente !== null && resultats.some((d) => d.id_demande === precedente)
          ? precedente
          : resultats[0]?.id_demande ?? null,
      )
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setChargementDonnees(false)
    }
  }, [])

  useEffect(() => {
    if (chargement || !utilisateur || utilisateur.role !== 'ROLE_DIRECTEUR') return
    void chargerDemandes()
  }, [chargement, utilisateur, chargerDemandes])

  const demandesFiltrees = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase('fr')
    if (!terme) return demandes
    return demandes.filter((demande) => {
      const nomDemandeur = nomPersonnel(demande).toLocaleLowerCase('fr')
      const numero = demande.numero_enregistrement?.toLocaleLowerCase('fr') ?? ''
      const type = demande.type_absence_libelle.toLocaleLowerCase('fr')
      const motif = demande.motif.toLocaleLowerCase('fr')
      return (
        nomDemandeur.includes(terme) ||
        numero.includes(terme) ||
        type.includes(terme) ||
        motif.includes(terme) ||
        String(demande.personnel).includes(terme)
      )
    })
  }, [demandes, recherche])

  const demandeSelectionnee = demandes.find((demande) => demande.id_demande === selection) ?? null

  const repartitionAnnees = useMemo(() => {
    const groupes = new Map<string, number>()
    for (const demande of demandes) {
      const libelle = demande.annee_titre == null ? 'Sans année' : String(demande.annee_titre)
      groupes.set(libelle, (groupes.get(libelle) ?? 0) + 1)
    }
    return [...groupes.entries()]
      .map(([libelle, valeur]) => ({ libelle, valeur }))
      .sort((a, b) => b.valeur - a.valeur || b.libelle.localeCompare(a.libelle, 'fr'))
      .slice(0, 4)
  }, [demandes])

  const direction = utilisateur?.personnel?.direction_libelle || 'Direction'
  const valeurStat = (valeur: number) => (chargementDonnees ? 0 : valeur)
  const nombreAvecVisaChef = demandes.filter((d) => d.statut_demande === 'APPROUVE_CS').length
  const nombreDeposeesDirectement = demandes.filter((d) => d.statut_demande === 'EN_ATTENTE').length
  const nombreAvecJustificatif = demandes.filter((d) => Boolean(d.justificatif_url)).length
  const total = demandes.length
  const nombreJoursDemandes = demandes.reduce((somme, demande) => somme + (Number(demande.nombre_jours) || 0), 0)
  const part = (n: number) => (total ? (n / total) * 100 : 0)
  const ratioVisaChef = total ? nombreAvecVisaChef / total : 0
  const pourcentage = Math.round(ratioVisaChef * 100)
  const affTotal = useCompteur(valeurStat(total))
  const affVisaChef = useCompteur(valeurStat(nombreAvecVisaChef))
  const affDirectes = useCompteur(valeurStat(nombreDeposeesDirectement))
  const affJustificatifs = useCompteur(valeurStat(nombreAvecJustificatif))
  const pourcentageAffiche = useCompteur(chargementDonnees ? 0 : pourcentage)

  const maintenant = new Date()
  const jourDuMois = maintenant.getDate()
  const jourSemaine = maintenant.toLocaleDateString('fr-FR', { weekday: 'long' })
  const moisCourant = maintenant.toLocaleDateString('fr-FR', { month: 'long' })
  const nbPoints = 36
  const pointsRemplis = total ? Math.round(ratioVisaChef * nbPoints) : 0
  const titreHero = chargementDonnees
    ? 'Chargement des dossiers'
    : total > 0
      ? `${total} décision${total > 1 ? 's' : ''} à rendre`
      : ''

  function ouvrirTiroir(demande: DemandeDirection) {
    setSelection(demande.id_demande)
    setAvis('FAVORABLE')
    setObservation('')
    setErreurAction('')
    setTiroirOuvert(true)
  }

  async function traiterDemande() {
    if (!demandeSelectionnee || enregistrement) return
    setEnregistrement(true)
    setErreurAction('')
    setMessageSucces('')
    try {
      await enregistrerAvisDirecteur(demandeSelectionnee.id_demande, avis, observation)
      setMessageSucces(avis === 'FAVORABLE' ? 'La demande a été validée par la direction.' : 'La demande a été rejetée.')
      setTiroirOuvert(false)
      setObservation('')
      await chargerDemandes()
    } catch (cause) {
      setErreurAction(messageErreur(cause))
    } finally {
      setEnregistrement(false)
    }
  }

  if (chargement) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8]">
        <span role="status" aria-label="Chargement" className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1B1BFF]/15 border-t-[#1B1BFF]" />
      </div>
    )
  }

  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (utilisateur.role !== 'ROLE_DIRECTEUR') return <Navigate to="/app" replace />

  return (
    <CoquilleDirecteur
      vue={vue}
      onVue={setVue}
      badges={{ demandes: demandes.length }}
      titre={TITRES_VUES[vue].titre}
      description={TITRES_VUES[vue].description}
      actions={
        <button
          type="button"
          onClick={() => { setMessageSucces(''); void chargerDemandes() }}
          disabled={chargementDonnees}
          aria-label="Actualiser"
          title="Actualiser"
          className={`${btnContour} !px-3 !h-9`}
        >
          <Icon name="refresh" className={`h-4 w-4 ${chargementDonnees ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <style>{STYLES}</style>


      {!tiroirOuvert && messageSucces && (
        <Message type="succes" onClose={() => setMessageSucces('')}>{messageSucces}</Message>
      )}
      {!tiroirOuvert && erreur && (
        <Message type="erreur" onClose={() => setErreur('')}>
          {erreur}
          <button type="button" onClick={() => void chargerDemandes()} className="mt-2 block text-sm font-semibold underline-offset-2">Réessayer</button>
        </Message>
      )}

      {vue === 'apercu' && (
        <div className="min-w-0 rounded-[32px] border border-[#E5E5EA] bg-white p-3 sm:p-4">
          {/* En-tête — même composition que la vue d’ensemble RH */}
          <section className="rh-in flex min-w-0 flex-col gap-4 rounded-[24px] bg-[#D0D0D9] p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between" style={delai(0)}>
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-[#E5E5EA] bg-white sm:h-24 sm:w-24">
                <span className="men-serif text-3xl tabular-nums sm:text-4xl">{jourDuMois}</span>
              </span>
              <div className="text-sm leading-snug">
                <p className="font-semibold capitalize text-[#0A0A0A]">{jourSemaine},</p>
                <p className="capitalize text-[#5D5D66]">{moisCourant}</p>
              </div>
            </div>
            <div className="min-w-0 lg:text-right">
              <h2 className="men-serif text-2xl leading-tight text-[#0A0A0A] sm:text-4xl">{nomAffichageUtilisateur(utilisateur)}</h2>
              {titreHero && <p className="men-serif text-2xl leading-tight text-[#71717B] sm:text-4xl">{titreHero}</p>}
              <p className="mt-2 text-xs text-[#4F4F58]">{direction} · suivi des demandes en attente de décision</p>
            </div>
          </section>

          {/* Statistiques principales — grille 12 colonnes comme la référence RH */}
          <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-12">
            <section className={`rh-in flex min-w-0 flex-col justify-between p-5 lg:col-span-3 ${GRIS}`} style={delai(80)}>
              <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white"><Icon name="file" className="h-4 w-4" /></span>
                Demandes
              </div>
              <div className="mt-4">
                <p className="men-serif text-4xl leading-none tabular-nums text-[#0A0A0A]">{affTotal}</p>
                <p className="mt-1 text-xs text-[#4F4F58]">en attente de décision</p>
              </div>
              <div className="mt-5 grid grid-cols-12 gap-1.5" aria-hidden="true">
                {Array.from({ length: nbPoints }, (_, index) => (
                  <span key={index} className={`rh-pop h-2.5 w-2.5 rounded-full ${index < pointsRemplis ? 'bg-[#00FF9C]' : total ? 'bg-[#FF6A2B]' : 'bg-[#A6A6B1]'}`} style={{ animationDelay: `${300 + index * 18}ms` }} />
                ))}
              </div>
            </section>

            <div className="grid min-w-0 gap-3 lg:col-span-4">
              <section className={`rh-in p-5 ${GRIS}`} style={delai(140)}>
                <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#00FF9C] text-[#0A0A0A]"><Icon name="check" className="h-4 w-4" /></span>
                  Avec visa du chef
                </div>
                <p className="men-serif mt-3 text-3xl leading-none tabular-nums text-[#0A0A0A]">{affVisaChef}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="rh-bar h-full rounded-full bg-[#00FF9C]" style={{ width: `${pourcentage}%`, ...delai(500) }} /></div>
              </section>
              <section className={`rh-in p-5 ${GRIS}`} style={delai(200)}>
                <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#FF6A2B] text-white"><Icon name="file" className="h-4 w-4" /></span>
                  Déposées directement
                </div>
                <p className="men-serif mt-3 text-3xl leading-none tabular-nums text-[#0A0A0A]">{affDirectes}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="rh-bar h-full rounded-full bg-[#FF6A2B]" style={{ width: `${part(nombreDeposeesDirectement)}%`, ...delai(560) }} /></div>
              </section>
            </div>

            <div className="rh-in grid place-items-center lg:col-span-2" style={delai(320)}>
              <Anneau ratio={chargementDonnees ? 0 : ratioVisaChef} centre={
                <div>
                  <p className="men-serif text-2xl leading-none tabular-nums">{pourcentageAffiche}%</p>
                  <p className="mt-1 text-[11px] text-white/70">Visa chef</p>
                </div>
              } />
            </div>

            <section className={`rh-in flex min-w-0 flex-col justify-between p-5 lg:col-span-3 ${GRIS}`} style={delai(380)}>
              <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white"><Icon name="file" className="h-4 w-4" /></span>
                Avec justificatif
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="men-serif text-3xl leading-none tabular-nums text-[#0A0A0A]">{affJustificatifs}</p>
                  <p className="mt-1 text-xs text-[#4F4F58]">pièce(s) jointe(s) disponible(s)</p>
                </div>
                <span className="inline-flex h-8 items-center rounded-full border border-[#E5E5EA] bg-white px-3 text-xs font-semibold tabular-nums text-[#1B1BFF]">{Math.round(part(nombreAvecJustificatif))}%</span>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white"><div className="rh-bar h-full rounded-full bg-[#1B1BFF]" style={{ width: `${part(nombreAvecJustificatif)}%`, ...delai(620) }} /></div>
            </section>
          </div>

          {/* Années + suivi des demandes — même hiérarchie que le panneau de suivi RH */}
          <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-12">
            <section className={`rh-in min-w-0 p-5 sm:p-6 lg:col-span-4 ${GRIS}`} style={delai(440)}>
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-[#0A0A0A]">Par année au titre du congé</h3>
                <p className="text-xs text-[#4F4F58]">Répartition des demandes à examiner</p>
              </div>
              <Cercles elements={repartitionAnnees} />
            </section>

            <section className={`rh-in min-w-0 p-5 sm:p-6 lg:col-span-8 ${GRIS}`} style={delai(500)}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-[#0A0A0A]">Suivi des demandes</h3>
                <p className="text-xs text-[#4F4F58]">Dossiers à traiter et circuit de validation</p>
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className={`flex min-h-[230px] min-w-0 flex-col p-4 ${BLANC}`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#0A0A0A]">À examiner</p>
                    {total > 0 && <button type="button" onClick={() => setVue('demandes')} className="rounded-md text-xs font-semibold text-[#1B1BFF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40">Tout voir</button>}
                  </div>
                  {chargementDonnees ? (
                    <div className="grid flex-1 place-items-center"><span role="status" className="h-5 w-5 animate-spin rounded-full border-2 border-[#1B1BFF]/20 border-t-[#1B1BFF]" /></div>
                  ) : total === 0 ? (
                    <div className="grid flex-1 place-items-center text-center">
                      <div><span className="rh-pop mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#00FF9C] text-[#0A0A0A]"><Icon name="check" className="h-5 w-5" /></span><p className="mt-3 text-sm text-[#5D5D66]">Rien à examiner</p></div>
                    </div>
                  ) : (
                    <ul className="space-y-2.5">
                      {demandes.slice(0, 4).map((demande, index) => (
                        <li key={demande.id_demande} className="rh-in flex min-w-0 items-center gap-2.5" style={delai(600 + index * 70)}>
                          <Avatar nom={nomPersonnel(demande)} className="h-8 w-8 text-[10px]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-[#0A0A0A]">{nomPersonnel(demande)}</p>
                            <p className="truncate text-[11px] text-[#5D5D66]">{demande.type_absence_libelle || demande.type_absence} · {demande.nombre_jours} j</p>
                          </div>
                          <button type="button" onClick={() => ouvrirTiroir(demande)} className="shrink-0 rounded-lg bg-[#C2C2CC] px-2.5 py-1.5 text-[11px] font-semibold text-[#0A0A0A] transition hover:bg-[#1B1BFF] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40">Examiner</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className={`flex min-h-[230px] min-w-0 flex-col justify-between p-4 ${BLANC}`}>
                  <p className="text-sm font-semibold text-[#0A0A0A]">Circuit de validation</p>
                  <div className="space-y-5 py-4">
                    {[
                      { libelle: 'Visa du chef', valeur: nombreAvecVisaChef, couleur: '#1B1BFF' },
                      { libelle: 'Dépôt direct', valeur: nombreDeposeesDirectement, couleur: '#FF6A2B' },
                    ].map((ligne, index) => (
                      <div key={ligne.libelle}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                          <span className="text-[#5D5D66]">{ligne.libelle}</span>
                          <span className="font-semibold tabular-nums text-[#0A0A0A]">{valeurStat(ligne.valeur)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#C2C2CC]"><div className="rh-bar h-full rounded-full" style={{ width: `${part(ligne.valeur)}%`, backgroundColor: ligne.couleur, ...delai(650 + index * 100) }} /></div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E5EA] bg-white px-3.5 py-3">
                    <span className="text-xs text-[#4F4F58]">Total de jours demandés</span>
                    <span className="men-serif text-xl tabular-nums text-[#0A0A0A]">{valeurStat(nombreJoursDemandes)} j</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
      {vue === 'demandes' && (
        <section className={`rh-in min-w-0 overflow-hidden ${carte}`}>
          <div className="flex flex-col gap-4 border-b border-[#E5E5EA] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#0A0A0A]">Dossiers à examiner</h2>
              <p className="mt-0.5 text-xs text-[#5D5D66]">
                {chargementDonnees ? 'Chargement…' : `${demandesFiltrees.length} résultat${demandesFiltrees.length > 1 ? 's' : ''} · ${total} au total`}
              </p>
            </div>
            <label className="group relative w-full lg:w-[26rem]">
              <span className="sr-only">Rechercher</span>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5D5D66] transition-colors group-focus-within:text-[#1B1BFF]" />
              <input type="search" value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Nom, numéro, type ou motif" className={`${champ} pl-10`} />
            </label>
          </div>

          {chargementDonnees ? (
            <div className="grid min-h-48 place-items-center">
              <span role="status" className="h-6 w-6 animate-spin rounded-full border-2 border-[#1B1BFF]/20 border-t-[#1B1BFF]" />
            </div>
          ) : demandesFiltrees.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <span className="rh-pop mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#1B1BFF]/10 text-[#1B1BFF] ring-8 ring-[#1B1BFF]/5">
                <Icon name="check" className="h-8 w-8" />
              </span>
              <p className="men-serif mt-5 text-3xl text-[#0A0A0A]">Aucune demande</p>
              <p className="mt-1 text-sm text-[#5D5D66]">
                {recherche ? 'Aucun dossier ne correspond.' : 'Tous les dossiers ont été traités.'}
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#F5F5F7] md:hidden">
                {demandesFiltrees.map((demande) => (
                  <article key={demande.id_demande} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar nom={nomPersonnel(demande)} className="h-9 w-9 text-xs" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#0A0A0A]">{nomPersonnel(demande)}</p>
                          <p className="break-all text-xs text-[#5D5D66]">{demande.numero_enregistrement || `#${demande.id_demande}`}</p>
                        </div>
                      </div>
                      <span className="max-w-[45%] shrink-0"><BadgeStatut statut={demande.statut_demande} /></span>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div><dt className="text-[#5D5D66]">Type</dt><dd className="mt-0.5 text-[#4F4F58]">{demande.type_absence_libelle || demande.type_absence}</dd></div>
                      <div><dt className="text-[#5D5D66]">Durée</dt><dd className="mt-0.5 text-[#4F4F58]">{demande.nombre_jours} j</dd></div>
                      <div><dt className="text-[#5D5D66]">Début</dt><dd className="mt-0.5 text-[#4F4F58]">{dateLisible(demande.date_debut)}</dd></div>
                      <div><dt className="text-[#5D5D66]">Fin</dt><dd className="mt-0.5 text-[#4F4F58]">{dateLisible(demande.date_fin)}</dd></div>
                    </dl>
                    <button type="button" onClick={() => ouvrirTiroir(demande)} className={`${btnPrimaire} w-full`}>
                      <Icon name="edit" className="h-4 w-4" /> Décider
                    </button>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-y border-[#E5E5EA] bg-[#F0F0FF] text-xs font-semibold text-[#5D5D66]">
                      <th scope="col" className="px-6 py-3">Demandeur</th>
                      <th scope="col" className="px-4 py-3">Type</th>
                      <th scope="col" className="px-4 py-3">Période</th>
                      <th scope="col" className="px-4 py-3">Durée</th>
                      <th scope="col" className="px-4 py-3">État</th>
                      <th scope="col" className="px-6 py-3"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F7]">
                    {demandesFiltrees.map((demande, index) => (
                      <tr key={demande.id_demande} className="rh-in group relative transition-colors hover:bg-[#F0F0FF]" style={delai(Math.min(index, 10) * 40)}>
                        <td className="relative px-6 py-4">
                          <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] origin-center scale-y-0 rounded-r-full bg-[#1B1BFF] transition-transform duration-300 group-hover:scale-y-100" />
                          <div className="flex items-center gap-3">
                            <Avatar nom={nomPersonnel(demande)} className="h-10 w-10 text-xs" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#0A0A0A]">{nomPersonnel(demande)}</p>
                              <p className="mt-0.5 truncate text-xs text-[#5D5D66]">
                                {demande.numero_enregistrement ? `N° ${demande.numero_enregistrement}` : `#${demande.id_demande}`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-[#0A0A0A]">{demande.type_absence_libelle || demande.type_absence}</td>
                        <td className="px-4 py-4 text-[#0A0A0A]">
                          <p>{dateLisible(demande.date_debut)}</p>
                          <p className="mt-0.5 text-xs text-[#5D5D66]">au {dateLisible(demande.date_fin)}</p>
                        </td>
                        <td className="px-4 py-4 font-semibold tabular-nums text-[#0A0A0A]">{demande.nombre_jours} j</td>
                        <td className="px-4 py-4"><BadgeStatut statut={demande.statut_demande} /></td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end">
                            <button type="button" onClick={() => ouvrirTiroir(demande)} className={btnPrimaire}>
                              <Icon name="edit" className="h-4 w-4" />
                              <span className="hidden lg:inline">Décider</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      <Tiroir
        ouvert={tiroirOuvert}
        onFermer={() => setTiroirOuvert(false)}
        titre="Décision de la direction"
        sousTitre={demandeSelectionnee ? nomPersonnel(demandeSelectionnee) : 'Consultez le dossier puis enregistrez votre avis.'}
        pied={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setTiroirOuvert(false)} disabled={enregistrement} className={`${btnContour} flex-1 sm:flex-none`}>Annuler</button>
            <button type="button" onClick={() => void traiterDemande()} disabled={enregistrement || chargementDonnees} className={`${btnPrimaire} flex-1 sm:flex-none`}>
              {enregistrement ? <Icon name="loader" className="h-4 w-4 animate-spin" /> : <Icon name={avis === 'FAVORABLE' ? 'check' : 'alert'} className="h-4 w-4" />}
              {enregistrement ? 'Enregistrement…' : avis === 'FAVORABLE' ? 'Valider la demande' : 'Rejeter la demande'}
            </button>
          </div>
        }
      >
        {demandeSelectionnee ? (
          <div className="min-w-0 space-y-5">
            <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-[#E5E5EA] bg-white p-4">
              <Avatar nom={nomPersonnel(demandeSelectionnee)} className="h-12 w-12 text-sm" />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[#0A0A0A]">{nomPersonnel(demandeSelectionnee)}</h3>
                <p className="mt-0.5 text-xs text-[#5D5D66]">
                  {demandeSelectionnee.numero_enregistrement ? `N° ${demandeSelectionnee.numero_enregistrement}` : `#${demandeSelectionnee.id_demande}`}
                </p>
                <div className="mt-2"><BadgeStatut statut={demandeSelectionnee.statut_demande} /></div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-4">
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#5D5D66]">Type d’absence</dt>
                  <dd className="mt-1 font-medium text-[#0A0A0A]">{demandeSelectionnee.type_absence_libelle || demandeSelectionnee.type_absence}</dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#5D5D66]">Début</dt>
                    <dd className="mt-1 font-medium text-[#0A0A0A]">{dateLisible(demandeSelectionnee.date_debut)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#5D5D66]">Fin</dt>
                    <dd className="mt-1 font-medium text-[#0A0A0A]">{dateLisible(demandeSelectionnee.date_fin)}</dd>
                  </div>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#5D5D66]">Durée</dt>
                  <dd className="mt-1 font-medium text-[#0A0A0A]">{demandeSelectionnee.nombre_jours} jour(s)</dd>
                </div>
                {demandeSelectionnee.annee_titre && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#5D5D66]">Année au titre du congé</dt>
                    <dd className="mt-1 font-medium text-[#0A0A0A]">{demandeSelectionnee.annee_titre}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#5D5D66]">Lieu de jouissance</dt>
                  <dd className="mt-1 text-[#4F4F58]">{demandeSelectionnee.lieu_jouissance || 'Non renseigné'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#5D5D66]">Motif</dt>
                  <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-[#4F4F58]">{demandeSelectionnee.motif || 'Aucun motif renseigné.'}</dd>
                </div>
                {demandeSelectionnee.justificatif_url && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#5D5D66]">Justificatif</dt>
                    <dd className="mt-1">
                      <a href={demandeSelectionnee.justificatif_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-[#1B1BFF] hover:text-[#1B1BFF]">
                        <Icon name="file" className="h-4 w-4" /> Consulter le justificatif
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-[#0A0A0A]">Historique des avis</h3>
              <HistoriqueAvis validations={demandeSelectionnee.validations ?? []} />
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void traiterDemande() }} className="space-y-4">
              <fieldset disabled={enregistrement || chargementDonnees} className="min-w-0">
                <legend className="mb-2.5 flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#1B1BFF]">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-[#1B1BFF]/10">
                    <Icon name="edit" className="h-3.5 w-3.5" />
                  </span>
                  Votre avis
                </legend>
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#E5E5EA] bg-white p-3 sm:grid-cols-2 sm:p-4">
                  <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-semibold transition ${avis === 'FAVORABLE' ? 'border-[#00FF9C]/40 bg-[#00FF9C]/10 text-[#0A0A0A]' : 'border-[#E5E5EA] text-[#5D5D66] hover:bg-[#F0F0FF]'}`}>
                    <input type="radio" name="avis-directeur" value="FAVORABLE" checked={avis === 'FAVORABLE'} onChange={() => setAvis('FAVORABLE')} className="accent-[#00FF9C]" />
                    Favorable
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-semibold transition ${avis === 'DEFAVORABLE' ? 'border-rose-400 bg-rose-50 text-rose-800' : 'border-[#E5E5EA] text-[#5D5D66] hover:bg-[#F0F0FF]'}`}>
                    <input type="radio" name="avis-directeur" value="DEFAVORABLE" checked={avis === 'DEFAVORABLE'} onChange={() => setAvis('DEFAVORABLE')} className="accent-rose-600" />
                    Défavorable
                  </label>
                </div>
              </fieldset>

              <div>
                <label htmlFor="observation-directeur" className="mb-1.5 block text-sm font-medium text-[#0A0A0A]">Observation</label>
                <textarea id="observation-directeur" value={observation} onChange={(event) => setObservation(event.target.value)} rows={4} disabled={enregistrement} placeholder="Précisez votre décision ou son motif…" className={zoneTexte} />
                <p className="mt-1.5 text-xs text-[#5D5D66]">Certaines catégories d’absence exigent une observation motivée.</p>
              </div>

              {erreurAction && <Message type="erreur">{erreurAction}</Message>}
            </form>
          </div>
        ) : (
          <div className="py-12 text-center">
            <span className="rh-pop mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#1B1BFF]/10 text-[#1B1BFF]">
              <Icon name="file" className="h-6 w-6" />
            </span>
            <p className="men-serif mt-3 text-2xl text-[#0A0A0A]">Détail de la demande</p>
            <p className="mt-2 text-sm text-[#5D5D66]">Sélectionnez une demande dans la liste pour commencer.</p>
          </div>
        )}
      </Tiroir>
    </CoquilleDirecteur>
  )
}

export default DashboardDirecteurPage