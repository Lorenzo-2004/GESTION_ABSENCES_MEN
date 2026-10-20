
import { api, initialiserCSRF } from '../lib/api'

export type NatureDecision = 'OCR' | 'SAISIE_MANUELLE'

export interface PersonnelDecision {
  id_personnel: number
  im: string
  nom: string
  prenoms: string
  nom_complet?: string
  statut?: string
  corps?: string
  grade?: string
  indice?: number | null
  direction: number
  direction_libelle?: string
  service?: number | null
  service_libelle?: string | null
}

export interface DecisionConge {
  id_decision: number
  numero_decision: string
  personnel: number
  personnel_detail?: PersonnelDecision
  direction: number
  demande: number | null
  budget: string
  imputation_budgetaire: string
  corps_grade: string
  indice: number | null
  annees_titre: string
  details_jours: string
  date_demande_reference: string | null
  date_emission: string
  signataire: string
  fichier_scan_path: string | null
  nature: NatureDecision | string
  nature_libelle?: string
  est_valide: boolean
}

export interface DonneesExtraitesDecision {
  source: NatureDecision | string
  im: string | null
  numero_decision: string | null
  indice: string | number | null
  annees: number[]
  texte_brut: string
}

export interface ResultatScanDecision {
  donnees_extraites: DonneesExtraitesDecision
  agent: PersonnelDecision | null
  statut_agent: string | null
  nature: string | null
}

export interface CreationDecision {
  numero_decision: string
  personnel: number
  direction: number
  demande?: number | null
  budget?: string
  imputation_budgetaire?: string
  corps_grade?: string
  indice?: number | null
  annees_titre: string
  details_jours?: string
  date_demande_reference?: string | null
  date_emission: string
  signataire?: string
  nature?: NatureDecision
  est_valide?: boolean
}

export interface ResultatListe<T> {
  elements: T[]
  total: number
  suivante: string | null
  precedente: string | null
}

interface MetadataPage<T> {
  results?: T[]
  resultats?: T[]
  data?: T[]
  items?: T[]
  count?: number
  total?: number
  total_pages?: number
  nombre_pages?: number
  next?: string | null
  previous?: string | null
  suivante?: string | null
  precedente?: string | null
}

function normaliserListe<T>(donnees: unknown): ResultatListe<T> {
  if (Array.isArray(donnees)) {
    return {
      elements: donnees as T[],
      total: donnees.length,
      suivante: null,
      precedente: null,
    }
  }

  if (donnees && typeof donnees === 'object') {
    const resultat = donnees as MetadataPage<T>
    const elements = [
      resultat.results,
      resultat.resultats,
      resultat.data,
      resultat.items,
    ].find(Array.isArray) as T[] | undefined

    const liste = elements ?? []
    return {
      elements: liste,
      total: resultat.count ?? resultat.total ?? liste.length,
      suivante: resultat.suivante ?? resultat.next ?? null,
      precedente: resultat.precedente ?? resultat.previous ?? null,
    }
  }

  return {
    elements: [],
    total: 0,
    suivante: null,
    precedente: null,
  }
}

/**
 * Charge l'ensemble d'une liste paginée par le backend (taille maximale : 200).
 * La page RH calcule aussi ses indicateurs sur la collection complète et non
 * uniquement sur les 20 premiers éléments de la réponse par défaut.
 */
