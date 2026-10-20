
import { api } from '../lib/api'

export interface DroitsAnnuels {
  annee: number
  actif: boolean
  droit_annuel: number
  report_anterieur: number
  jours_pris: number
  jours_engages: number
  solde_restant: number
  jours_disponibles: number
  decision_valide: boolean
}

export async function obtenirMesDroits(
  annee: number,
): Promise<DroitsAnnuels> {
  const { data } = await api.get<DroitsAnnuels>('/mes-droits/', {
    params: { annee },
  })

  return data
}
