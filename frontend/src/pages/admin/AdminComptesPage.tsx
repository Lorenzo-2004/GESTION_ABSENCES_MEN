import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../../contexts/useAuth'
import {
  cinValide,
  emailGmailValide,
  imValide,
  nomValide,
  MESSAGE_CIN,
  MESSAGE_EMAIL_GMAIL,
  MESSAGE_IM,
  MESSAGE_NOM,
} from '../../lib/validationChamps'
import {
  creerCompte,
  listerComptes,
  listerPersonnelsPourCompte,
  modifierCompte,
  type CompteUtilisateur,
  type PersonnelPourCompte,
  type RoleCompte,
} from '../../services/adminComptesService'
import { Icon, Message, type IconName } from '../../components/men/ui'
import { delai, useCompteur } from '../../components/men/ui-outils'
import { CoquilleAdmin, Tiroir } from '../../components/men/miseEnPageRH'
import { messageErreurUtilisateur } from '../../lib/messages'

const TAILLE_PAGE = 20

const ROLES: { valeur: RoleCompte; libelle: string; icone: IconName }[] = [
  { valeur: 'ROLE_AGENT', libelle: 'Agent', icone: 'user' },
  { valeur: 'ROLE_CHEF_SERVICE', libelle: 'Chef de service', icone: 'users' },
  { valeur: 'ROLE_DIRECTEUR', libelle: 'Directeur', icone: 'building' },
  { valeur: 'ROLE_RH', libelle: 'Ressources humaines', icone: 'key' },
]

/* ------------------------------------------------------------------ */
/*  Palette institutionnelle                                           */
/* ------------------------------------------------------------------ */

const TON_ROLE: Record<string, string> = {
  ROLE_AGENT: 'bg-[#D0D0D9] text-[#0A0A0A]',
  ROLE_CHEF_SERVICE: 'bg-[#1B1BFF]/10 text-[#1B1BFF]',
  ROLE_DIRECTEUR: 'bg-[#00FF9C]/10 text-[#0A0A0A]',
  ROLE_RH: 'bg-[#1B1BFF]/10 text-[#1B1BFF]',
}

const COULEUR_ROLE: Record<string, string> = {
  ROLE_AGENT: '#86868B',
  ROLE_CHEF_SERVICE: '#1B1BFF',
  ROLE_DIRECTEUR: '#00FF9C',
  ROLE_RH: '#1B1BFF',
}

/* ------------------------------------------------------------------ */
/*  Polices                                                            */
/* ------------------------------------------------------------------ */

const STYLES = `
.adm-root{font-family:'Inter Variable','Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;font-feature-settings:'tnum' 0}
.adm-root .men-serif{font-family:'Space Grotesk Variable','Space Grotesk','Inter Variable','Inter',sans-serif;font-weight:500;letter-spacing:-.015em}
.adm-root .tabular-nums{font-variant-numeric:tabular-nums}

@keyframes rh-in{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}
@keyframes rh-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes rh-pop{0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:none}}
@keyframes rh-orbit{to{transform:rotate(360deg)}}
@keyframes rh-sheen{from{transform:translateX(-120%)}to{transform:translateX(280%)}}

.rh-in{animation:rh-in .6s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.rh-bar{transform-origin:left center;animation:rh-bar .9s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.rh-pop{animation:rh-pop .45s cubic-bezier(.22,1,.36,1) backwards}
.rh-orbit{transform-origin:center;animation:rh-orbit 80s linear infinite}
.rh-sheen::after{content:"";position:absolute;inset:0;width:36%;pointer-events:none;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.18),transparent);
  animation:rh-sheen 1.5s cubic-bezier(.4,0,.2,1) var(--d,600ms) 1 backwards}

@media (prefers-reduced-motion:reduce){
  .rh-in,.rh-bar,.rh-pop,.rh-orbit,.rh-sheen::after{animation:none!important}
}
`

/* ------------------------------------------------------------------ */
/*  Styles partagés                                                    */
/* ------------------------------------------------------------------ */

const carte =
  'rounded-[24px] border border-[#B4B4BF] bg-[#C2C2CC] shadow-none'

