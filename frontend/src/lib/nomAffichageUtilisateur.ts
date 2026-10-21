import type { Utilisateur } from "../types/auth"

const TITRES_ROLE: Record<Utilisateur["role"], string> = {
  ROLE_AGENT: "Agent",
  ROLE_CHEF_SERVICE: "Chef",
  ROLE_DIRECTEUR: "Directeur",
  ROLE_RH: "Responsable RH",
  ROLE_ADMIN: "Administrateur",
}

function premierNom(utilisateur: Utilisateur): string {
  const valeur = utilisateur.personnel?.prenoms?.trim() || utilisateur.personnel?.nom?.trim() || utilisateur.username || "Utilisateur"
  const premier = valeur.split(/\s+/)[0]
  return premier.charAt(0).toLocaleUpperCase("fr-FR") + premier.slice(1).toLocaleLowerCase("fr-FR")
}

export function nomAffichageUtilisateur(utilisateur: Utilisateur | null | undefined): string {
  if (!utilisateur) return "Utilisateur"
  return `${TITRES_ROLE[utilisateur.role]} ${premierNom(utilisateur)}`
}
