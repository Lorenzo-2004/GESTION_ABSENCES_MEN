import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Navigate, Link } from 'react-router'
import { useAuth } from '../../contexts/useAuth'
import { peutAccederEspaceAgent } from '../../lib/roles'
import { delai } from '../../components/men/ui-outils'

const ACCENT = '#1B1BFF'

const STYLES = `
.prof-root{font-family:'Inter Variable','Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}
.prof-root .men-serif{font-family:'Space Grotesk Variable','Space Grotesk','Inter Variable','Inter',sans-serif;font-weight:600;letter-spacing:-.02em}

@keyframes pr-rise{from{opacity:0;transform:translate3d(0,16px,0)}to{opacity:1;transform:none}}
@keyframes pr-row{from{opacity:0;transform:translate3d(-8px,0,0)}to{opacity:1;transform:none}}
@keyframes pr-panel{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}
@keyframes pr-avatar{0%{opacity:0;transform:scale(.7) rotate(-8deg)}100%{opacity:1;transform:none}}
@keyframes pr-frame{0%{opacity:0;transform:translate3d(0,0,0) scale(.9)}100%{opacity:1;transform:translate3d(10px,-10px,0) scale(1)}}
@keyframes pr-breathe{0%,100%{transform:translate3d(10px,-10px,0)}50%{transform:translate3d(13px,-13px,0)}}
@keyframes pr-stat{from{opacity:0;transform:translate3d(0,22px,0) scale(.96);filter:blur(6px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes pr-nav{from{opacity:0;transform:translate3d(0,-12px,0)}to{opacity:1;transform:none}}
@keyframes pr-line{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes pr-banner{from{opacity:0}to{opacity:1}}
@keyframes pr-float-a{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(40px,14px,0) scale(1.08)}}
@keyframes pr-float-b{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-34px,10px,0) scale(1.1)}}

.pr-rise{animation:pr-rise .7s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.pr-row{animation:pr-row .45s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.pr-panel{animation:pr-panel .4s cubic-bezier(.22,1,.36,1) backwards}
.pr-avatar{animation:pr-avatar .9s cubic-bezier(.34,1.56,.64,1) 150ms backwards}
.pr-frame{animation:pr-frame .9s cubic-bezier(.22,1,.36,1) 450ms both,pr-breathe 6s ease-in-out 1.4s infinite}
.pr-stat{animation:pr-stat .8s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.pr-nav{animation:pr-nav .6s cubic-bezier(.22,1,.36,1) var(--d,0ms) backwards}
.pr-line{transform-origin:left center;animation:pr-line .8s cubic-bezier(.22,1,.36,1) 500ms backwards}
.pr-link{position:relative}
.pr-link::after{content:"";position:absolute;left:0;right:0;bottom:-6px;height:2px;border-radius:2px;background:#0A0A0A;transform:scaleX(0);transform-origin:left;transition:transform .3s cubic-bezier(.22,1,.36,1)}
.pr-link:hover::after,.pr-link:focus-visible::after{transform:scaleX(1)}
.pr-banner{animation:pr-banner 1s ease-out backwards}
.pr-float-a{animation:pr-float-a 14s ease-in-out infinite}
.pr-float-b{animation:pr-float-b 18s ease-in-out infinite}

@media (prefers-reduced-motion:reduce){
  .pr-rise,.pr-row,.pr-panel,.pr-avatar,.pr-frame,.pr-stat,.pr-nav,.pr-line,.pr-banner,.pr-float-a,.pr-float-b{animation:none!important}
  .pr-frame{transform:translate3d(10px,-10px,0)}
}
`