const btnPrimaire =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1B1BFF] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(27,27,255,.3),0_8px_16px_-8px_rgba(27,27,255,.55)] transition duration-200 hover:bg-[#1414D6] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 disabled:pointer-events-none disabled:opacity-60'

const btnContour =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E5E5EA] bg-white px-4 text-sm font-semibold text-[#0A0A0A] transition duration-200 hover:border-[#E5E5EA] hover:bg-[#D0D0D9] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/15 disabled:pointer-events-none disabled:opacity-60'

const btnIcone =
  'grid h-9 w-9 place-items-center rounded-lg text-[#86868B] transition-colors duration-200 hover:bg-[#1B1BFF]/10 hover:text-[#1B1BFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40 disabled:opacity-50'

const etiquette = 'mb-1.5 block text-sm font-medium text-[#0A0A0A]'

const champ =
  'h-11 w-full rounded-xl border border-[#E5E5EA] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#86868B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:bg-[#FAFAF8] disabled:text-[#86868B]'

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function extraireErreur(erreur: unknown): string {
  return messageErreurUtilisateur(erreur, 'Impossible de traiter cette opération. Vérifiez les informations puis réessayez.')
}

function dateLisible(valeur: string | null): string {
  if (!valeur) return 'Jamais'
  const date = new Date(valeur)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function nomRole(compte: CompteUtilisateur): string {
  return compte.role_libelle || ROLES.find((item) => item.valeur === compte.role)?.libelle || compte.role
}

function iconeRole(role: string): IconName {
  return ROLES.find((item) => item.valeur === role)?.icone ?? 'shield'
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
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        actif ? 'bg-[#DDF4EA] text-[#245B45]' : 'bg-[#E4E5E7] text-[#4B5056]'
      }`}
    >
      {actif ? 'Actif' : 'Inactif'}
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
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="#D0D0D9" strokeWidth={epaisseur} />
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
    <ul className="w-full min-w-0 flex-1 divide-y divide-[#D0D0D9]">
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

const TONS_KPI = {
  bleu: {
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
  ambre: {
    fond: 'bg-[#C2C2CC]',
    ombre: 'shadow-[0_1px_2px_rgba(10,10,10,.04)]',
    accent: '#D97706',
    icone: 'bg-[#FFF0D6] text-[#9A4A0A]',
  },
} as const

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
      className={`rh-in relative overflow-hidden rounded-[20px] ${s.fond} p-5 text-[#0A0A0A] shadow-none sm:p-6`}
      style={delai(retard)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#6E6E73]">{libelle}</p>
          <p className="men-serif mt-2 text-5xl leading-none tabular-nums text-[#0A0A0A]">{affiche}</p>
        </div>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${s.icone}`}>
          <Icon name={icone} className="h-5 w-5" />
        </span>
      </div>

      <div className="relative mt-5">
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-[#6E6E73]">
          <span>{note}</span>
          <span className="font-bold tabular-nums text-[#0A0A0A]">{Math.round(pct)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white">
          <div
            className="rh-bar h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: s.accent, ...delai(retard + 350) }}
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
  retard,
  children,
}: {
  titre: string
  sousTitre?: string
  icone: IconName
  accent: string
  retard: number
  children: ReactNode
}) {
  return (
    <section
      className="rh-in relative flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-[#B4B4BF] bg-[#C2C2CC] p-5 shadow-none sm:p-6"
      style={delai(retard)}
    >
      <header className="mb-5 flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon name={icone} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-[#0A0A0A]">{titre}</h2>
          {sousTitre && <p className="text-xs text-[#86868B]">{sousTitre}</p>}
        </div>
      </header>
      <div className="flex flex-1 flex-col justify-center rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(10,10,10,0.06)]">{children}</div>
    </section>
  )
}

const TEINTES_AVATAR = [
  'bg-[#1B1BFF]/10 text-[#1B1BFF]',
  'bg-[#00FF9C]/10 text-[#0A0A0A]',
  'bg-slate-500/10 text-slate-700',
  'bg-[#1B1BFF]/10 text-[#1B1BFF]',
  'bg-amber-500/10 text-amber-800',
]

function Initiales({ nom, className = 'h-9 w-9 text-xs' }: { nom: string; className?: string }) {
  const lettres = nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase()).join('') || '?'
  const somme = [...nom].reduce((t, c) => t + c.charCodeAt(0), 0)
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-bold ring-1 ring-inset ring-black/5 ${TEINTES_AVATAR[somme % TEINTES_AVATAR.length]} ${className}`}
    >
      {lettres}
    </span>
  )
}

function Interrupteur({
  libelle,
  coche,
  onChange,
  desactive,
}: {
  libelle: string
  coche: boolean
  onChange: (valeur: boolean) => void
  desactive?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between rounded-xl border border-[#E5E5EA] bg-white px-4 py-3.5 transition-colors hover:border-[#E5E5EA] focus-within:ring-4 focus-within:ring-[#1B1BFF]/15 ${
        desactive ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      <span className="text-sm font-semibold text-[#0A0A0A]">{libelle}</span>
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={coche}
          onChange={(e) => onChange(e.target.checked)}
          disabled={desactive}
        />
        <div className={`h-6 w-11 rounded-full transition-colors duration-300 ${coche ? 'bg-[#00FF9C]' : 'bg-[#D0D0D9]'}`} />
        <div
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,36,55,.3)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
            coche ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </label>
  )
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

export function AdminComptesPage() {
  const { utilisateur, chargement } = useAuth()
  const estAdministrateur = utilisateur?.role === 'ROLE_ADMIN'

  const [comptes, setComptes] = useState<CompteUtilisateur[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [nombrePages, setNombrePages] = useState(1)

  const [recherche, setRecherche] = useState('')
  const [rechercheAppliquee, setRechercheAppliquee] = useState('')

  const [enChargement, setEnChargement] = useState(true)
  const [erreurListe, setErreurListe] = useState<string | null>(null)
  const [cleActualisation, setCleActualisation] = useState(0)

  const [dialogueOuvert, setDialogueOuvert] = useState(false)
  const [modeFormulaire, setModeFormulaire] = useState<'creation' | 'edition'>('creation')
  const [compteCible, setCompteCible] = useState<CompteUtilisateur | null>(null)

  const [personnels, setPersonnels] = useState<PersonnelPourCompte[]>([])
  const [chargementPersonnels, setChargementPersonnels] = useState(false)

  const [personnelSelectionne, setPersonnelSelectionne] = useState('')
  const [email, setEmail] = useState('')
  const [emailModifie, setEmailModifie] = useState(false)
  const [role, setRole] = useState<RoleCompte>('ROLE_AGENT')
  const [motDePasse, setMotDePasse] = useState('')
  const [motDePasseVisible, setMotDePasseVisible] = useState(false)
  const [actif, setActif] = useState(true)

  const [enregistrement, setEnregistrement] = useState(false)
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null)
  const [messageSucces, setMessageSucces] = useState<string | null>(null)

  const chargerComptes = useCallback(async () => {
    setEnChargement(true)
    setErreurListe(null)
    try {
      const resultat = await listerComptes(page, rechercheAppliquee, TAILLE_PAGE)
      setComptes(resultat.resultats ?? [])
      setTotal(resultat.total ?? 0)
      setNombrePages(Math.max(1, resultat.nombrePages ?? 1))
    } catch (cause) {
      setErreurListe(extraireErreur(cause))
      setComptes([])
      setTotal(0)
    } finally {
      setEnChargement(false)
    }
  }, [page, rechercheAppliquee])

  useEffect(() => {
    if (chargement || !estAdministrateur) return
    void chargerComptes()
  }, [chargement, estAdministrateur, chargerComptes, cleActualisation])

  useEffect(() => {
    if (!dialogueOuvert || modeFormulaire !== 'creation') return
    let effetActif = true

    async function chargerListePersonnels() {
      setChargementPersonnels(true)
      try {
        const resultat = await listerPersonnelsPourCompte()
        if (effetActif) setPersonnels(resultat ?? [])
      } catch (cause) {
        if (effetActif) setErreurFormulaire(extraireErreur(cause))
      } finally {
        if (effetActif) setChargementPersonnels(false)
      }
    }

    void chargerListePersonnels()
    return () => { effetActif = false }
  }, [dialogueOuvert, modeFormulaire])

  const comptesActifs = useMemo(() => comptes.filter((compte) => compte.is_active).length, [comptes])
  const comptesDesactives = comptes.length - comptesActifs

  const erreurEmail = emailModifie && !emailGmailValide(email)
    ? email.trim() ? MESSAGE_EMAIL_GMAIL : 'L’adresse e-mail est obligatoire.'
    : ''

  const ficheSelectionnee = useMemo(
    () => personnels.find((p) => String(p.id_personnel) === personnelSelectionne) ?? null,
    [personnels, personnelSelectionne]
  )

  const anomaliesFicheSelectionnee = useMemo(() => {
    if (!ficheSelectionnee) return [] as string[]
    const anomalies: string[] = []
    if (!imValide(ficheSelectionnee.im ?? '')) anomalies.push(`IM : ${MESSAGE_IM}`)
    if (!cinValide(ficheSelectionnee.cin ?? '')) anomalies.push(`CIN : ${MESSAGE_CIN}`)
    if (!nomValide(ficheSelectionnee.nom ?? '')) anomalies.push(`Nom : ${MESSAGE_NOM}`)
    if (ficheSelectionnee.prenoms && !nomValide(ficheSelectionnee.prenoms)) anomalies.push(`Prénoms : ${MESSAGE_NOM}`)
    if (ficheSelectionnee.direction_libelle && !nomValide(ficheSelectionnee.direction_libelle)) anomalies.push('Direction : caractères non autorisés.')
    if (ficheSelectionnee.service_libelle && !nomValide(ficheSelectionnee.service_libelle)) anomalies.push('Service : caractères non autorisés.')
    return anomalies
  }, [ficheSelectionnee])

  const segmentsEtat: Segment[] = [
    { libelle: 'Actifs', valeur: comptesActifs, couleur: '#00FF9C' },
    { libelle: 'Inactifs', valeur: comptesDesactives, couleur: '#D97706' },
  ]

  const segmentsRoles: Segment[] = useMemo(
    () => ROLES.map((item) => ({
      libelle: item.libelle,
      valeur: comptes.filter((compte) => compte.role === item.valeur).length,
      couleur: COULEUR_ROLE[item.valeur],
    })),
    [comptes]
  )

  function ouvrirCreation() {
    setModeFormulaire('creation')
    setCompteCible(null)
    setPersonnelSelectionne('')
    setEmail('')
    setEmailModifie(false)
    setRole('ROLE_AGENT')
    setMotDePasse('')
    setMotDePasseVisible(false)
    setActif(true)
    setErreurFormulaire(null)
    setMessageSucces(null)
    setDialogueOuvert(true)
  }

  function ouvrirEdition(compte: CompteUtilisateur) {
    setModeFormulaire('edition')
    setCompteCible(compte)
    setPersonnelSelectionne(String(compte.personnel))
    setEmail(compte.email ?? '')
    setEmailModifie(false)
    setRole(compte.role)
    setMotDePasse('')
    setMotDePasseVisible(false)
    setActif(compte.is_active)
    setErreurFormulaire(null)
    setMessageSucces(null)
    setDialogueOuvert(true)
  }

  function fermerDialogue() {
    if (enregistrement) return
    setDialogueOuvert(false)
    setCompteCible(null)
    setErreurFormulaire(null)
  }

  async function soumettreFormulaire(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErreurFormulaire(null)
    setMessageSucces(null)
    setEmailModifie(true)

    if (!emailGmailValide(email)) {
      setErreurFormulaire(email.trim() ? MESSAGE_EMAIL_GMAIL : 'L’adresse e-mail est obligatoire.')
      return
    }

    if (modeFormulaire === 'creation' && !personnelSelectionne) {
      setErreurFormulaire('Sélectionnez une fiche de personnel.')
      return
    }

    if (modeFormulaire === 'creation' && anomaliesFicheSelectionnee.length > 0) {
      setErreurFormulaire(`La fiche ne respecte pas les règles : ${anomaliesFicheSelectionnee.join(' ')}`)
      return
    }

    if (modeFormulaire === 'creation' && !motDePasse) {
      setErreurFormulaire('Le mot de passe initial est obligatoire.')
      return
    }

    setEnregistrement(true)
    try {
      if (modeFormulaire === 'creation') {
        await creerCompte({
          personnel: Number(personnelSelectionne),
          email: email.trim(),
          role,
          password: motDePasse,
        })
      } else {
        if (!compteCible) {
          setErreurFormulaire('Aucun compte sélectionné.')
          return
        }
        await modifierCompte(compteCible.id, {
          email: email.trim(),
          role,
          is_active: actif,
          ...(motDePasse ? { password: motDePasse } : {}),
        })
      }

      setDialogueOuvert(false)
      setCompteCible(null)
      setMotDePasse('')
      setPage(1)
      setMessageSucces(modeFormulaire === 'creation' ? 'Le compte utilisateur a bien été créé.' : 'Les modifications ont été enregistrées.')

      if (page === 1) setCleActualisation((cle) => cle + 1)
    } catch (cause) {
      setErreurFormulaire(extraireErreur(cause))
    } finally {
      setEnregistrement(false)
    }
  }

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

  if (!utilisateur || !estAdministrateur) return <Navigate to="/403" replace />

  const valeur = (n: number) => (enChargement ? 0 : n)
  const partActifs = comptes.length ? (comptesActifs / comptes.length) * 100 : 0
  const partInactifs = comptes.length ? (comptesDesactives / comptes.length) * 100 : 0
  const partPage = nombrePages > 0 ? (page / nombrePages) * 100 : 0

  return (
    <CoquilleAdmin
      vue="comptes"
      onVue={() => undefined}
      titre="Comptes"
      description="Gérez les accès utilisateurs"
      actions={
        <>
          <button
            type="button"
            onClick={() => { setMessageSucces(null); setCleActualisation((c) => c + 1) }}
            disabled={enChargement}
            aria-label="Actualiser"
            title="Actualiser"
            className={`${btnContour} !px-3`}
          >
            <Icon name="refresh" className={`h-4 w-4 ${enChargement ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={ouvrirCreation} className={btnPrimaire}>
            <Icon name="plus" className="h-4 w-4" />
            <span className="hidden sm:inline">Créer un compte</span>
          </button>
        </>
      }
    >
      <style>{STYLES}</style>

      <div className="adm-root min-w-0 space-y-6 rounded-[32px] border border-[#E5E5EA] bg-white p-3 sm:p-4">
        {messageSucces && (
          <Message key={messageSucces} type="succes" onClose={() => setMessageSucces(null)}>
            {messageSucces}
          </Message>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <TuileKpi
            libelle="Comptes"
            valeur={valeur(total)}
            note={`Page ${page} sur ${nombrePages}`}
            part={partPage}
            icone="users"
            ton="bleu"
            retard={0}
          />
          <TuileKpi
            libelle="Actifs"
            valeur={valeur(comptesActifs)}
            note="Sur cette page"
            part={partActifs}
            icone="check"
            ton="vert"
            retard={70}
          />
          <TuileKpi
            libelle="Inactifs"
            valeur={valeur(comptesDesactives)}
            note="Sur cette page"
            part={partInactifs}
            icone="key"
            ton="ambre"
            retard={140}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Panneau titre="État des comptes" sousTitre="Actifs et inactifs" icone="shield" accent="#00FF9C" retard={200}>
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Donut
                segments={segmentsEtat}
                centre={
                  <div>
                    <p className="men-serif text-3xl leading-none tabular-nums text-[#0A0A0A]">{comptes.length}</p>
                    <p className="mt-1 text-xs font-medium text-[#86868B]">comptes</p>
                  </div>
                }
              />
              <Legende segments={segmentsEtat} />
            </div>
          </Panneau>

          <Panneau titre="Répartition par rôle" sousTitre="Sur cette page" icone="users" accent="#1B1BFF" retard={260}>
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Donut
                segments={segmentsRoles}
                centre={
                  <div>
                    <p className="men-serif text-3xl leading-none tabular-nums text-[#0A0A0A]">
                      {segmentsRoles.reduce((s, r) => s + r.valeur, 0)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-[#86868B]">rôles</p>
                  </div>
                }
              />
              <Legende segments={segmentsRoles} />
            </div>
          </Panneau>
        </div>

        <section className={`rh-in overflow-hidden ${carte}`} style={delai(320)}>
          <div className="border-b border-[#D0D0D9] bg-[#D0D0D9] p-4 sm:p-5">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                setPage(1)
                setRechercheAppliquee(recherche.trim())
              }}
            >
              <label className="group relative min-w-0 flex-1">
                <span className="sr-only">Rechercher</span>
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B] transition-colors group-focus-within:text-[#1B1BFF]"
                />
                <input
                  type="search"
                  value={recherche}
                  onChange={(event) => setRecherche(event.target.value)}
                  placeholder="Nom, IM ou e-mail"
                  className={`${champ} pl-10`}
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" className={`${btnPrimaire} !h-11 flex-1 sm:flex-none`}>
                  Rechercher
                </button>
                {rechercheAppliquee && (
                  <button
                    type="button"
                    onClick={() => { setRecherche(''); setRechercheAppliquee(''); setPage(1) }}
                    aria-label="Effacer la recherche"
                    title="Effacer la recherche"
                    className={`${btnContour} !h-11 !px-3`}
                  >
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>
          </div>

          {erreurListe && (
            <div className="p-4">
              <Message key={erreurListe} type="erreur">
                <p className="text-sm">{erreurListe}</p>
                <button
                  type="button"
                  onClick={() => setCleActualisation((c) => c + 1)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-300 px-2.5 py-1 text-xs font-semibold transition hover:bg-rose-100"
                >
                  <Icon name="refresh" className="h-3 w-3" /> Réessayer
                </button>
              </Message>
            </div>
          )}

          {enChargement ? (
            <div className="overflow-x-auto" aria-busy="true">
              <table className="w-full min-w-[750px] border-collapse">
                <tbody className="divide-y divide-[#D0D0D9] bg-[#C2C2CC]">
                  {Array.from({ length: 4 }, (_, i) => (
                    <tr key={i} aria-hidden="true" className="bg-white">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#D0D0D9] motion-reduce:animate-none" />
                          <div className="space-y-1.5">
                            <span className="block h-3.5 w-32 animate-pulse rounded bg-[#D0D0D9] motion-reduce:animate-none" />
                            <span className="block h-2.5 w-20 animate-pulse rounded bg-[#D0D0D9] motion-reduce:animate-none" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4"><span className="block h-5 w-16 animate-pulse rounded bg-[#D0D0D9] motion-reduce:animate-none" /></td>
                      <td className="px-4 py-4"><span className="block h-6 w-28 animate-pulse rounded-full bg-[#D0D0D9] motion-reduce:animate-none" /></td>
                      <td className="px-4 py-4"><span className="block h-6 w-16 animate-pulse rounded-full bg-[#D0D0D9] motion-reduce:animate-none" /></td>
                      <td className="px-4 py-4"><span className="block h-3.5 w-24 animate-pulse rounded bg-[#D0D0D9] motion-reduce:animate-none" /></td>
                      <td className="px-6 py-4" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : erreurListe ? null : comptes.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="rh-pop mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#1B1BFF]/10 text-[#1B1BFF] ring-8 ring-[#1B1BFF]/5">
                <Icon name="users" className="h-8 w-8" />
              </span>
              <p className="men-serif mt-5 text-3xl text-[#0A0A0A]">
                {rechercheAppliquee ? 'Aucun résultat' : 'Aucun compte'}
              </p>
              <p className="mt-1 text-sm text-[#86868B]">
                {rechercheAppliquee ? 'Essayez un autre nom, IM ou e-mail.' : 'Créez le premier compte utilisateur.'}
              </p>
              {!rechercheAppliquee && (
                <button type="button" onClick={ouvrirCreation} className={`${btnPrimaire} mt-6`}>
                  <Icon name="plus" className="h-4 w-4" /> Créer un compte
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#D0D0D9] bg-[#D0D0D9] text-xs font-semibold text-[#86868B]">
                      <th scope="col" className="px-6 py-3">Personnel</th>
                      <th scope="col" className="px-4 py-3">IM</th>
                      <th scope="col" className="px-4 py-3">Rôle</th>
                      <th scope="col" className="px-4 py-3">État</th>
                      <th scope="col" className="px-4 py-3">Dernière connexion</th>
                      <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D0D0D9] bg-[#C2C2CC]">
                    {comptes.map((compte, index) => {
                      const nom = compte.personnel_nom || compte.username
                      return (
                        <tr
                          key={compte.id}
                          className="rh-in group relative bg-white transition-colors duration-200 hover:bg-[#D0D0D9]"
                          style={delai(Math.min(index, 10) * 40)}
                        >
                          <td className="relative px-6 py-3.5">
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-3 left-0 w-[3px] origin-center scale-y-0 rounded-r-full bg-[#1B1BFF] transition-transform duration-300 group-hover:scale-y-100"
                            />
                            <div className="flex items-center gap-3">
                              <Initiales nom={nom} className="h-10 w-10 text-xs" />
                              <div className="min-w-0">
                                <p className="max-w-52 truncate font-semibold text-[#0A0A0A]">{compte.personnel_nom || '—'}</p>
                                <p className="mt-0.5 max-w-52 truncate text-xs text-[#86868B]">
                                  {[compte.personnel_direction, compte.email].filter(Boolean).join(' · ') || '—'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex rounded-md bg-[#D0D0D9] px-2 py-1 font-mono text-xs font-semibold text-[#0A0A0A]">
                              {compte.personnel_im || compte.username}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TON_ROLE[compte.role] ?? 'bg-[#D0D0D9] text-[#0A0A0A]'}`}>
                              <Icon name={iconeRole(compte.role)} className="h-3.5 w-3.5" />
                              {nomRole(compte)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5"><BadgeStatut actif={compte.is_active} /></td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 text-sm ${compte.last_login ? 'text-[#0A0A0A]' : 'text-[#86868B]'}`}>
                              <Icon name="clock" className="h-3.5 w-3.5 text-[#86868B]" />
                              {dateLisible(compte.last_login)}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => ouvrirEdition(compte)}
                                className={btnIcone}
                                aria-label={`Gérer ${nom}`}
                                title="Modifier"
                              >
                                <Icon name="edit" className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-[#D0D0D9] bg-[#D0D0D9] px-5 py-3">
                <span className="text-xs tabular-nums text-[#86868B]">
                  Page <span className="font-bold text-[#0A0A0A]">{page}</span> sur {nombrePages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || enChargement}
                    onClick={() => setPage((v) => Math.max(1, v - 1))}
                    aria-label="Page précédente"
                    className={`${btnContour} !h-9 !px-2.5`}
                  >
                    <Icon name="left" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= nombrePages || enChargement}
                    onClick={() => setPage((v) => Math.min(nombrePages, v + 1))}
                    aria-label="Page suivante"
                    className={`${btnContour} !h-9 !px-2.5`}
                  >
                    <Icon name="right" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Tiroir : contenu défilable, pied fixe, formulaire visible en entier */}
      <div className="adm-root !mt-0">
        <Tiroir
          ouvert={dialogueOuvert}
          onFermer={fermerDialogue}
          titre={modeFormulaire === 'creation' ? 'Nouveau compte' : 'Modifier le compte'}
          sousTitre={modeFormulaire === 'creation' ? 'Associez un compte à une fiche.' : 'Modifiez les accès.'}
          pied={
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={fermerDialogue} disabled={enregistrement} className={btnContour}>
                Annuler
              </button>
              <button
                type="submit"
                form="formulaire-compte"
                disabled={enregistrement || (modeFormulaire === 'creation' && (chargementPersonnels || personnels.length === 0))}
                className={btnPrimaire}
              >
                {enregistrement && <Icon name="loader" className="h-4 w-4 animate-spin" />}
                {enregistrement ? 'Enregistrement' : modeFormulaire === 'creation' ? 'Créer le compte' : 'Enregistrer'}
              </button>
            </div>
          }
        >
          <form
            id="formulaire-compte"
            onSubmit={soumettreFormulaire}
            className="space-y-4 pb-6"
          >
            {modeFormulaire === 'creation' && (
              <div className="group rounded-2xl border border-transparent bg-[#C2C2CC] p-4 sm:p-5">
                <label htmlFor="personnel-compte" className={etiquette}>Fiche de personnel</label>
                {chargementPersonnels ? (
                  <div aria-busy="true" className="h-11 w-full animate-pulse rounded-xl bg-[#D0D0D9] motion-reduce:animate-none" />
                ) : (
                  <select
                    id="personnel-compte"
                    value={personnelSelectionne}
                    onChange={(e) => setPersonnelSelectionne(e.target.value)}
                    required
                    className={champ}
                  >
                    <option value="">Sélectionner une personne</option>
                    {personnels.map((p) => (
                      <option key={p.id_personnel} value={p.id_personnel}>
                        {p.nom_complet || [p.nom, p.prenoms].filter(Boolean).join(' ')} — IM : {p.im}
                        {p.service_libelle ? ` · ${p.service_libelle}` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {!chargementPersonnels && personnels.length === 0 && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-[#F3E4BF] bg-[#FAFAF8] px-3 py-2 text-xs font-medium text-amber-800">
                    <Icon name="alert" className="h-4 w-4 shrink-0" /> Aucune fiche disponible.
                  </p>
                )}
                <p className="mt-1.5 text-xs text-[#86868B]">L’identifiant est généré à partir de l’IM.</p>

                {ficheSelectionnee && anomaliesFicheSelectionnee.length > 0 && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="rh-pop mt-3 rounded-xl border border-[#F3CBD1] border-l-[3px] border-l-[#E11D48] bg-[#FDF4F5] p-3 text-xs text-[#9F1239]"
                  >
                    <p className="font-bold">Création bloquée : fiche non conforme</p>
                    <ul className="mt-1.5 list-inside list-disc space-y-0.5 font-medium">
                      {anomaliesFicheSelectionnee.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {modeFormulaire === 'edition' && compteCible && (
              <div className="flex items-center gap-3 rounded-2xl border border-transparent bg-[#C2C2CC] p-4">
                <Initiales nom={compteCible.personnel_nom || compteCible.username} className="h-12 w-12 text-sm" />
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[#0A0A0A]">{compteCible.personnel_nom || '—'}</p>
                  <p className="mt-0.5 font-mono text-xs text-[#86868B]">
                    IM : {compteCible.personnel_im || compteCible.username}
                  </p>
                </div>
              </div>
            )}

            <div className="group rounded-2xl border border-transparent bg-[#C2C2CC] p-4 sm:p-5">
              <label htmlFor="email-compte" className={etiquette}>Adresse e-mail</label>
              <div className="relative">
                <Icon
                  name="mail"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B] transition-colors group-focus-within:text-[#1B1BFF]"
                />
                <input
                  id="email-compte"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailModifie(true); setErreurFormulaire(null) }}
                  onBlur={() => setEmailModifie(true)}
                  maxLength={254}
                  required
                  pattern="[A-Za-z0-9._%+-]+@gmail\.com"
                  placeholder="nom@gmail.com"
                  aria-invalid={Boolean(erreurEmail)}
                  className={`${champ} pl-10 ${erreurEmail ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : ''}`}
                />
              </div>
              <p className={`mt-1.5 text-xs ${erreurEmail ? 'font-medium text-rose-600' : 'text-[#86868B]'}`}>
                {erreurEmail || 'Utilisez obligatoirement une adresse @gmail.com.'}
              </p>
            </div>

            <fieldset className="rounded-2xl border border-transparent bg-[#C2C2CC] p-4 sm:p-5">
              <legend className="sr-only">Rôle</legend>
              <p className="mb-3 text-sm font-medium text-[#0A0A0A]">Rôle</p>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                {ROLES.map((option) => {
                  const selectionne = role === option.valeur
                  return (
                    <label
                      key={option.valeur}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200 focus-within:ring-4 focus-within:ring-[#1B1BFF]/20 ${
                        selectionne
                          ? 'border-[#1B1BFF]/25 bg-[#1B1BFF]/[0.06] shadow-[0_0_0_1px_#1B1BFF]'
                          : 'border-[#D0D0D9] bg-[#D0D0D9] hover:border-[#C2C2CC] hover:bg-[#C2C2CC]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role-compte"
                        value={option.valeur}
                        checked={selectionne}
                        onChange={() => setRole(option.valeur)}
                        className="sr-only"
                      />
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${
                          selectionne ? 'bg-[#1B1BFF] text-white' : 'bg-[#D0D0D9] text-[#0A0A0A]'
                        }`}
                      >
                        <Icon name={option.icone} className="h-4 w-4" />
                      </span>
                      <span className={`text-sm font-semibold ${selectionne ? 'text-[#1B1BFF]' : 'text-[#0A0A0A]'}`}>
                        {option.libelle}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="group rounded-2xl border border-transparent bg-[#C2C2CC] p-4 sm:p-5">
              <label htmlFor="mot-de-passe-compte" className={etiquette}>
                {modeFormulaire === 'creation' ? 'Mot de passe initial' : 'Nouveau mot de passe'}
              </label>
              <div className="relative">
                <input
                  id="mot-de-passe-compte"
                  type={motDePasseVisible ? 'text' : 'password'}
                  autoComplete={modeFormulaire === 'creation' ? 'new-password' : 'off'}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required={modeFormulaire === 'creation'}
                  minLength={modeFormulaire === 'creation' ? 8 : undefined}
                  placeholder={modeFormulaire === 'edition' ? 'Laisser vide pour conserver' : undefined}
                  className={`${champ} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setMotDePasseVisible((v) => !v)}
                  aria-label={motDePasseVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className={`${btnIcone} absolute right-1 top-1/2 -translate-y-1/2 !h-9 !w-9`}
                >
                  <Icon name={motDePasseVisible ? 'eyeoff' : 'eye'} className="h-4 w-4" />
                </button>
              </div>
            </div>

            {modeFormulaire === 'edition' && (
              <Interrupteur libelle="Compte actif" coche={actif} onChange={setActif} desactive={enregistrement} />
            )}

            {erreurFormulaire && (
              <Message key={erreurFormulaire} type="erreur">
                <span className="text-sm">{erreurFormulaire}</span>
              </Message>
            )}
          </form>
        </Tiroir>
      </div>
    </CoquilleAdmin>
  )
}

export default AdminComptesPage