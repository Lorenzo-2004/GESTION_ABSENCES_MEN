import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../../contexts/useAuth'
import { Icon, Message } from '../../components/men/ui'
import { CoquilleService } from '../../components/men/miseEnPageRH'
import { messageErreurUtilisateur } from '../../lib/messages'
import {
  listerFormulairesDeMonService,
  recupererFormulaireOfficiel,
  type DemandeConge,
  typePossedeFicheOfficielle,
  verifierIntegriteFormulaire,
} from '../../services/congesService'

const bouton = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#1B1BFF] px-3 text-xs font-semibold text-white transition hover:bg-[#1616d5] disabled:opacity-50'

function nomAgent(demande: DemandeConge): string {
  const agent = demande.personnel_detail
  return agent?.nom_complet || [agent?.nom, agent?.prenoms].filter(Boolean).join(' ') || `Agent #${demande.personnel}`
}

export function FormulairesServicePage() {
  const { utilisateur, chargement } = useAuth()
  const [demandes, setDemandes] = useState<DemandeConge[]>([])
  const [recherche, setRecherche] = useState('')
  const [chargementListe, setChargementListe] = useState(true)
  const [telechargement, setTelechargement] = useState<number | null>(null)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const service = utilisateur?.personnel?.service
  const estChef = utilisateur?.role === 'ROLE_CHEF_SERVICE'

  const charger = useCallback(async () => {
    if (!estChef || service == null) return
    setChargementListe(true)
    try {
      setDemandes(await listerFormulairesDeMonService())
      setErreur('')
    } catch (cause) {
      setErreur(messageErreurUtilisateur(cause, 'Impossible de charger les formulaires du service.'))
    } finally {
      setChargementListe(false)
    }
  }, [estChef, service])

  useEffect(() => { void charger() }, [charger])

  const affiches = useMemo(() => {
    const filtre = recherche.trim().toLocaleLowerCase('fr-FR')
    return demandes.filter((demande) => !filtre || [
      nomAgent(demande), demande.numero_enregistrement, demande.type_absence_libelle,
      demande.personnel_detail?.im,
    ].filter(Boolean).join(' ').toLocaleLowerCase('fr-FR').includes(filtre))
  }, [demandes, recherche])

  async function telecharger(demande: DemandeConge) {
    if (!typePossedeFicheOfficielle(demande.type_absence)) return
    setTelechargement(demande.id_demande)
    setErreur('')
    setSucces('')
    try {
      const fichier = await recupererFormulaireOfficiel(demande.id_demande)
      if (await fichier.slice(0, 5).text() !== '%PDF-') {
        throw new Error('Le fichier reçu n’est pas un PDF valide.')
      }
      const integrite = await verifierIntegriteFormulaire(demande.id_demande)
      if (integrite.integrite_globale !== true || integrite.document_integrite !== true || integrite.journal_integrite !== true || integrite.signature_integrite === false) {
        throw new Error('Contrôle d’intégrité du PDF échoué : impression interdite.')
      }
      const url = URL.createObjectURL(new Blob([fichier], { type: 'application/pdf' }))
      const lien = document.createElement('a')
      lien.href = url
      const reference = (demande.numero_enregistrement || String(demande.id_demande)).replace(/[^A-Za-z0-9._-]/g, '_')
      lien.download = `Formulaire-officiel-${reference}.pdf`
      document.body.appendChild(lien)
      lien.click()
      lien.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
      setSucces(`Le formulaire de ${nomAgent(demande)} est prêt pour les signatures manuscrites.`)
    } catch (cause) {
      setErreur(messageErreurUtilisateur(cause, 'Impossible de télécharger le PDF officiel.'))
    } finally {
      setTelechargement(null)
    }
  }

  if (chargement) return <div className="p-8 text-sm">Chargement…</div>
  if (!utilisateur) return <Navigate to="/connexion" replace />
  if (!estChef) return <Navigate to="/app" replace />
  if (service == null) return <div className="p-8">Votre compte n’est associé à aucun service.</div>

  return (
    <CoquilleService vue="formulaires" onVue={() => {}} titre="PDF officiels à signer" description="Demandes visées de votre service, à imprimer pour signatures manuscrites" actions={
      <button type="button" className={bouton} onClick={() => void charger()} disabled={chargementListe}><Icon name="refresh" className="h-4 w-4" />Actualiser</button>
    }>
      <section className="space-y-5 rounded-[24px] border border-[#E5E5EA] bg-white p-4 sm:p-6">
        {erreur && <Message type="erreur">{erreur}</Message>}
        {succes && <Message type="succes">{succes}</Message>}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Formulaires de mon service</h2>
            <p className="text-xs text-[#5D5D66]">{demandes.length} demande(s) visée(s) ou validée(s) — {utilisateur.personnel?.service_libelle || 'Mon service'}</p>
          </div>
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un agent, IM, numéro…" aria-label="Rechercher un formulaire" className="h-10 w-full max-w-xs rounded-xl border border-[#E5E5EA] px-3 text-sm outline-none focus:ring-2 focus:ring-[#1B1BFF]/20" />
        </div>
        {chargementListe ? <p className="text-sm text-[#5D5D66]">Chargement des demandes…</p> : affiches.length === 0 ? (
          <p className="rounded-xl bg-[#FAFAF8] p-6 text-sm text-[#5D5D66]">Aucune demande visée correspondant à la recherche.</p>
        ) : (
          <div className="space-y-3">
            {affiches.map((demande) => (
              <article key={demande.id_demande} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E5EA] p-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#0A0A0A]">{nomAgent(demande)}</h3>
                  <p className="mt-1 text-xs text-[#5D5D66]">{demande.personnel_detail?.im || 'IM —'} · {demande.numero_enregistrement || `Demande #${demande.id_demande}`} · {demande.type_absence_libelle}</p>
                  <p className="mt-1 text-xs text-[#5D5D66]">{demande.statut_demande === 'APPROUVE_CS' ? 'Visa du chef de service' : demande.statut_demande === 'VALIDE_DIR' ? 'Validée par la direction' : 'Archivée'} · {demande.nombre_jours} jour(s)</p>
                </div>
                {typePossedeFicheOfficielle(demande.type_absence) ? (
                  <button type="button" className={bouton} disabled={telechargement !== null} onClick={() => void telecharger(demande)}>
                    <Icon name="file" className="h-4 w-4" />{telechargement === demande.id_demande ? 'Téléchargement…' : 'Télécharger le PDF'}
                  </button>
                ) : <span className="text-xs text-[#86868B]">Sans formulaire PDF officiel</span>}
              </article>
            ))}
          </div>
        )}
        <p className="text-xs text-[#5D5D66]">Ces documents restent dans l’espace du chef du service de l’agent. L’impression permet de recueillir les signatures manuscrites. Les décisions RH restent gérées dans leur espace habituel.</p>
      </section>
    </CoquilleService>
  )
}

export default FormulairesServicePage