function dateLisible(date: string | null | undefined): string {
  if (!date) return ''
  const valeur = new Date(date)
  if (Number.isNaN(valeur.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(valeur)
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

const TEINTES = {
  bleu: 'bg-[#E3E3FF]',
  gris: 'bg-[#EDEDEF]',
  vert: 'bg-[#D6FFEC]',
} as const

/* Carte façon "projet" : fond pastel, panneau blanc, titre + sous-titre dessous */
function Section({
  titre,
  description,
  teinte,
  children,
  retard = 0,
}: {
  titre: string
  description: string
  teinte: keyof typeof TEINTES
  children: ReactNode
  retard?: number
}) {
  return (
    <section className="pr-row group" style={delai(retard)}>
      <div
        className={`flex min-h-[210px] flex-col justify-center rounded-[24px] p-4 transition duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-[0_22px_34px_-24px_rgba(27,27,255,0.45)] sm:p-5 ${TEINTES[teinte]}`}
      >
        <dl className="divide-y divide-[#F5F5F7] rounded-2xl bg-white px-4 py-1 shadow-[0_8px_24px_-14px_rgba(20,20,60,0.25)] transition-transform duration-300 group-hover:scale-[1.02]">
          {children}
        </dl>
      </div>
      <div className="mt-3 px-1">
        <h2 className="text-lg font-medium text-[#0A0A0A]">{titre}</h2>
        <p className="mt-0.5 text-[13px] text-[#86868B]">{description}</p>
      </div>
    </section>
  )
}

function Ligne({
  libelle,
  valeur,
  retard,
}: {
  libelle: string
  valeur: string | number | null | undefined
  retard: number
}) {
  const vide = valeur === null || valeur === undefined || valeur === ''
  return (
    <div className="pr-row flex items-start justify-between gap-4 py-3" style={delai(retard)}>
      <dt className="shrink-0 text-[13px] text-[#86868B]">{libelle}</dt>
      <dd
        className={`min-w-0 break-words text-right text-sm ${
          vide ? 'italic text-[#86868B]' : 'font-semibold text-[#0A0A0A]'
        }`}
      >
        {vide ? 'Non renseigné' : String(valeur)}
      </dd>
    </div>
  )
}

function Stat({ libelle, valeur, retard }: { libelle: string; valeur: string; retard: number }) {
  return (
    <div className="pr-stat min-w-0" style={delai(retard)}>
      <p className="text-[13px] font-medium text-[#0A0A0A]/60">{libelle}</p>
      <p className="men-serif mt-1.5 line-clamp-2 max-w-[170px] break-words text-lg leading-[1.15] text-[#0A0A0A] sm:text-xl" title={valeur}>
        {valeur}
      </p>
    </div>
  )
}

type Onglet = 'infos' | 'pro'

const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: 'infos', libelle: 'Informations' },
  { id: 'pro', libelle: 'Parcours professionnel' },
]

const LIENS = [
  { to: '/app/agent/soldes', libelle: 'Mes soldes' },
  { to: '/app/agent/mes-demandes', libelle: 'Mes demandes' },
  { to: '/app/agent/nouvelle-demande', libelle: 'Nouvelle demande' },
  { to: '/app/agent/historique', libelle: 'Historique' },
]

export function ProfilAgentPage() {
  const { utilisateur, chargement } = useAuth()
  const [ongletActif, setOngletActif] = useState<Onglet>('infos')
  const refsOnglets = useRef<Record<Onglet, HTMLButtonElement | null>>({ infos: null, pro: null })

  if (chargement) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8]">
        <style>{STYLES}</style>
        <div className="pr-rise flex flex-col items-center gap-4" role="status" aria-live="polite">
          <span
            className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#1B1BFF]/15 border-t-[#1B1BFF]"
          />
          <p className="text-sm text-[#86868B]">Chargement de votre profil…</p>
        </div>
      </div>
    )
  }

  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (!peutAccederEspaceAgent(utilisateur.role)) return <Navigate to="/app" replace />

  const personnel = utilisateur.personnel

  if (!personnel) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAFAF8] p-6">
        <style>{STYLES}</style>
        <section className="pr-rise max-w-md rounded-[28px] bg-[#F0F0FF] p-8 text-center">
          <h1 className="men-serif text-2xl text-[#0A0A0A]">Profil indisponible</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#555]">
            Aucun dossier du personnel n’est associé à ce compte. Contactez le service des ressources humaines pour
            vérifier votre rattachement.
          </p>
        </section>
      </div>
    )
  }

  const nomComplet = personnel.nom_complet || `${personnel.prenoms} ${personnel.nom}`.trim()
  const corpsGrade = personnel.corps || personnel.grade || '—'

  const surTouche = (e: KeyboardEvent<HTMLButtonElement>) => {
    const ordre = ONGLETS.map((o) => o.id)
    const i = ordre.indexOf(ongletActif)
    let cible: Onglet | null = null
    if (e.key === 'ArrowRight') cible = ordre[(i + 1) % ordre.length]
    if (e.key === 'ArrowLeft') cible = ordre[(i - 1 + ordre.length) % ordre.length]
    if (e.key === 'Home') cible = ordre[0]
    if (e.key === 'End') cible = ordre[ordre.length - 1]
    if (cible) {
      e.preventDefault()
      setOngletActif(cible)
      refsOnglets.current[cible]?.focus()
    }
  }

  const indexActif = ONGLETS.findIndex((o) => o.id === ongletActif)

  return (
    <div className="prof-root min-h-screen bg-[#FAFAF8] px-3 py-6 text-[#0A0A0A] sm:px-6 sm:py-10">
      <style>{STYLES}</style>

      {/* ---- CONTENEUR DE LA PAGE ---- */}
      <div className="pr-rise relative mx-auto max-w-4xl overflow-hidden rounded-[28px] border border-[#E5E5EA] bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04),0_24px_50px_-28px_rgba(27,27,255,0.25)]">

      {/* ---- HAUT DE PAGE : tout le contenu est à l'intérieur du dégradé ---- */}
      <div className="relative">
        <div aria-hidden="true" className="pr-banner pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br from-[#E4E4FF] via-[#F0F0FF] to-[#F7F7FF]">
          <div className="pr-float-a absolute -left-16 top-[25%] h-[75%] w-[60%] rounded-[100%] bg-[#1B1BFF]/30 blur-3xl" />
          <div className="pr-float-b absolute -top-[10%] right-[2%] h-[70%] w-[45%] rounded-[100%] bg-[#00FF9C]/25 blur-3xl" />
        </div>

      <div className="relative px-5 pb-8 sm:px-8">
        {/* ---- LIENS EN HAUT ---- */}
        <nav
          aria-label="Navigation agent"
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 py-5"
        >
          {LIENS.map((l, i) => (
            <Link
              key={l.to}
              to={l.to}
              style={delai(60 + i * 70)}
              className="pr-nav pr-link rounded-md text-sm font-medium text-[#0A0A0A]/70 transition-colors duration-200 hover:text-[#0A0A0A] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/30"
            >
              {l.libelle}
            </Link>
          ))}
        </nav>

        {/* ---- EN-TÊTE PROFIL ---- */}
        <header className="mt-6 flex flex-col items-center gap-6 md:mt-8 md:flex-row md:items-end md:gap-8">
          <div className="pr-avatar relative shrink-0">
            <span
              aria-hidden="true"
              className="pr-frame absolute inset-0 rounded-[60px] bg-[#1B1BFF]/15 ring-1 ring-white/70 backdrop-blur-sm"
            />
            <span className="men-serif relative grid h-[170px] w-[170px] place-items-center rounded-[60px] bg-gradient-to-br from-[#3B3BFF] via-[#1B1BFF] to-[#1B1BFF] text-5xl text-white shadow-[0_24px_44px_-20px_rgba(27,27,255,0.55)] sm:h-[200px] sm:w-[200px] sm:text-6xl">
              {initiales(nomComplet || utilisateur.username)}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-6 pb-1 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 text-center md:text-left">
              <div className="pr-rise flex flex-wrap items-center justify-center gap-3 md:justify-start" style={delai(200)}>
                <h1 className="men-serif text-2xl leading-tight sm:text-[2rem]">{nomComplet}</h1>
                <span
                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  {utilisateur.role_libelle || 'Agent'}
                </span>
              </div>
              <p className="pr-rise mt-2 text-[15px] leading-snug text-[#0A0A0A]/75" style={delai(260)}>
                {corpsGrade}
                <br />
                Immatricule&nbsp;: {personnel.im}
              </p>
              {personnel.statut && (
                <span
                  className="pr-rise mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-[#0A0A0A] bg-white/60 px-4 text-[13px] font-medium"
                  style={delai(320)}
                >
                  <span className="h-2 w-2 rounded-full bg-[#00FF9C] ring-2 ring-[#0A0A0A]/10" />
                  {personnel.statut}
                </span>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-6 md:gap-8">
              <Stat libelle="Direction" valeur={personnel.direction_libelle || 'Non renseignée'} retard={300} />
              <Stat libelle="Service" valeur={personnel.service_libelle || 'Non renseigné'} retard={370} />
              <Stat libelle="Corps / Grade" valeur={corpsGrade} retard={440} />
            </div>
          </div>
        </header>
      </div>
      </div>

      <div className="relative px-5 pb-2 sm:px-8">

        {/* ---- ONGLETS ---- */}
        <div className="pr-rise relative mt-9" style={delai(480)}>
          <span aria-hidden="true" className="pr-line absolute inset-x-0 bottom-0 h-px bg-[#E5E5EA]" />
          <div role="tablist" aria-label="Sections du profil" className="relative inline-flex">
            {ONGLETS.map((o) => {
              const actif = o.id === ongletActif
              return (
                <button
                  key={o.id}
                  ref={(el) => {
                    refsOnglets.current[o.id] = el
                  }}
                  id={`onglet-${o.id}`}
                  role="tab"
                  type="button"
                  aria-selected={actif}
                  aria-controls={`panneau-${o.id}`}
                  tabIndex={actif ? 0 : -1}
                  onClick={() => setOngletActif(o.id)}
                  onKeyDown={surTouche}
                  className={`relative px-4 py-3 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 ${
                    actif ? 'font-semibold text-[#0A0A0A]' : 'font-medium text-[#555] hover:text-[#0A0A0A]'
                  }`}
                >
                  {o.libelle}
                </button>
              )
            })}
            <span
              aria-hidden="true"
              className="absolute -bottom-px left-0 h-[2px] bg-[#0A0A0A] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
              style={{
                width: `${100 / ONGLETS.length}%`,
                transform: `translateX(${indexActif * 100}%)`,
              }}
            />
          </div>
        </div>

        {/* ---- INFOS PERSONNELLES EN BAS ---- */}
        <div className="mt-6 pb-12">
          {ongletActif === 'infos' && (
            <div
              key="infos"
              id="panneau-infos"
              role="tabpanel"
              aria-labelledby="onglet-infos"
              className="pr-panel grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3"
            >
              <Section titre="Informations personnelles" description="État civil de l’agent" teinte="bleu">
                <Ligne libelle="Nom" valeur={personnel.nom} retard={40} />
                <Ligne libelle="Prénoms" valeur={personnel.prenoms} retard={90} />
                <Ligne libelle="Matricule (IM)" valeur={personnel.im} retard={140} />
                <Ligne libelle="CIN" valeur={personnel.cin} retard={190} />
                <Ligne libelle="Sexe" valeur={personnel.sexe} retard={240} />
                <Ligne libelle="Date de naissance" valeur={dateLisible(personnel.date_naissance)} retard={290} />
              </Section>

              <Section titre="Coordonnées" description="Téléphone et e-mail" teinte="gris" retard={80}>
                <Ligne libelle="Téléphone" valeur={personnel.telephone} retard={120} />
                <Ligne libelle="E-mail" valeur={personnel.email || utilisateur.email} retard={170} />
              </Section>

              <Section titre="Compte" description="Accès à la plateforme" teinte="vert" retard={160}>
                <Ligne libelle="Identifiant" valeur={utilisateur.username} retard={200} />
                <Ligne libelle="Dernière connexion" valeur={dateLisible(utilisateur.last_login)} retard={250} />
              </Section>
            </div>
          )}

          {ongletActif === 'pro' && (
            <div
              key="pro"
              id="panneau-pro"
              role="tabpanel"
              aria-labelledby="onglet-pro"
              className="pr-panel grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3"
            >
              <Section titre="Affectation" description="Direction et service" teinte="bleu">
                <Ligne libelle="Direction" valeur={personnel.direction_libelle} retard={40} />
                <Ligne libelle="Service" valeur={personnel.service_libelle} retard={90} />
              </Section>

              <Section titre="Carrière" description="Corps et grade" teinte="gris" retard={80}>
                <Ligne libelle="Corps" valeur={personnel.corps} retard={120} />
                <Ligne libelle="Grade" valeur={personnel.grade} retard={170} />
              </Section>

              <Section titre="Situation" description="Statut et matricule" teinte="vert" retard={160}>
                <Ligne libelle="Statut" valeur={personnel.statut} retard={200} />
                <Ligne libelle="Matricule (IM)" valeur={personnel.im} retard={250} />
              </Section>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

export default ProfilAgentPage