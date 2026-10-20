
import { api, initialiserCSRF } from '../lib/api'

export type RoleCompte =
  | 'ROLE_AGENT'
  | 'ROLE_CHEF_SERVICE'
  | 'ROLE_DIRECTEUR'
  | 'ROLE_RH'

export interface CompteUtilisateur {
  id: number
  username: string
  email: string
  role: RoleCompte
  role_libelle: string
  personnel: number
  personnel_im: string
  personnel_nom: string
  personnel_direction: string
  is_active: boolean
  date_joined: string
  last_login: string | null
}

export interface PersonnelPourCompte {
  id_personnel: number
  im: string
  cin?: string
  nom: string
  prenoms: string
  nom_complet: string
  direction_libelle?: string
  service_libelle?: string | null
}

export interface PageResultat<T> {
  resultats: T[]
  total: number
  page: number
  nombrePages: number
}

export interface CreationCompte {
  personnel: number
  email: string
  role: RoleCompte
  password: string
}

export interface ModificationCompte {
  email?: string
  role?: RoleCompte
  is_active?: boolean
  password?: string
}

interface ReponsePage<T> {
  results?: T[]
  resultats?: T[]
  data?: T[]
  total?: number
  count?: number
  nombre_pages?: number
  total_pages?: number
  page_courante?: number
  current_page?: number
  suivante?: string | null
  precedente?: string | null
  next?: string | null
  previous?: string | null
}

function convertirPage<T>(
  donnees: unknown,
  pageDemandee: number,
  taille: number,
): PageResultat<T> {
  if (Array.isArray(donnees)) {
    return {
      resultats: donnees as T[],
      total: donnees.length,
      page: 1,
      nombrePages: 1,
    }
  }

  if (!donnees || typeof donnees !== 'object') {
    return {
      resultats: [],
      total: 0,
      page: pageDemandee,
      nombrePages: 1,
    }
  }

  const page = donnees as ReponsePage<T>
  const resultats = page.resultats ?? page.results ?? page.data ?? []
  const total = page.total ?? page.count ?? resultats.length
  const nombrePages =
    page.nombre_pages ??
    page.total_pages ??
    Math.max(1, Math.ceil(total / taille))
  const pageCourante = page.page_courante ?? page.current_page ?? pageDemandee

  return {
    resultats,
    total,
    page: pageCourante,
    nombrePages,
  }
}

/**
 * Liste les comptes ordinaires associés à une fiche de personnel.
 * Le backend réserve cet endpoint au rôle ROLE_ADMIN.
 */
export async function listerComptes(
  page = 1,
  recherche = '',
  taille = 20,
): Promise<PageResultat<CompteUtilisateur>> {
  const params: Record<string, string | number> = {
    page,
    taille,
  }

  if (recherche.trim()) {
    params.search = recherche.trim()
  }

  const { data } = await api.get<unknown>('/utilisateurs/', { params })

  return convertirPage<CompteUtilisateur>(data, page, taille)
}

/**
 * Récupère les fiches de personnel pouvant être associées aux comptes.
 * La recherche utilise le filtre SearchFilter exposé par l'API.
 */
export async function listerPersonnelsPourCompte(
  recherche = '',
): Promise<PersonnelPourCompte[]> {
  const params: Record<string, string | number> = {
    page: 1,
    taille: 200,
  }

  if (recherche.trim()) {
    params.search = recherche.trim()
  }

  const { data } = await api.get<unknown>('/personnels/', { params })

  return convertirPage<PersonnelPourCompte>(data, 1, 200).resultats
}

/**
 * Crée un compte lié à une fiche de personnel existante.
 * L'API génère le username à partir de l'IM et vérifie le mot de passe.
 */
export async function creerCompte(
  donnees: CreationCompte,
): Promise<CompteUtilisateur> {
  await initialiserCSRF()

  const { data } = await api.post<CompteUtilisateur>(
    '/utilisateurs/',
    donnees,
  )

  return data
}

/**
 * Modifie le rôle, l'adresse e-mail, l'état du compte ou le mot de passe.
 * Le backend reste responsable de vérifier les champs autorisés.
 */
export async function modifierCompte(
  id: number,
  donnees: ModificationCompte,
): Promise<CompteUtilisateur> {
  await initialiserCSRF()

  const { data } = await api.patch<CompteUtilisateur>(
    `/utilisateurs/${id}/`,
    donnees,
  )

  return data
}
