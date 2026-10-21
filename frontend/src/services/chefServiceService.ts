import { api, initialiserCSRF } from '../lib/api'

export interface PersonnelEquipe {
  id_personnel: number
  im: string
  nom: string
  prenoms: string
  nom_complet: string
  corps: string
  grade: string
  sexe?: string
  statut?: string
  service: number | null
  service_libelle: string | null
}

export interface DemandeEnAttente {
  id_demande: number
  numero_enregistrement: string | null
  personnel: number
  personnel_detail?: {
    nom_complet?: string
    im?: string
    nom?: string
    prenoms?: string
  } | null
  type_absence: string
  annee_titre?: number | null
  date_evenement_prevue?: string | null
  type_absence_libelle: string
  motif?: string
  lieu_jouissance?: string
  justificatif_url?: string | null
  date_debut: string
  date_fin: string
  nombre_jours: number
  statut_demande: string
  statut_libelle?: string
}

export type AvisChefService = 'FAVORABLE' | 'DEFAVORABLE'

export interface AbsencePlanning {
  id_demande: number
  personnel_id: number
  personnel_nom: string
  type_absence: string
  type_absence_libelle: string
  date_debut: string
  date_fin: string
  nombre_jours: number
  statut_demande: string
}

interface ReponsePaginee<T> {
  resultats?: T[]
  results?: T[]
}

function extraireListe<T>(
  donnees: ReponsePaginee<T> | T[],
): T[] {
  if (Array.isArray(donnees)) return donnees

  if (Array.isArray(donnees.resultats)) {
    return donnees.resultats
  }

  if (Array.isArray(donnees.results)) {
    return donnees.results
  }

  return []
}

export async function listerPersonnelsDuService(
  serviceId: number,
): Promise<PersonnelEquipe[]> {
  const { data } = await api.get<
    ReponsePaginee<PersonnelEquipe> | PersonnelEquipe[]
  >('/personnels/', {
    params: {
      service: serviceId,
      taille: 200,
      ordering: 'nom',
    },
  })

  return extraireListe(data)
}

export async function listerDemandesEnAttenteService():
Promise<DemandeEnAttente[]> {
  const { data } = await api.get<DemandeEnAttente[]>(
    '/demandes/en-attente-service/',
  )

  return Array.isArray(data) ? data : []
}

/** Enregistre le visa du chef sur une demande de son service. */
export async function enregistrerAvisChefService(
  idDemande: number,
  avis: AvisChefService,
  observation: string,
): Promise<DemandeEnAttente> {
  await initialiserCSRF()

  const { data } = await api.post<DemandeEnAttente>(
    `/demandes/${idDemande}/avis/`,
    { avis, observation: observation.trim() },
  )

  return data
}

export async function listerPlanningService(
  debut: string,
  fin: string,
): Promise<AbsencePlanning[]> {
  const { data } = await api.get<AbsencePlanning[]>(
    '/demandes/planning/',
    {
      params: { debut, fin },
    },
  )

  return Array.isArray(data) ? data : []
}