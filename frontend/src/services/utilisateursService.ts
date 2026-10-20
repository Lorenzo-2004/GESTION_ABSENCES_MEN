import { api, initialiserCSRF } from '../lib/api'

export interface CompteUtilisateur {
  id: number
  username: string
  email: string
  role: string
  role_libelle: string
  personnel: number
  personnel_im: string
  personnel_nom: string
  personnel_direction: string
  is_active: boolean
  date_joined: string
  last_login: string | null
}

export interface PersonnelOption {
  id_personnel: number
  im: string
  nom: string
  prenoms: string
  nom_complet: string
  direction_libelle?: string
}

export interface PageAPI<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

interface ReponsePageAPI<T> {
  count?: number
  total?: number
  next?: string | null
  previous?: string | null
  results?: T[]
  resultats?: T[]
  suivante?: string | null
  precedente?: string | null
}

type ReponseListe<T> = T[] | ReponsePageAPI<T>

export interface CreationCompte {
  personnel: number
  role: string
  email: string
  is_active: boolean
  password: string
}

export interface ModificationCompte {
  email?: string
  role?: string
  is_active?: boolean
  password?: string
}

function normaliserPage<T>(
  donnees: ReponseListe<T>,
): PageAPI<T> {
  if (Array.isArray(donnees)) {
    return {
      count: donnees.length,
      next: null,
      previous: null,
      results: donnees,
    }
  }

  const results = donnees.results ?? donnees.resultats ?? []
  return {
    count: donnees.count ?? donnees.total ?? results.length,
    next: donnees.next ?? donnees.suivante ?? null,
    previous: donnees.previous ?? donnees.precedente ?? null,
    results,
  }
}

/**
 * Liste les comptes utilisateurs.
 * La recherche porte sur les champs définis par le backend.
 */
export async function listerUtilisateurs(
  recherche = '',
  page = 1,
): Promise<PageAPI<CompteUtilisateur>> {
  const { data } = await api.get<ReponseListe<CompteUtilisateur>>(
    '/utilisateurs/',
    {
      params: {
        page,
        ...(recherche.trim()
          ? { search: recherche.trim() }
          : {}),
      },
    },
  )

  return normaliserPage(data)
}

/**
 * Recherche les fiches de personnel disponibles
 * pour associer un compte utilisateur.
 */
export async function rechercherPersonnel(
  recherche = '',
  page = 1,
): Promise<PageAPI<PersonnelOption>> {
  const { data } = await api.get<ReponseListe<PersonnelOption>>(
    '/personnels/',
    {
      params: {
        page,
        ...(recherche.trim()
          ? { search: recherche.trim() }
          : {}),
      },
    },
  )

  return normaliserPage(data)
}

/**
 * Crée un compte lié à une fiche de personnel.
 * Le backend génère le nom d'utilisateur à partir de l'IM.
 */
export async function creerUtilisateur(
  compte: CreationCompte,
): Promise<CompteUtilisateur> {
  await initialiserCSRF()

  const { data } = await api.post<CompteUtilisateur>(
    '/utilisateurs/',
    compte,
  )

  return data
}

/**
 * Modifie le rôle, l'adresse e-mail, l'état du compte
 * ou le mot de passe.
 */
export async function modifierUtilisateur(
  id: number,
  modifications: ModificationCompte,
): Promise<CompteUtilisateur> {
  await initialiserCSRF()

  const { data } = await api.patch<CompteUtilisateur>(
    `/utilisateurs/${id}/`,
    modifications,
  )

  return data
}