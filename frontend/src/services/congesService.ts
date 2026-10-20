import { api } from '../lib/api'

export type StatutDemande =
  | 'EN_ATTENTE'
  | 'APPROUVE_CS'
  | 'VALIDE_DIR'
  | 'REJETE'
  | 'ARCHIVEE'

export interface DemandeConge {
  id_demande: number
  numero_enregistrement: string | null
  personnel: number
  type_absence: string
  annee_titre?: number | null
  date_evenement_prevue?: string | null
  type_absence_libelle: string
  motif: string
  date_debut: string
  date_fin: string
  nombre_jours: number
  lieu_jouissance: string
  statut_demande: StatutDemande
  statut_libelle: string
  date_creation: string
  justificatif_url: string | null
}

export interface PageDemandes {
  total: number
  nombre_pages: number
  page_courante: number
  taille_page: number
  suivante: string | null
  precedente: string | null
  resultats: DemandeConge[]
}

interface ReponsePagineeDemandes {
  total?: number
  nombre_pages?: number
  page_courante?: number
  taille_page?: number
  suivante?: string | null
  precedente?: string | null
  resultats?: DemandeConge[]
}

export interface FiltresDemandes {
  personnelId: number
  page?: number
  recherche?: string
  statut?: StatutDemande | ''
}

export async function listerMesDemandes({
  personnelId,
  page = 1,
  recherche = '',
  statut = '',
}: FiltresDemandes): Promise<PageDemandes> {
  const { data } = await api.get<
    ReponsePagineeDemandes | DemandeConge[]
  >('/demandes/', {
    params: {
      page,
      taille: 20,
      personnel: personnelId,
      ...(recherche.trim()
        ? { search: recherche.trim() }
        : {}),
      ...(statut ? { statut_demande: statut } : {}),
    },
  })

  if (Array.isArray(data)) {
    return {
      total: data.length,
      nombre_pages: 1,
      page_courante: 1,
      taille_page: data.length,
      suivante: null,
      precedente: null,
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
    taille_page: data.taille_page ?? 20,
    suivante: data.suivante ?? null,
    precedente: data.precedente ?? null,
    resultats,
  }
}

export async function recupererFormulaireOfficiel(
  idDemande: number,
): Promise<Blob> {
  const { data } = await api.get<Blob>(
    `/demandes/${idDemande}/formulaire/`,
    { responseType: 'blob' },
  )

  return data
}
