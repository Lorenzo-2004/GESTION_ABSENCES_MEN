import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Icon, Message } from '../../components/men/ui'
import { Tiroir } from '../../components/men/miseEnPageRH'
import {
  cinValide,
  emailValide,
  imValide,
  libelleAdministratifValide,
  normaliserCIN,
  normaliserIM,
  normaliserLibelleAdministratif,
  normaliserNom,
  normaliserTelephone,
  nomValide,
  telephoneValide,
  MESSAGE_CIN,
  MESSAGE_DATE_NAISSANCE,
  MESSAGE_EMAIL,
  MESSAGE_IM,
  MESSAGE_LIBELLE_ADMIN,
  MESSAGE_NOM,
  MESSAGE_TELEPHONE,
} from '../../lib/validationChamps'
import {
  creerAgentAdmin,
  listerAgentsAdmin,
  listerDirectionsAdmin,
  listerServicesAdmin,
  modifierAgentAdmin,
  supprimerAgentAdmin,
  type DirectionAdmin,
  type DonneesPersonnelAdmin,
  type PersonnelAdmin,
  type ServiceAdmin,
  type SexePersonnelAdmin,
  type StatutPersonnelAdmin,
} from '../../services/adminComptesService'
import { messageErreurUtilisateur } from '../../lib/messages'

