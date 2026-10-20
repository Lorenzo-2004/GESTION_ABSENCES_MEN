
import { api, initialiserCSRF } from '../lib/api'

export type TypeAbsence =
  | 'CONGE_ANNUEL'
  | 'PERMISSION'
  | 'AUTORISATION'
  | 'MISSION'
  | 'MATERNITE'
  | 'PATERNITE'
  | 'REPOS_SANITAIRE'

export interface NouvelleDemande {
  /** Un chef peut saisir une demande déléguée pour un personnel de son service. */
  personnel?: number
  type_absence: TypeAbsence
  /** Année de droits imputée ; obligatoire pour un congé annuel. */
  annee_titre?: number
  /** Obligatoire pour les demandes de maternité et de paternité (RG-11). */
  date_evenement_prevue?: string
  motif: string
  date_debut: string
  date_fin: string
  lieu_jouissance: string
  fichier_justificatif?: File | null
}

export interface DemandeCreee {
  id_demande: number
  numero_enregistrement: string | null
  type_absence: TypeAbsence
  annee_titre?: number | null
  date_evenement_prevue?: string | null
  type_absence_libelle?: string
  statut_demande: string
  statut_libelle?: string
  date_debut: string
  date_fin: string
  nombre_jours: number
}

export async function creerDemandeConge(
  demande: NouvelleDemande,
): Promise<DemandeCreee> {
  await initialiserCSRF()

  const donnees = new FormData()

  if (demande.personnel !== undefined) {
    donnees.append('personnel', String(demande.personnel))
  }

  donnees.append('type_absence', demande.type_absence)

  if (demande.type_absence === 'CONGE_ANNUEL' && demande.annee_titre !== undefined) {
    donnees.append('annee_titre', String(demande.annee_titre))
  }

  if (
    (demande.type_absence === 'MATERNITE' || demande.type_absence === 'PATERNITE') &&
    demande.date_evenement_prevue
  ) {
    donnees.append('date_evenement_prevue', demande.date_evenement_prevue)
  }

  donnees.append('motif', demande.motif)
  donnees.append('date_debut', demande.date_debut)
  donnees.append('date_fin', demande.date_fin)
  donnees.append('lieu_jouissance', demande.lieu_jouissance)

  if (demande.fichier_justificatif) {
    donnees.append(
      'fichier_justificatif',
      demande.fichier_justificatif,
    )
  }

  const { data } = await api.post<DemandeCreee>(
    '/demandes/',
    donnees,
  )

  return data
}
