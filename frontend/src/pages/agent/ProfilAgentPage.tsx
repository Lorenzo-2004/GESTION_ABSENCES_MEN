import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Navigate, Link } from 'react-router'
import { useAuth } from '../../contexts/useAuth'
import { peutAccederEspaceAgent } from '../../lib/roles'

type Onglet = 'personnel' | 'professionnel'
const ONGLETS: { id: Onglet; titre: string }[] = [
  { id: 'personnel', titre: 'Informations personnelles' },
  { id: 'professionnel', titre: 'Situation professionnelle' },
]

function dateLisible(date?: string | null): string {
  if (!date) return '—'
  const valeur = new Date(date)
  if (Number.isNaN(valeur.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(valeur)
}

function initiales(texte: string): string {
  return texte.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((mot) => mot.charAt(0).toUpperCase()).join('') || '—'
}

function Champ({ titre, valeur, children }: { titre: string; valeur?: string | number | null; children?: ReactNode }) {
  const affichage = children ?? (valeur === undefined || valeur === null || valeur === '' ? '—' : valeur)
  return (
    <div className="min-w-0 border-b border-slate-100 py-3.5 last:border-b-0">
      <dt className="mb-1 text-xs font-medium text-slate-500">{titre}</dt>
      <dd className="break-words text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{affichage}</dd>
    </div>
  )
}

function Panneau({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_6px_24px_-18px_rgba(15,23,42,0.25)] sm:p-6">
      <h2 className="mb-3 text-base font-semibold tracking-tight text-slate-900">{titre}</h2>
      <dl>{children}</dl>
    </section>
  )
}

export function ProfilAgentPage() {
  const { utilisateur, chargement } = useAuth()
  const [onglet, setOnglet] = useState<Onglet>('personnel')
  const boutons = useRef<Record<Onglet, HTMLButtonElement | null>>({ personnel: null, professionnel: null })

  if (chargement) {
    return <div className="grid min-h-[45vh] place-items-center text-sm text-slate-500" role="status">Chargement du profil…</div>
  }
  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (!peutAccederEspaceAgent(utilisateur.role)) return <Navigate to="/app" replace />

  const personnel = utilisateur.personnel
  if (!personnel) {
    return (
      <section className="mx-auto mt-12 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Profil indisponible</h1>
        <p className="mt-2 text-sm text-slate-600">Aucune fiche agent associée. Contactez les RH.</p>
      </section>
    )
  }

  const nom = personnel.nom_complet || `${personnel.prenoms || ''} ${personnel.nom || ''}`.trim()
  const touchesOnglets = (event: KeyboardEvent<HTMLButtonElement>) => {
    const ids = ONGLETS.map(({ id }) => id)
    const position = ids.indexOf(onglet)
    let cible: Onglet | undefined
    if (event.key === 'ArrowRight') cible = ids[(position + 1) % ids.length]
    if (event.key === 'ArrowLeft') cible = ids[(position + ids.length - 1) % ids.length]
    if (event.key === 'Home') cible = ids[0]
    if (event.key === 'End') cible = ids[ids.length - 1]
    if (cible) {
      event.preventDefault()
      setOnglet(cible)
      boutons.current[cible]?.focus()
    }
  }

  return (
    <main className="min-h-full bg-[#F8FAFC] px-3 pb-10 pt-5 text-slate-900 sm:px-6 sm:pt-7">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Mon espace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Mon profil</h1>
          </div>
          <Link to="/app/agent/nouvelle-demande" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#1B1BFF] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#1414CB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1BFF] sm:text-sm">
            Nouvelle demande
          </Link>
        </div>

        <section className="relative overflow-hidden rounded-[24px] bg-[#142B56] p-5 text-white shadow-[0_14px_38px_-24px_rgba(15,23,42,0.65)] sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border-[45px] border-white/[0.045]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
            <div aria-label="Avatar avec initiales" className="grid h-20 w-20 shrink-0 place-items-center rounded-[22px] border border-white/20 bg-white/15 text-2xl font-semibold tracking-tight text-white sm:h-24 sm:w-24 sm:text-3xl">
              {initiales(nom || utilisateur.username)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{nom || utilisateur.username}</h2>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium ring-1 ring-white/15">{utilisateur.role_libelle || 'Agent'}</span>
              </div>
              <p className="mt-1 text-sm text-white/75">{personnel.grade || personnel.corps || 'Personnel MEN'}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/80 sm:text-sm">
                <span><span className="text-white/55">IM</span> <strong className="ml-1 font-semibold text-white">{personnel.im || '—'}</strong></span>
                <span className="min-w-0 break-words"><span className="text-white/55">Service</span> <strong className="ml-1 font-semibold text-white">{personnel.service_libelle || '—'}</strong></span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Aperçu du profil">
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">Direction</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-900">{personnel.direction_libelle || '—'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">Statut</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-900">{personnel.statut || '—'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">Corps</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-900">{personnel.corps || '—'}</p>
          </div>
        </section>

        <div>
          <div role="tablist" aria-label="Détails du profil" className="flex gap-1 overflow-x-auto border-b border-slate-200">
            {ONGLETS.map(({ id, titre }) => (
              <button
                key={id}
                ref={(element) => { boutons.current[id] = element }}
                id={`profil-onglet-${id}`}
                type="button"
                role="tab"
                aria-selected={onglet === id}
                aria-controls={`profil-panneau-${id}`}
                tabIndex={onglet === id ? 0 : -1}
                onClick={() => setOnglet(id)}
                onKeyDown={touchesOnglets}
                className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-600 ${onglet === id ? 'border-[#1B1BFF] text-[#1B1BFF]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >{titre}</button>
            ))}
          </div>
          {onglet === 'personnel' ? (
            <div key="personnel" id="profil-panneau-personnel" role="tabpanel" aria-labelledby="profil-onglet-personnel" className="mt-5 grid items-start gap-4 md:grid-cols-2">
              <Panneau titre="Identité">
                <Champ titre="Nom" valeur={personnel.nom} />
                <Champ titre="Prénoms" valeur={personnel.prenoms} />
                <Champ titre="CIN" valeur={personnel.cin} />
                <Champ titre="Sexe" valeur={personnel.sexe} />
                <Champ titre="Naissance" valeur={dateLisible(personnel.date_naissance)} />
              </Panneau>
              <div className="grid gap-4">
                <Panneau titre="Contact">
                  <Champ titre="Téléphone" valeur={personnel.telephone} />
                  <Champ titre="E-mail" valeur={personnel.email || utilisateur.email} />
                </Panneau>
                <Panneau titre="Compte">
                  <Champ titre="Identifiant" valeur={utilisateur.username} />
                  <Champ titre="Dernière connexion" valeur={dateLisible(utilisateur.last_login)} />
                </Panneau>
              </div>
            </div>
          ) : (
            <div key="professionnel" id="profil-panneau-professionnel" role="tabpanel" aria-labelledby="profil-onglet-professionnel" className="mt-5 grid items-start gap-4 md:grid-cols-2">
              <Panneau titre="Affectation">
                <Champ titre="Direction" valeur={personnel.direction_libelle} />
                <Champ titre="Service" valeur={personnel.service_libelle} />
                <Champ titre="IM" valeur={personnel.im} />
              </Panneau>
              <Panneau titre="Carrière">
                <Champ titre="Corps" valeur={personnel.corps} />
                <Champ titre="Grade" valeur={personnel.grade} />
                <Champ titre="Statut" valeur={personnel.statut} />
              </Panneau>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

export default ProfilAgentPage