const CHAMP = 'h-10 w-full rounded-xl border border-[#E5E5EA] bg-white px-3 text-sm text-[#0A0A0A] outline-none transition focus:border-[#1B1BFF]/40 focus:ring-4 focus:ring-[#1B1BFF]/10 placeholder:text-[#86868B] disabled:bg-[#F5F5F7] disabled:text-[#86868B]'
const ETIQUETTE = 'mb-1.5 block text-xs font-semibold text-[#33333A]'
const BOUTON_PRIMAIRE = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1B1BFF] px-4 text-sm font-semibold text-white transition hover:bg-[#1414D6] disabled:pointer-events-none disabled:opacity-50'
const BOUTON_CONTOUR = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D0D0D9] bg-white px-4 text-sm font-semibold text-[#0A0A0A] transition hover:bg-[#F5F5F7] disabled:pointer-events-none disabled:opacity-50'
const STATUTS: { valeur: StatutPersonnelAdmin; libelle: string }[] = [
  { valeur: 'FONCTIONNAIRE', libelle: 'Fonctionnaire' },
  { valeur: 'ECD', libelle: 'Agent non encadré de l’État (ECD)' },
  { valeur: 'STAGIAIRE', libelle: 'Stagiaire' },
]

interface FormulaireAgent {
  im: string
  cin: string
  nom: string
  prenoms: string
  sexe: SexePersonnelAdmin | ''
  date_naissance: string
  telephone: string
  email: string
  statut: StatutPersonnelAdmin | ''
  corps: string
  grade: string
  direction: string
  service: string
}

const FORMULAIRE_VIDE: FormulaireAgent = {
  im: '', cin: '', nom: '', prenoms: '', sexe: '', date_naissance: '',
  telephone: '', email: '', statut: 'FONCTIONNAIRE', corps: '', grade: '',
  direction: '', service: '',
}

function aujourdHuiISO(): string {
  const maintenant = new Date()
  const local = new Date(maintenant.getTime() - maintenant.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function extraireErreur(erreur: unknown): string {
  return messageErreurUtilisateur(erreur, 'Impossible d’enregistrer la fiche. Vérifiez les informations puis réessayez.')
}

function nomComplet(agent: PersonnelAdmin): string {
  return [agent.nom, agent.prenoms].filter(Boolean).join(' ')
}

function LabelChamp({ children, htmlFor, requis = false }: { children: string; htmlFor: string; requis?: boolean }) {
  return (
    <label htmlFor={htmlFor} className={ETIQUETTE}>
      {children}{requis && <span className="ml-1 text-rose-600" aria-hidden="true">*</span>}
    </label>
  )
}

export default function GestionAgentsAdmin({ onOuvrirComptes }: { onOuvrirComptes: () => void }) {
  const [agents, setAgents] = useState<PersonnelAdmin[]>([])
  const [directions, setDirections] = useState<DirectionAdmin[]>([])
  const [services, setServices] = useState<ServiceAdmin[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreurListe, setErreurListe] = useState('')
  const [recherche, setRecherche] = useState('')
  const [actualisation, setActualisation] = useState(0)

  const [tiroirOuvert, setTiroirOuvert] = useState(false)
  const [mode, setMode] = useState<'creation' | 'edition'>('creation')
  const [agentCible, setAgentCible] = useState<PersonnelAdmin | null>(null)
  const [formulaire, setFormulaire] = useState<FormulaireAgent>(FORMULAIRE_VIDE)
  const [erreurFormulaire, setErreurFormulaire] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)
  const [confirmationSuppression, setConfirmationSuppression] = useState<number | null>(null)
  const [messageSucces, setMessageSucces] = useState('')
  const [agentCree, setAgentCree] = useState(false)

  const chargerDonnees = useCallback(async () => {
    setChargement(true)
    setErreurListe('')
    try {
      const [listeAgents, listeDirections, listeServices] = await Promise.all([
        listerAgentsAdmin(),
        listerDirectionsAdmin(),
        listerServicesAdmin(),
      ])
      setAgents(listeAgents)
      setDirections(listeDirections)
      setServices(listeServices)
    } catch (cause) {
      setErreurListe(extraireErreur(cause))
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => { void chargerDonnees() }, [chargerDonnees, actualisation])

  const agentsFiltres = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase('fr-FR')
    if (!terme) return agents
    return agents.filter((agent) => [agent.im, agent.cin, agent.nom, agent.prenoms, agent.direction_libelle, agent.service_libelle]
      .some((valeur) => String(valeur ?? '').toLocaleLowerCase('fr-FR').includes(terme)))
  }, [agents, recherche])

  const servicesDirection = useMemo(() => {
    if (!formulaire.direction) return []
    return services.filter((service) => service.direction === Number(formulaire.direction))
  }, [services, formulaire.direction])

  function modifierChamp<K extends keyof FormulaireAgent>(cle: K, valeur: FormulaireAgent[K]) {
    setFormulaire((precedent) => ({ ...precedent, [cle]: valeur }))
    setErreurFormulaire('')
  }

  function ouvrirCreation() {
    setMode('creation')
    setAgentCible(null)
    setFormulaire(FORMULAIRE_VIDE)
    setErreurFormulaire('')
    setTiroirOuvert(true)
  }

  function ouvrirEdition(agent: PersonnelAdmin) {
    setMode('edition')
    setAgentCible(agent)
    setFormulaire({
      im: agent.im ?? '', cin: agent.cin ?? '', nom: agent.nom ?? '', prenoms: agent.prenoms ?? '',
      sexe: agent.sexe, date_naissance: agent.date_naissance ?? '', telephone: agent.telephone ?? '',
      email: agent.email ?? '', statut: agent.statut, corps: agent.corps ?? '', grade: agent.grade ?? '',
      direction: String(agent.direction ?? ''), service: agent.service == null ? '' : String(agent.service),
    })
    setErreurFormulaire('')
    setTiroirOuvert(true)
  }

  function anomalies(): string[] {
    const erreurs: string[] = []
    if (!imValide(formulaire.im)) erreurs.push(`IM : ${MESSAGE_IM}`)
    if (!cinValide(formulaire.cin)) erreurs.push(`CIN : ${MESSAGE_CIN}`)
    if (!nomValide(formulaire.nom) || formulaire.nom.length > 100) erreurs.push(`Nom : ${MESSAGE_NOM} (100 caractères maximum).`)
    if (!nomValide(formulaire.prenoms) || formulaire.prenoms.length > 150) erreurs.push(`Prénoms : ${MESSAGE_NOM} (150 caractères maximum).`)
    if (!formulaire.sexe) erreurs.push('Le sexe doit être sélectionné.')
    if (!formulaire.date_naissance || Number.isNaN(Date.parse(formulaire.date_naissance)) || formulaire.date_naissance > aujourdHuiISO()) {
      erreurs.push(MESSAGE_DATE_NAISSANCE)
    }
    if (formulaire.telephone.trim() && !telephoneValide(formulaire.telephone)) erreurs.push(MESSAGE_TELEPHONE)
    if (formulaire.email.trim() && !emailValide(formulaire.email)) erreurs.push(MESSAGE_EMAIL)
    if (!formulaire.statut || !STATUTS.some((statut) => statut.valeur === formulaire.statut)) erreurs.push('Sélectionnez un statut administratif valide.')
    if (!libelleAdministratifValide(formulaire.corps) || formulaire.corps.length > 100) erreurs.push(`Corps : ${MESSAGE_LIBELLE_ADMIN}`)
    if (!libelleAdministratifValide(formulaire.grade) || formulaire.grade.length > 100) erreurs.push(`Grade : ${MESSAGE_LIBELLE_ADMIN}`)
    if (!formulaire.direction || !directions.some((direction) => direction.id_direction === Number(formulaire.direction))) {
      erreurs.push('Sélectionnez une direction existante.')
    }
    if (formulaire.service && !servicesDirection.some((service) => service.id_service === Number(formulaire.service))) {
      erreurs.push('Le service sélectionné doit appartenir à la direction choisie.')
    }

    const imDejaPris = agents.some((agent) => agent.im === formulaire.im && agent.id_personnel !== agentCible?.id_personnel)
    const cinDejaPrise = agents.some((agent) => agent.cin?.replace(/\s+/g, '') === formulaire.cin && agent.id_personnel !== agentCible?.id_personnel)
    if (imDejaPris) erreurs.push('Cet IM est déjà attribué à un autre agent.')
    if (cinDejaPrise) erreurs.push('Cette CIN est déjà attribuée à un autre agent.')
    return erreurs
  }

  const erreursValidation = tiroirOuvert ? anomalies() : []

  async function soumettreAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErreurFormulaire('')
    const erreurs = anomalies()
    if (erreurs.length) {
      setErreurFormulaire(erreurs.join(' '))
      return
    }

    const donnees: DonneesPersonnelAdmin = {
      im: formulaire.im,
      cin: formulaire.cin,
      nom: formulaire.nom.trim(),
      prenoms: formulaire.prenoms.trim(),
      sexe: formulaire.sexe as SexePersonnelAdmin,
      date_naissance: formulaire.date_naissance,
      telephone: formulaire.telephone.trim(),
      email: formulaire.email.trim().toLowerCase(),
      statut: formulaire.statut as StatutPersonnelAdmin,
      corps: formulaire.corps.trim(),
      grade: formulaire.grade.trim(),
      direction: Number(formulaire.direction),
      service: formulaire.service ? Number(formulaire.service) : null,
    }

    setEnregistrement(true)
    try {
      if (mode === 'creation') {
        await creerAgentAdmin(donnees)
        setMessageSucces('La fiche de l’agent a été créée.')
        setAgentCree(true)
      } else {
        if (!agentCible) throw new Error('Aucun agent sélectionné.')
        await modifierAgentAdmin(agentCible.id_personnel, donnees)
        setMessageSucces('La fiche de l’agent a été modifiée.')
        setAgentCree(false)
      }
      setTiroirOuvert(false)
      setAgentCible(null)
      setActualisation((cle) => cle + 1)
    } catch (cause) {
      setErreurFormulaire(extraireErreur(cause))
    } finally {
      setEnregistrement(false)
    }
  }

  async function supprimerAgent(agent: PersonnelAdmin) {
    const accepte = window.confirm(
      `Supprimer la fiche de ${nomComplet(agent)} (IM ${agent.im}) ?\n\nSi cette fiche est liée à un compte, une demande ou une décision, le serveur peut refuser la suppression pour préserver l’historique.`,
    )
    if (!accepte) return
    setConfirmationSuppression(agent.id_personnel)
    setMessageSucces('')
    setErreurListe('')
    try {
      await supprimerAgentAdmin(agent.id_personnel)
      setMessageSucces('La fiche de l’agent a été supprimée.')
      setAgentCree(false)
      setActualisation((cle) => cle + 1)
    } catch (cause) {
      setErreurListe(extraireErreur(cause))
    } finally {
      setConfirmationSuppression(null)
    }
  }

  return (
    <div className="space-y-4">
      {messageSucces && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>{messageSucces}</span>
          <div className="flex items-center gap-2">
            {agentCree && <button type="button" onClick={onOuvrirComptes} className="text-xs font-bold underline">Créer son compte utilisateur</button>}
            <button type="button" onClick={() => setMessageSucces('')} aria-label="Fermer le message" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-emerald-100"><Icon name="close" className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      {erreurListe && (
        <Message type="erreur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{erreurListe}</span>
            <button type="button" onClick={() => setActualisation((cle) => cle + 1)} className="text-xs font-semibold underline">Réessayer</button>
          </div>
        </Message>
      )}

      <section className="rounded-[24px] border border-[#E5E5EA] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0A0A0A]">Fiches des agents</h2>
            <p className="mt-1 text-xs text-[#86868B]">Créer, consulter, modifier et supprimer les dossiers du personnel.</p>
          </div>
          <button type="button" onClick={ouvrirCreation} className={BOUTON_PRIMAIRE}>
            <Icon name="plus" className="h-4 w-4" /> Ajouter un agent
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher un agent</span>
            <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]" />
            <input value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Rechercher par nom, IM, CIN, direction ou service" className={`${CHAMP} pl-9`} />
          </label>
          <button type="button" onClick={() => setActualisation((cle) => cle + 1)} disabled={chargement} className={BOUTON_CONTOUR}>
            <Icon name="refresh" className={`h-4 w-4 ${chargement ? 'animate-spin' : ''}`} /> Actualiser
          </button>
        </div>

        {chargement ? (
          <div className="py-12 text-center text-sm text-[#86868B]">Chargement des fiches…</div>
        ) : agentsFiltres.length === 0 ? (
          <div className="py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#1B1BFF]/10 text-[#1B1BFF]"><Icon name="user" className="h-6 w-6" /></span>
            <p className="mt-3 text-sm font-semibold text-[#0A0A0A]">{recherche ? 'Aucun agent trouvé' : 'Aucune fiche enregistrée'}</p>
            <p className="mt-1 text-xs text-[#86868B]">Ajoutez une fiche agent pour pouvoir ensuite lui créer un compte utilisateur.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#E5E5EA]">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead className="bg-[#F5F5F7] text-xs font-semibold text-[#686870]">
                <tr>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">IM</th>
                  <th className="px-4 py-3">CIN</th>
                  <th className="px-4 py-3">Direction / Service</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEF1]">
                {agentsFiltres.map((agent) => (
                  <tr key={agent.id_personnel} className="bg-white hover:bg-[#FAFAFC]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#0A0A0A]">{nomComplet(agent)}</p>
                      <p className="mt-0.5 text-xs text-[#86868B]">{agent.email || 'E-mail non renseigné'}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{agent.im}</td>
                    <td className="px-4 py-3 font-mono text-xs">{agent.cin}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-[#33333A]">{agent.direction_libelle || directions.find((d) => d.id_direction === agent.direction)?.nom_direction || '—'}</p>
                      <p className="mt-0.5 text-xs text-[#86868B]">{agent.service_libelle || services.find((s) => s.id_service === agent.service)?.nom_service || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{STATUTS.find((s) => s.valeur === agent.statut)?.libelle ?? agent.statut}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => ouvrirEdition(agent)} title="Modifier la fiche" aria-label={`Modifier ${nomComplet(agent)}`} className="grid h-9 w-9 place-items-center rounded-lg text-[#62626B] hover:bg-[#1B1BFF]/10 hover:text-[#1B1BFF]"><Icon name="edit" className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void supprimerAgent(agent)} disabled={confirmationSuppression === agent.id_personnel} title="Supprimer la fiche" aria-label={`Supprimer ${nomComplet(agent)}`} className="grid h-9 w-9 place-items-center rounded-lg text-[#86868B] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Icon name={confirmationSuppression === agent.id_personnel ? 'loader' : 'trash'} className={`h-4 w-4 ${confirmationSuppression === agent.id_personnel ? 'animate-spin' : ''}`} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[#E5E5EA] bg-[#FAFAFC] px-4 py-2.5 text-xs text-[#86868B]">
              {agentsFiltres.length} fiche(s) affichée(s) sur {agents.length} chargée(s).
            </div>
          </div>
        )}
      </section>

      <Tiroir
        ouvert={tiroirOuvert}
        onFermer={() => { if (!enregistrement) { setTiroirOuvert(false); setAgentCible(null) } }}
        titre={mode === 'creation' ? 'Ajouter un agent' : 'Modifier la fiche agent'}
        sousTitre="Les champs sont contrôlés avant leur enregistrement."
        pied={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={enregistrement} onClick={() => setTiroirOuvert(false)} className={BOUTON_CONTOUR}>Annuler</button>
            <button type="submit" form="formulaire-agent-admin" disabled={enregistrement || chargement || erreursValidation.length > 0} className={BOUTON_PRIMAIRE}>
              {enregistrement && <Icon name="loader" className="h-4 w-4 animate-spin" />}
              {enregistrement ? 'Enregistrement…' : mode === 'creation' ? 'Créer la fiche' : 'Enregistrer les modifications'}
            </button>
          </div>
        }
      >
        <form id="formulaire-agent-admin" onSubmit={soumettreAgent} className="space-y-4 pb-6">
          <section className="rounded-2xl border border-[#E5E5EA] bg-[#FAFAFC] p-4">
            <h3 className="mb-3 text-sm font-bold text-[#0A0A0A]">Identification</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <LabelChamp htmlFor="agent-im" requis>Indice matricule (IM)</LabelChamp>
                <input id="agent-im" value={formulaire.im} onChange={(e) => modifierChamp('im', normaliserIM(e.target.value))} inputMode="numeric" autoComplete="off" maxLength={6} placeholder="6 chiffres" className={CHAMP} required />
                <p className="mt-1 text-[11px] text-[#86868B]">Chiffres uniquement, exactement 6.</p>
              </div>
              <div>
                <LabelChamp htmlFor="agent-cin" requis>Carte d’identité nationale (CIN)</LabelChamp>
                <input id="agent-cin" value={formulaire.cin} onChange={(e) => modifierChamp('cin', normaliserCIN(e.target.value))} inputMode="numeric" autoComplete="off" maxLength={12} placeholder="12 chiffres" className={CHAMP} required />
                <p className="mt-1 text-[11px] text-[#86868B]">Chiffres uniquement, exactement 12.</p>
              </div>
              <div>
                <LabelChamp htmlFor="agent-nom" requis>Nom</LabelChamp>
                <input id="agent-nom" value={formulaire.nom} onChange={(e) => modifierChamp('nom', normaliserNom(e.target.value).slice(0, 100))} maxLength={100} autoComplete="family-name" placeholder="Nom de famille" className={CHAMP} required />
              </div>
              <div>
                <LabelChamp htmlFor="agent-prenoms" requis>Prénoms</LabelChamp>
                <input id="agent-prenoms" value={formulaire.prenoms} onChange={(e) => modifierChamp('prenoms', e.target.value.replace(/[^\p{L}\s'’\-]/gu, '').replace(/\s{2,}/g, ' ').slice(0, 150))} maxLength={150} autoComplete="given-name" placeholder="Prénom(s)" className={CHAMP} required />
              </div>
              <div>
                <LabelChamp htmlFor="agent-sexe" requis>Sexe</LabelChamp>
                <select id="agent-sexe" value={formulaire.sexe} onChange={(e) => modifierChamp('sexe', e.target.value as SexePersonnelAdmin | '')} className={CHAMP} required>
                  <option value="">Sélectionner</option><option value="M">Masculin</option><option value="F">Féminin</option>
                </select>
              </div>
              <div>
                <LabelChamp htmlFor="agent-date-naissance" requis>Date de naissance</LabelChamp>
                <input id="agent-date-naissance" type="date" value={formulaire.date_naissance} max={aujourdHuiISO()} onChange={(e) => modifierChamp('date_naissance', e.target.value)} className={CHAMP} required />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E5E5EA] bg-[#FAFAFC] p-4">
            <h3 className="mb-3 text-sm font-bold text-[#0A0A0A]">Coordonnées et statut</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <LabelChamp htmlFor="agent-telephone">Téléphone</LabelChamp>
                <input id="agent-telephone" type="tel" value={formulaire.telephone} onChange={(e) => modifierChamp('telephone', normaliserTelephone(e.target.value))} maxLength={24} placeholder="+261…" className={CHAMP} />
              </div>
              <div>
                <LabelChamp htmlFor="agent-email">E-mail</LabelChamp>
                <input id="agent-email" type="email" value={formulaire.email} onChange={(e) => modifierChamp('email', e.target.value.replace(/\s/g, '').slice(0, 254))} maxLength={254} placeholder="nom@exemple.mg" className={CHAMP} />
              </div>
              <div>
                <LabelChamp htmlFor="agent-statut" requis>Statut administratif</LabelChamp>
                <select id="agent-statut" value={formulaire.statut} onChange={(e) => modifierChamp('statut', e.target.value as StatutPersonnelAdmin)} className={CHAMP} required>
                  {STATUTS.map((statut) => <option key={statut.valeur} value={statut.valeur}>{statut.libelle}</option>)}
                </select>
              </div>
              <div>
                <LabelChamp htmlFor="agent-corps" requis>Corps</LabelChamp>
                <input id="agent-corps" value={formulaire.corps} onChange={(e) => modifierChamp('corps', normaliserLibelleAdministratif(e.target.value, 100))} maxLength={100} placeholder="Corps d’appartenance" className={CHAMP} required />
              </div>
              <div className="sm:col-span-2">
                <LabelChamp htmlFor="agent-grade" requis>Grade</LabelChamp>
                <input id="agent-grade" value={formulaire.grade} onChange={(e) => modifierChamp('grade', normaliserLibelleAdministratif(e.target.value, 100))} maxLength={100} placeholder="Grade administratif" className={CHAMP} required />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E5E5EA] bg-[#FAFAFC] p-4">
            <h3 className="mb-3 text-sm font-bold text-[#0A0A0A]">Affectation administrative</h3>
            <div className="grid gap-3">
              <div>
                <LabelChamp htmlFor="agent-direction" requis>Direction</LabelChamp>
                <select id="agent-direction" value={formulaire.direction} onChange={(e) => setFormulaire((precedent) => ({ ...precedent, direction: e.target.value, service: '' }))} className={CHAMP} required>
                  <option value="">Sélectionner une direction</option>
                  {directions.map((direction) => <option key={direction.id_direction} value={direction.id_direction}>{direction.code_direction} — {direction.nom_direction}</option>)}
                </select>
              </div>
              <div>
                <LabelChamp htmlFor="agent-service" requis>Service</LabelChamp>
                <select id="agent-service" value={formulaire.service} onChange={(e) => modifierChamp('service', e.target.value)} disabled={!formulaire.direction || servicesDirection.length === 0} className={CHAMP}>
                  <option value="">Aucun service (facultatif)</option>
                  {servicesDirection.map((service) => <option key={service.id_service} value={service.id_service}>{service.code_service} — {service.nom_service}</option>)}
                </select>
                {formulaire.direction && servicesDirection.length === 0 && <p className="mt-1 text-xs text-rose-600">Aucun service n’est disponible pour cette direction.</p>}
              </div>
            </div>
          </section>

          {erreurFormulaire && <Message type="erreur">{erreurFormulaire}</Message>}
          {erreursValidation.length > 0 && (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-bold">Enregistrement bloqué : vérifiez les champs obligatoires et leur format.</p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5">{erreursValidation.map((erreur) => <li key={erreur}>{erreur}</li>)}</ul>
            </div>
          )}
        </form>
      </Tiroir>
    </div>
  )
}
