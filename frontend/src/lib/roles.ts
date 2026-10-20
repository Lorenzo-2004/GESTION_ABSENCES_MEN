import type { Role } from '../types/auth'

/**
 * Les comptes Chef de service et RH conservent leurs fonctions métier,
 * tout en ayant accès à leur espace personnel d'agent.
 */
export function peutAccederEspaceAgent(role: Role | null | undefined): boolean {
  return role === 'ROLE_AGENT' || role === 'ROLE_CHEF_SERVICE' || role === 'ROLE_RH'
}