async function listerToutesLesPages<T>(
  chemin: string,
  params: Record<string, string | number | boolean | undefined>,
): Promise<ResultatListe<T>> {
  const taille = 200
  const premiereReponse = await api.get<unknown>(chemin, {
    params: { ...params, page: 1, taille },
  })
  const premierePage = normaliserListe<T>(premiereReponse.data)

  if (Array.isArray(premiereReponse.data)) return premierePage

  const metadonnees = premiereReponse.data as MetadataPage<T>
  const nombrePages = metadonnees.nombre_pages
    ?? metadonnees.total_pages
    ?? Math.max(1, Math.ceil(premierePage.total / taille))

  const toutes = [...premierePage.elements]
  // Limiter la concurrence pour ne pas envoyer un grand nombre de requêtes
  // simultanées sur le backend du ministère.
  for (let debut = 2; debut <= nombrePages; debut += 5) {
    const numeros = Array.from(
      { length: Math.min(5, nombrePages - debut + 1) },
      (_, index) => debut + index,
    )
    const pages = await Promise.all(
      numeros.map(async (page) => {
        const reponse = await api.get<unknown>(chemin, {
          params: { ...params, page, taille },
        })
        return normaliserListe<T>(reponse.data).elements
      }),
    )
    for (const page of pages) toutes.push(...page)
  }

  return {
    elements: toutes,
    total: premierePage.total,
    suivante: null,
    precedente: null,
  }
}

/**
 * Liste les décisions RH.
 * Le filtrage est réalisé par l'API Django.
 */
export async function listerDecisions(
  recherche = '',
  filtre: 'toutes' | 'valides' | 'non_validees' = 'toutes',
): Promise<ResultatListe<DecisionConge>> {
  const params: Record<string, string | boolean> = {}

  if (recherche.trim()) {
    params.search = recherche.trim()
  }

  if (filtre === 'valides') {
    params.est_valide = true
  } else if (filtre === 'non_validees') {
    params.est_valide = false
  }

  return listerToutesLesPages<DecisionConge>('/decisions/', params)
}

/**
 * Recherche les agents disponibles pour rattacher une décision.
 */
export async function listerPersonnelsRH(
  recherche = '',
): Promise<ResultatListe<PersonnelDecision>> {
  return listerToutesLesPages<PersonnelDecision>('/personnels/', {
    search: recherche.trim() || undefined,
    ordering: 'nom',
  })
}

/**
 * Analyse un scan sans créer de décision en base.
 */
export async function scannerDecision(
  fichier: File,
): Promise<ResultatScanDecision> {
  await initialiserCSRF()

  const formulaire = new FormData()
  formulaire.append('fichier', fichier)

  const reponse = await api.post<ResultatScanDecision>(
    '/decisions/scan/',
    formulaire,
  )

  return reponse.data
}

/**
 * Enregistre la décision après vérification des informations par la RH.
 * Le fichier scanné est joint à la décision lorsqu'il est fourni.
 */
export async function creerDecision(
  donnees: CreationDecision,
  fichierScan?: File | null,
): Promise<DecisionConge> {
  await initialiserCSRF()

  if (fichierScan) {
    const formulaire = new FormData()

    for (const [champ, valeur] of Object.entries(donnees)) {
      if (valeur === undefined || valeur === null || valeur === '') {
        continue
      }

      formulaire.append(champ, String(valeur))
    }

    formulaire.append('fichier_scan_path', fichierScan)

    const reponse = await api.post<DecisionConge>(
      '/decisions/',
      formulaire,
    )

    return reponse.data
  }

  const reponse = await api.post<DecisionConge>(
    '/decisions/',
    donnees,
  )

  return reponse.data
}

/**
 * Valide la décision et déclenche l'activation des soldes côté serveur.
 */
export async function activerDecision(
  idDecision: number,
): Promise<DecisionConge> {
  await initialiserCSRF()

  const reponse = await api.post<DecisionConge>(
    `/decisions/${idDecision}/activer/`,
  )

  return reponse.data
}

/**
 * Reporte les reliquats d'un exercice clôturé.
 */
export async function reporterReliquats(
  anneeSource: number,
): Promise<{
  annee_source: number
  annee_cible: number
  nombre_soldes_reportes: number
  message: string
}> {
  await initialiserCSRF()

  const reponse = await api.post('/decisions/reporter-reliquats/', {
    annee_source: anneeSource,
  })

  return reponse.data
}
