
import { api } from '../lib/api'

export type StatutHistorique =
  | 'EN_ATTENTE'
  | 'APPROUVE_CS'
  | 'VALIDE_DIR'
  | 'REJETE'
  | 'ARCHIVEE'

export interface ValidationDemande {
  id_validation: number
  niveau: string
  niveau_libelle: string
  avis: string
  avis_libelle: string
  observation: string
  date_action: string
}

export interface ElementHistorique {
  id_demande: number
  numero_enregistrement: string | null
  type_absence: string
  annee_titre?: number | null
  date_evenement_prevue?: string | null
  type_absence_libelle: string
  motif: string
  date_debut: string
  date_fin: string
  nombre_jours: number
  statut_demande: StatutHistorique
  statut_libelle: string
  date_creation: string
  validations: ValidationDemande[]
}

export interface HistoriquePagine {
  total: number
  nombre_pages: number
  page_courante: number
  resultats: ElementHistorique[]
}

interface ReponseAPI {
  total?: number
  nombre_pages?: number
  page_courante?: number
  resultats?: ElementHistorique[]
}

export interface FiltresHistorique {
  personnelId: number
  page: number
  recherche: string
  statut: StatutHistorique | ''
}

export async function obtenirHistorique({
  personnelId,
  page,
  recherche,
  statut,
}: FiltresHistorique): Promise<HistoriquePagine> {
  const { data } = await api.get<ReponseAPI | ElementHistorique[]>(
    '/demandes/',
    {
      params: {
        page,
        taille: 20,
        personnel: personnelId,
        ordering: '-date_creation',
        ...(recherche.trim() ? { search: recherche.trim() } : {}),
        ...(statut ? { statut_demande: statut } : {}),
      },
    },
  )

  if (Array.isArray(data)) {
    return {
      total: data.length,
      nombre_pages: 1,
      page_courante: 1,
      resultats: data,
    }
  }

  const resultats = Array.isArray(data.resultats)
    ? data.resultats
    : []

  return {
    total: data.total ?? resultats.length,
    nombre_pages: data.nombre_pages ?? 1,
    page_courante: data.page_courante ?? page,
    resultats,
  }
}
