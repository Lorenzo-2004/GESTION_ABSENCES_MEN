import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'

import { useAuth } from '../../contexts/useAuth'
import { peutAccederEspaceAgent } from '../../lib/roles'
import {
  listerMesDemandes,
  recupererFormulaireOfficiel,
  verifierIntegriteFormulaire,
  type VerificationIntegriteDocument,
  typePossedeFicheOfficielle,
  type DemandeConge,
  type StatutDemande,
} from '../../services/congesService'
import { Icon, Message, type IconName } from '../../components/men/ui'
import { delai } from '../../components/men/ui-outils'
import {
  CoquilleAgent,
  Tiroir,
  type VueAgent,
} from '../../components/men/miseEnPageRH'
import { messageErreurUtilisateur } from '../../lib/messages'

const STATUTS: { valeur: StatutDemande; libelle: string }[] = [
  { valeur: 'EN_ATTENTE', libelle: 'En attente' },
  { valeur: 'APPROUVE_CS', libelle: 'Approuvée par le chef' },
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

const TITRES_VUES: Record<VueAgent, { titre: string; description: string }> = {
  apercu: { titre: "Vue d'ensemble", description: 'Suivi global des demandes et soldes' },
  demandes: { titre: 'Mes demandes', description: 'Consultez vos demandes et leur état' },
  'nouvelle-demande': { titre: 'Nouvelle demande', description: 'Déposez une demande ou une annonce d’absence' },
  soldes: { titre: 'Mes soldes', description: 'Droits à congé de l’année en cours' },
  historique: { titre: 'Historique', description: 'Détail des validations' },
  profil: { titre: 'Mon profil', description: 'Informations du personnel' },
}

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function erreurAPI(erreur: unknown): string {
  return messageErreurUtilisateur(erreur, 'Impossible de charger cette information. Réessayez dans quelques instants.')
}

function dateCourte(date: string | null | undefined): string {
  if (!date) return '—'
  const valeur = new Date(`${date.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(valeur.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(valeur)
}

function classeStatut(statut: StatutDemande): string {
  switch (statut) {
    case 'EN_ATTENTE': return 'bg-amber-500/10 text-amber-700'
    case 'APPROUVE_CS': return 'bg-[#1B1BFF]/10 text-[#1B1BFF]'
    case 'VALIDE_DIR': return 'bg-[#00FF9C]/10 text-[#0A0A0A]'
    case 'REJETE': return 'bg-rose-500/10 text-rose-700'
    case 'ARCHIVEE': return 'bg-slate-500/10 text-[#86868B]'
    default: return 'bg-slate-500/10 text-[#86868B]'
  }
}

function iconeStatut(statut: StatutDemande): IconName {
  switch (statut) {
    case 'VALIDE_DIR': return 'check'
    case 'REJETE': return 'alert'
    case 'ARCHIVEE': return 'file'
    default: return 'clock'
  }
}

function statutLisible(demande: DemandeConge): string {
  if (demande.statut_libelle) return demande.statut_libelle
  return STATUTS.find((statut) => statut.valeur === demande.statut_demande)?.libelle ?? demande.statut_demande
}

/* ------------------------------------------------------------------ */
/*  Composants locaux                                                  */
/* ------------------------------------------------------------------ */

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

export function MesDemandesPage() {
  const { utilisateur, chargement } = useAuth()
  const [vue, setVue] = useState<VueAgent>('demandes')

  const [demandes, setDemandes] = useState<DemandeConge[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [nombrePages, setNombrePages] = useState(1)
  const [chargementDemandes, setChargementDemandes] = useState(true)
  const [erreur, setErreur] = useState('')

  const [rechercheSaisie, setRechercheSaisie] = useState('')
  const [rechercheActive, setRechercheActive] = useState('')
  const [statut, setStatut] = useState<StatutDemande | ''>('')

  const [tiroirOuvert, setTiroirOuvert] = useState(false)
  const [statutExplication, setStatutExplication] = useState<StatutDemande | null>(null)

  const [demandeApercuPDF, setDemandeApercuPDF] = useState<DemandeConge | null>(null)
  const [urlPDF, setUrlPDF] = useState<string | null>(null)
  const [chargementPDF, setChargementPDF] = useState(false)
  const [erreurPDF, setErreurPDF] = useState('')
  const [integritePDF, setIntegritePDF] = useState<VerificationIntegriteDocument | null>(null)
  const iframePDF = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!urlPDF) return
    return () => URL.revokeObjectURL(urlPDF)
  }, [urlPDF])

  const chargerDemandes = useCallback(async () => {
    const personnelId = utilisateur?.personnel?.id_personnel
    if (!personnelId) {
      setDemandes([])
      setTotal(0)
      setNombrePages(1)
      setErreur('Aucune fiche du personnel n’est associée à ce compte.')
      setChargementDemandes(false)
      return
    }
    try {
      const reponse = await listerMesDemandes({ personnelId, page, recherche: rechercheActive, statut })
      setDemandes(reponse.resultats)
      setTotal(reponse.total)
      setNombrePages(reponse.nombre_pages)
      setPage(reponse.page_courante)
      setErreur('')
    } catch (cause) {
      setDemandes([])
      setTotal(0)
      setNombrePages(1)
      setErreur(erreurAPI(cause))
    } finally {
      setChargementDemandes(false)
    }
  }, [page, rechercheActive, statut, utilisateur?.personnel?.id_personnel])

  useEffect(() => {
    void chargerDemandes()
  }, [chargerDemandes])

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
    setChargementDemandes(true)
    setPage(1)
    setRechercheActive(rechercheSaisie.trim())
  }

  function changerStatut(valeur: string) {
    setChargementDemandes(true)
    setPage(1)
    setStatut(valeur as StatutDemande | '')
  }

  function changerPage(nouvellePage: number) {
    if (nouvellePage < 1 || nouvellePage > nombrePages || nouvellePage === page) return
    setChargementDemandes(true)
    setPage(nouvellePage)
  }

  function expliquerStatut(valeur: StatutDemande) {
    setStatutExplication(valeur)
    setTiroirOuvert(true)
  }

  async function ouvrirApercuPDF(demande: DemandeConge) {
    if (!typePossedeFicheOfficielle(demande.type_absence)) {
      setErreur('La fiche officielle est disponible uniquement pour le congé annuel, la permission et l’autorisation d’absence.')
      return
    }
    setDemandeApercuPDF(demande)
    setErreurPDF('')
    setUrlPDF(null)
    setIntegritePDF(null)
    setChargementPDF(true)
    try {
      const fichierPDF = await recupererFormulaireOfficiel(demande.id_demande)
      const verification = await verifierIntegriteFormulaire(demande.id_demande)
      if (
        verification.integrite_globale !== true ||
        verification.document_integrite !== true ||
        verification.journal_integrite !== true ||
        verification.signature_integrite === false
      ) {
        throw new Error('La vérification du document n’a pas abouti. Contactez le service gestionnaire avant de l’utiliser.')
      }
      const fichierValide = new Blob([fichierPDF], { type: 'application/pdf' })
      setUrlPDF(URL.createObjectURL(fichierValide))
      setIntegritePDF(verification)
    } catch (cause) {
      setErreurPDF(erreurAPI(cause))
    } finally {
      setChargementPDF(false)
    }
  }

  function fermerApercuPDF() {
    setDemandeApercuPDF(null)
    setErreurPDF('')
    setUrlPDF(null)
    setIntegritePDF(null)
  }

  const messages = (
    <>
      {erreur && <Message key={erreur} type="erreur" onClose={() => setErreur('')}><span className="text-sm">{erreur}</span></Message>}
    </>
  )


  return (
    <CoquilleAgent
      vue={vue}
      onVue={setVue}
      titre={TITRES_VUES[vue].titre}
      description={TITRES_VUES[vue].description}
      actions={
        <button type="button" onClick={() => void chargerDemandes()} disabled={chargementDemandes} className={`${btnContour} !px-3`} aria-label="Actualiser">
          <Icon name="refresh" className={`h-4 w-4 ${chargementDemandes ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <style>{STYLES}</style>
      
      <div className="adm-root min-w-0 space-y-6">
        {!tiroirOuvert && messages}

        {/* ---- PANNEAU RECHERCHE (sans barre d'accent) ---- */}
        <Panneau titre="Rechercher" sousTitre="Filtrer les demandes" icone="search" accent="#1B1BFF" retard={400}>
          <form onSubmit={rechercher} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
            <div className="group">
              <label htmlFor="recherche-demande" className={etiquette}>Rechercher</label>
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]" />
                <input id="recherche-demande" type="search" value={rechercheSaisie} onChange={(event) => setRechercheSaisie(event.target.value)} placeholder="Numéro de demande…" className={`${champ} pl-10`} />
              </div>
            </div>
            <div className="group">
              <label htmlFor="statut-demande" className={etiquette}>État</label>
              <select id="statut-demande" value={statut} onChange={(event) => changerStatut(event.target.value)} className={champ}>
                <option value="">Tous les états</option>
                {STATUTS.map((option) => (
                  <option key={option.valeur} value={option.valeur}>{option.libelle}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={chargementDemandes} className={`${btnPrimaire} w-full sm:col-span-2 lg:col-span-1 lg:w-auto`}>
              <Icon name="search" className="h-4 w-4" /> Rechercher
            </button>
          </form>
        </Panneau>

        {/* ---- TABLEAU DES DEMANDES ---- */}
        <section className={`rh-in min-w-0 overflow-hidden ${carte}`} style={delai(460)}>
          <div className="border-b border-[#E5E5EA] bg-[#F0F0FF] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-semibold text-[#0A0A0A]">Historique des demandes</p>
              {!chargementDemandes && (
                <p className="text-xs font-medium text-[#86868B]">{demandes.length} résultat{demandes.length > 1 ? 's' : ''} sur {total}</p>
              )}
            </div>
          </div>

          {chargementDemandes ? (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="rounded-xl border border-[#E5E5EA] p-3">
                    <span className="block h-3 w-2/3 animate-pulse rounded bg-[#F5F5F7]" />
                    <span className="mt-2 block h-2 w-1/2 animate-pulse rounded bg-[#F5F5F7]" />
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto p-3 md:block">
                <table className="w-full min-w-[740px] border-collapse">
                  <tbody className="divide-y divide-[#F5F5F7]">
                    {Array.from({ length: 4 }, (_, index) => (
                      <tr key={index} aria-hidden="true">
                        <td className="px-4 py-4"><span className="block h-3 w-32 animate-pulse rounded bg-[#F5F5F7]" /><span className="mt-2 block h-2 w-20 animate-pulse rounded bg-[#F5F5F7]" /></td>
                        <td className="px-3 py-4"><span className="block h-3 w-40 animate-pulse rounded bg-[#F5F5F7]" /></td>
                        <td className="px-3 py-4"><span className="block h-3 w-32 animate-pulse rounded bg-[#F5F5F7]" /></td>
                        <td className="px-3 py-4"><span className="block h-3 w-16 animate-pulse rounded bg-[#F5F5F7]" /></td>
                        <td className="px-3 py-4"><span className="block h-3 w-24 animate-pulse rounded bg-[#F5F5F7]" /></td>
                        <td className="px-4 py-4"><span className="block h-6 w-20 animate-pulse rounded-full bg-[#F5F5F7]" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : demandes.length === 0 ? (
            <div className="px-4 py-20 text-center">
              <span className="rh-pop mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#1B1BFF]/10 text-[#1B1BFF] ring-8 ring-[#1B1BFF]/5">
                <Icon name="file" className="h-8 w-8" />
              </span>
              <p className="men-serif mt-5 text-2xl text-[#0A0A0A]">Aucune demande</p>
              <p className="mt-1 text-sm text-[#86868B]">Aucune demande ne correspond à ces critères.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#F5F5F7] md:hidden">
                {demandes.map((demande) => (
                  <article key={demande.id_demande} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-[#0A0A0A]">{demande.numero_enregistrement || `Demande #${demande.id_demande}`}</p>
                        <p className="mt-1 break-words text-xs text-[#86868B]">{demande.type_absence_libelle || demande.type_absence}</p>
                      </div>
                      <button type="button" onClick={() => expliquerStatut(demande.statut_demande)} className={`inline-flex max-w-[48%] shrink-0 items-center gap-1 rounded-full px-2 py-1 text-left text-xs font-semibold leading-tight ${classeStatut(demande.statut_demande)}`}>
                        <Icon name={iconeStatut(demande.statut_demande)} className="h-3 w-3 shrink-0" />
                        <span>{statutLisible(demande)}</span>
                      </button>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div><dt className="text-[#86868B]">Début</dt><dd className="mt-0.5 font-medium text-[#0A0A0A]">{dateCourte(demande.date_debut)}</dd></div>
                      <div><dt className="text-[#86868B]">Fin</dt><dd className="mt-0.5 font-medium text-[#0A0A0A]">{dateCourte(demande.date_fin)}</dd></div>
                      <div><dt className="text-[#86868B]">Durée</dt><dd className="mt-0.5 font-medium text-[#0A0A0A]">{demande.nombre_jours} j</dd></div>
                      <div><dt className="text-[#86868B]">Dépôt</dt><dd className="mt-0.5 font-medium text-[#0A0A0A]">{dateCourte(demande.date_creation)}</dd></div>
                    </dl>
                    {typePossedeFicheOfficielle(demande.type_absence) && (
                      <button type="button" onClick={() => void ouvrirApercuPDF(demande)} disabled={chargementPDF} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1B1BFF]/10 px-3 text-xs font-semibold text-[#1B1BFF] transition hover:bg-[#1B1BFF]/20 disabled:opacity-50">
                        <Icon name="file" className="h-3.5 w-3.5" /> Aperçu PDF
                      </button>
                    )}
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[740px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-y border-[#E5E5EA] bg-[#F0F0FF] text-xs font-semibold text-[#86868B]">
                      <th scope="col" className="px-4 py-3">Référence</th>
                      <th scope="col" className="px-3 py-3">Type</th>
                      <th scope="col" className="px-3 py-3">Période</th>
                      <th scope="col" className="px-3 py-3">Durée</th>
                      <th scope="col" className="px-3 py-3">Dépôt</th>
                      <th scope="col" className="px-4 py-3">État</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F7]">
                    {demandes.map((demande, index) => (
                      <tr key={demande.id_demande} className="rh-in group relative transition-colors hover:bg-[#F0F0FF]" style={delai(Math.min(index, 10) * 40)}>
                        <td className="relative px-4 py-3">
                          <span className="absolute inset-y-2 left-0 w-[3px] scale-y-0 rounded-r-full bg-[#1B1BFF] transition-transform duration-300 group-hover:scale-y-100" />
                          <p className="font-semibold text-[#0A0A0A]">{demande.numero_enregistrement || `Demande #${demande.id_demande}`}</p>
                          <p className="mt-0.5 text-xs text-[#86868B]">Déposée le {dateCourte(demande.date_creation)}</p>
                          {typePossedeFicheOfficielle(demande.type_absence) && (
                            <button type="button" onClick={() => void ouvrirApercuPDF(demande)} disabled={chargementPDF} className="mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-md bg-[#1B1BFF]/10 px-2 text-xs font-semibold text-[#1B1BFF] transition hover:bg-[#1B1BFF]/20 disabled:opacity-50">
                              <Icon name="file" className="h-3 w-3" /> Aperçu PDF
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[#0A0A0A]">{demande.type_absence_libelle || demande.type_absence}</td>
                        <td className="px-3 py-3 text-[#0A0A0A]">
                          <p>{dateCourte(demande.date_debut)}</p>
                          <p className="mt-0.5 text-xs text-[#86868B]">au {dateCourte(demande.date_fin)}</p>
                        </td>
                        <td className="px-3 py-3 font-semibold tabular-nums text-[#0A0A0A]">{demande.nombre_jours} j</td>
                        <td className="px-3 py-3 text-[#0A0A0A]">{dateCourte(demande.date_creation)}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => expliquerStatut(demande.statut_demande)} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition hover:opacity-80 ${classeStatut(demande.statut_demande)}`}>
                            <span className={`h-2 w-2 rounded-full ${demande.statut_demande === 'VALIDE_DIR' ? 'bg-[#00FF9C]' : demande.statut_demande === 'REJETE' ? 'bg-rose-500' : demande.statut_demande === 'APPROUVE_CS' ? 'bg-[#1B1BFF]' : demande.statut_demande === 'ARCHIVEE' ? 'bg-slate-400' : 'rh-pulse bg-amber-500'}`} />
                            {statutLisible(demande)}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className="flex flex-col gap-3 border-t border-[#E5E5EA] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-xs font-medium text-[#86868B]">
                  Page <span className="font-semibold text-[#0A0A0A]">{page}</span> / {nombrePages} · {total} demande{total !== 1 ? 's' : ''}
                </p>
                <div className="flex w-full justify-end gap-2 sm:w-auto">
                  <button type="button" disabled={page <= 1 || chargementDemandes} onClick={() => changerPage(page - 1)} className={`${btnContour} !h-9 !px-3`}>
                    <Icon name="left" className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={page >= nombrePages || chargementDemandes} onClick={() => changerPage(page + 1)} className={`${btnContour} !h-9 !px-3`}>
                    <Icon name="right" className="h-4 w-4" />
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      <Tiroir ouvert={tiroirOuvert} onFermer={() => setTiroirOuvert(false)} titre="Signification de l’état" sousTitre="Comprendre où en est votre demande">
        {statutExplication && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${classeStatut(statutExplication)}`}>
                <Icon name={iconeStatut(statutExplication)} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#0A0A0A]">
                  {STATUTS.find((s) => s.valeur === statutExplication)?.libelle ?? statutExplication}
                </p>
                <p className="mt-1 text-xs text-[#86868B]">Cet état reflète la position de votre demande dans le circuit de validation.</p>
              </div>
            </div>
            <ul className="space-y-3 text-xs text-[#86868B]">
              <li className="flex items-start gap-3 rounded-xl border border-[#E5E5EA] bg-white p-3.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#1B1BFF]/10 text-[#1B1BFF]">
                  <Icon name="info" className="h-4 w-4" />
                </span>
                Suivez l’évolution depuis la liste. Lorsqu’une validation est ajoutée, le statut est mis à jour automatiquement.
              </li>
              <li className="flex items-start gap-3 rounded-xl border border-[#E5E5EA] bg-white p-3.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-700">
                  <Icon name="clock" className="h-4 w-4" />
                </span>
                En cas d’attente prolongée, rapprochez-vous du chef de service.
              </li>
            </ul>
            <button type="button" onClick={() => setTiroirOuvert(false)} className={`${btnPrimaire} w-full`}>
              Compris
            </button>
          </div>
        )}
      </Tiroir>

      {demandeApercuPDF && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0A0A0A]/70 p-2 backdrop-blur-sm sm:p-5" role="presentation">
          <section role="dialog" aria-modal="true" className="rh-pop flex h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#E5E5EA] bg-white shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5EA] px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#0A0A0A]">Formulaire officiel de demande</h2>
                <p className="mt-0.5 text-xs text-[#86868B]">
                  {demandeApercuPDF.numero_enregistrement || `Demande #${demandeApercuPDF.id_demande}`} · document MEN prérempli
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {urlPDF && (
                  <>
                    <a href={urlPDF} download={`formulaire-${demandeApercuPDF.numero_enregistrement || demandeApercuPDF.id_demande}.pdf`} className={`${btnPrimaire} !h-9 !text-xs`}>
                      Télécharger
                    </a>
                    <button type="button" onClick={() => iframePDF.current?.contentWindow?.print()} className={`${btnContour} !h-9 !text-xs`}>
                      Imprimer
                    </button>
                  </>
                )}
                <button type="button" onClick={fermerApercuPDF} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-lg bg-[#FAFAF8] text-[#86868B] transition hover:bg-[#F5F5F7]">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
            </header>
            {integritePDF && urlPDF && (
              <div className="border-b border-[#D1FAE5] bg-[#F0FDF4] px-4 py-2.5 text-xs text-[#166534] sm:px-6">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <Icon name="shield" className="h-4 w-4 shrink-0" />
                  <span className="font-semibold">Intégrité du document vérifiée</span>
                  <span className="text-[#4B7A5B]">
                    {integritePDF.signature_integrite === true
                      ? 'La signature, le PDF enregistré et le journal de traçabilité concordent.'
                      : 'Le PDF enregistré et le journal sont intègres ; la signature n’est pas disponible pour cette ancienne demande.'}
                  </span>
                </div>
                <details className="mt-1.5">
                  <summary className="cursor-pointer font-medium underline decoration-dotted underline-offset-2">Afficher les informations de vérification</summary>
                  <div className="mt-2 grid gap-1.5 break-words sm:grid-cols-2">
                    <p>Signé par : <strong>{integritePDF.signature_par || 'Compte non disponible'}</strong></p>
                    <p>Signature enregistrée : <strong>{integritePDF.signature_le ? dateCourte(integritePDF.signature_le) : 'Non renseignée'}</strong></p>
                    <p className="sm:col-span-2">Empreinte SHA-256 du PDF : <code className="select-all text-[10px]">{integritePDF.empreinte_pdf}</code></p>
                    <p className="sm:col-span-2">Événements de traçabilité : <strong>{integritePDF.historique.length}</strong></p>
                  </div>
                </details>
              </div>
            )}
            <div className="min-h-0 flex-1 bg-[#F5F5F7] p-2 sm:p-4">
              {chargementPDF ? (
                <div className="grid h-full place-items-center text-xs font-medium text-[#86868B]">
                  <span className="flex items-center gap-3">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1B1BFF]/20 border-t-[#1B1BFF]" />
                    Préparation du formulaire officiel…
                  </span>
                </div>
              ) : erreurPDF ? (
                <div role="alert" className="mx-auto mt-8 max-w-lg rounded-xl border border-rose-200 bg-white p-5 text-xs font-medium text-rose-700">
                  {erreurPDF}
                  <button type="button" onClick={() => void ouvrirApercuPDF(demandeApercuPDF)} className="ml-2 font-bold underline">Réessayer</button>
                </div>
              ) : urlPDF ? (
                <iframe ref={iframePDF} src={urlPDF} title="Aperçu du formulaire officiel" className="h-full w-full rounded-lg border border-[#E5E5EA] bg-white" />
              ) : null}
            </div>
          </section>
        </div>
      )}
    </CoquilleAgent>
  )
}

export default MesDemandesPage