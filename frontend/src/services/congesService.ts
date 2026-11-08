import { api } from '../lib/api'

/** Types pour lesquels le formulaire officiel MEN peut être généré. */
export const TYPES_AVEC_FICHE_OFFICIELLE = [
  'CONGE_ANNUEL',
  'AUTORISATION',
  'PERMISSION',
] as const

export function typePossedeFicheOfficielle(typeAbsence?: string | null): boolean {
  return TYPES_AVEC_FICHE_OFFICIELLE.includes(
    (typeAbsence ?? '').trim().toUpperCase() as (typeof TYPES_AVEC_FICHE_OFFICIELLE)[number],
  )
}

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
  personnel_detail?: {
    id_personnel: number
    im: string
    nom: string
    prenoms: string
    nom_complet?: string
    direction: number
    direction_libelle?: string
    service?: number | null
    service_libelle?: string | null
  }
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

/**
 * Liste toutes les demandes ayant reçu le visa du chef de service.
 * La RH dispose d'un périmètre ministériel ; l'API renvoie donc les demandes
 * de tous les services, en respectant sa pagination standard.
 */
export async function listerDemandesValideesParService(): Promise<DemandeConge[]> {
  const taille = 200
  const toutes: DemandeConge[] = []
  let page = 1
  let nombrePages = 1

  do {
    const { data } = await api.get<ReponsePagineeDemandes | DemandeConge[]>(
      '/demandes/',
      {
        params: {
          page,
          taille,
          statut_demande: 'APPROUVE_CS',
          ordering: '-date_creation',
        },
      },
    )

    if (Array.isArray(data)) {
      toutes.push(...data)
      break
    }

    const resultats = Array.isArray(data.resultats) ? data.resultats : []
    toutes.push(...resultats)
    nombrePages = Math.max(1, data.nombre_pages ?? 1)
    page += 1
  } while (page <= nombrePages)

  return toutes
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


export interface TraceIntegriteDocument {
  evenement: string
  date: string
  acteur: string
  empreinte_evenement: string
  empreinte_pdf: string | null
}

export interface VerificationIntegriteDocument {
  signature_presente: boolean
  signature_integrite: boolean | null
  document_present: boolean
  document_integrite: boolean | null
  journal_integrite: boolean | null
  integrite_globale: boolean | null
  empreinte_pdf: string | null
  pdf_genere_le: string | null
  signature_le: string | null
  signature_par: string | null
  historique: TraceIntegriteDocument[]
  numero_demande: string | null
}

export async function verifierIntegriteFormulaire(
  idDemande: number,
): Promise<VerificationIntegriteDocument> {
  const { data } = await api.get<VerificationIntegriteDocument>(
    `/demandes/${idDemande}/integrite/`,
  )
  return data
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
