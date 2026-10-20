export type Role =
  | 'ROLE_AGENT'
  | 'ROLE_CHEF_SERVICE'
  | 'ROLE_DIRECTEUR'
  | 'ROLE_RH'
  | 'ROLE_ADMIN'

export interface Personnel {
  id_personnel: number
  im: string
  cin: string
  nom: string
  prenoms: string
  nom_complet: string
  sexe: string
  date_naissance: string | null
  telephone: string
  email: string
  statut: string
  corps: string
  grade: string
  direction: number
  direction_libelle: string
  service: number | null
  service_libelle: string | null
  check_presence: boolean
}

export interface Utilisateur {
  id: number
  username: string
  email: string
  role: Role
  role_libelle: string
  personnel: Personnel | null
  last_login: string | null
}

export interface IdentifiantsConnexion {
  identifiant: string
  password: string
}

export interface ReponseConnexion {
  utilisateur: Utilisateur
}