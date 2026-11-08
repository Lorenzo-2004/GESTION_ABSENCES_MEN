
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
 * Charge toutes les pages d'une collection paginée par l'API MEN.
 * La taille demandée respecte le plafond backend (200 éléments par page).
 */
async function chargerToutesLesPages<T>(
  url: string,
  parametres: Record<string, string | number> = {},
): Promise<T[]> {
  const taille = 200
  const resultats: T[] = []
  let page = 1
  let nombrePages = 1

  do {
    const { data } = await api.get<unknown>(url, {
      params: { ...parametres, page, taille },
    })

    if (Array.isArray(data)) {
      resultats.push(...(data as T[]))
      break
    }

    if (!data || typeof data !== 'object') break

    const enveloppe = data as ReponsePage<T>
    resultats.push(...(enveloppe.resultats ?? enveloppe.results ?? enveloppe.data ?? []))
    nombrePages = Math.max(1, enveloppe.nombre_pages ?? enveloppe.total_pages ?? 1)
    page += 1
  } while (page <= nombrePages)

  return resultats
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
  const params: Record<string, string | number> = {}
  if (recherche.trim()) params.search = recherche.trim()
  return chargerToutesLesPages<PersonnelPourCompte>('/personnels/', params)
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

export type SexePersonnelAdmin = 'M' | 'F'
export type StatutPersonnelAdmin = 'FONCTIONNAIRE' | 'ECD' | 'STAGIAIRE'

export interface DirectionAdmin {
  id_direction: number
  code_direction: string
  nom_direction: string
}

export interface ServiceAdmin {
  id_service: number
  code_service: string
  nom_service: string
  direction: number
}

export interface PersonnelAdmin {
  id_personnel: number
  im: string
  cin: string
  nom: string
  prenoms: string
  sexe: SexePersonnelAdmin
  date_naissance: string
  telephone: string
  email: string
  statut: StatutPersonnelAdmin
  corps: string
  grade: string
  direction: number
  direction_libelle?: string
  service: number | null
  service_libelle?: string | null
  check_presence?: boolean
}

export interface DonneesPersonnelAdmin {
  im: string
  cin: string
  nom: string
  prenoms: string
  sexe: SexePersonnelAdmin
  date_naissance: string
  telephone: string
  email: string
  statut: StatutPersonnelAdmin
  corps: string
  grade: string
  direction: number
  service: number | null
  check_presence?: boolean
}

export async function listerAgentsAdmin(recherche = ''): Promise<PersonnelAdmin[]> {
  const params: Record<string, string | number> = {}
  if (recherche.trim()) params.search = recherche.trim()
  return chargerToutesLesPages<PersonnelAdmin>('/personnels/', params)
}

export async function listerDirectionsAdmin(): Promise<DirectionAdmin[]> {
  const donnees = await chargerToutesLesPages<Record<string, unknown>>('/directions/')
  return donnees.map((item) => ({
    id_direction: Number(item.id_direction ?? item.id),
    code_direction: String(item.code_direction ?? ''),
    nom_direction: String(item.nom_direction ?? item.nom ?? ''),
  })).filter((item) => Number.isFinite(item.id_direction) && item.code_direction && item.nom_direction)
}

export async function listerServicesAdmin(): Promise<ServiceAdmin[]> {
  const donnees = await chargerToutesLesPages<Record<string, unknown>>('/services/')
  return donnees.map((item) => ({
    id_service: Number(item.id_service ?? item.id),
    code_service: String(item.code_service ?? ''),
    nom_service: String(item.nom_service ?? item.nom ?? ''),
    direction: Number(item.direction ?? item.direction_id ?? item.id_direction),
  })).filter((item) => Number.isFinite(item.id_service) && Number.isFinite(item.direction) && item.code_service && item.nom_service)
}

export async function creerAgentAdmin(donnees: DonneesPersonnelAdmin): Promise<PersonnelAdmin> {
  await initialiserCSRF()
  const { data } = await api.post<PersonnelAdmin>('/personnels/', donnees)
  return data
}

export async function modifierAgentAdmin(
  id: number,
  donnees: DonneesPersonnelAdmin,
): Promise<PersonnelAdmin> {
  await initialiserCSRF()
  const { data } = await api.patch<PersonnelAdmin>(`/personnels/${id}/`, donnees)
  return data
}

export async function supprimerAgentAdmin(id: number): Promise<void> {
  await initialiserCSRF()
  await api.delete(`/personnels/${id}/`)
}
