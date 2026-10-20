
import { api, initialiserCSRF } from '../lib/api'

export type AvisDirecteur = 'FAVORABLE' | 'DEFAVORABLE'

export interface PersonnelDemande {
  id_personnel?: number
  im?: string
  nom?: string
  prenoms?: string
  nom_complet?: string
  service_libelle?: string
  direction_libelle?: string
  [cle: string]: unknown
}

export interface ValidationDemande {
  id_validation: number
  niveau: string
  niveau_libelle?: string
  avis: string
  avis_libelle?: string
  observation: string
  date_action: string
  valideur_detail?: PersonnelDemande | null
}

export interface DemandeDirection {
  id_demande: number
  numero_enregistrement: string | null
  personnel: number
  personnel_detail?: PersonnelDemande | null
  type_absence: string
  type_absence_libelle: string
  annee_titre?: number | null
  date_evenement_prevue?: string | null
  motif: string
  date_debut: string
  date_fin: string
  nombre_jours: number
  lieu_jouissance: string
  statut_demande: string
  statut_libelle: string
  date_creation: string
  justificatif_url: string | null
  validations?: ValidationDemande[]
}

interface ReponsePaginee<T> {
  results?: T[]
  resultats?: T[]
  count?: number
  total?: number
}

function extraireListe<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]

  if (data && typeof data === 'object') {
    const reponse = data as ReponsePaginee<T>
    if (Array.isArray(reponse.results)) return reponse.results
    if (Array.isArray(reponse.resultats)) return reponse.resultats
  }

  return []
}

/**
 * Demandes qui attendent réellement une décision du directeur.
 * Le backend applique le contrôle de direction et les règles métier.
 */
export async function listerDemandesEnAttenteDirection(): Promise<
  DemandeDirection[]
> {
  const { data } = await api.get<unknown>(
    '/demandes/en-attente-direction/',
  )

  return extraireListe<DemandeDirection>(data)
}

/**
 * Enregistre l'avis définitif du directeur.
 */
export async function enregistrerAvisDirecteur(
  idDemande: number,
  avis: AvisDirecteur,
  observation: string,
): Promise<DemandeDirection> {
  await initialiserCSRF()

  const { data } = await api.post<DemandeDirection>(
    `/demandes/${idDemande}/avis/`,
    {
      avis,
      observation: observation.trim(),
    },
  )

  return data
}
