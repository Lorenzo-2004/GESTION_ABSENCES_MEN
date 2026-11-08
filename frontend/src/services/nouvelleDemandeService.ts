
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
  /** Obligatoire pour les demandes de maternité et de paternité. */
  date_evenement_prevue?: string
  motif: string
  /** Facultatives côté formulaire pour maternité/paternité : la période est calculée automatiquement. */
  date_debut?: string
  date_fin?: string
  lieu_jouissance: string
  /** PNG dessiné dans le champ de signature avant l'envoi. */
  signature_agent: string
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
  date_signature_agent?: string | null
  signature_agent_sha256?: string
  signature_agent_compte?: string | null
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

  const periodeAutomatique =
    demande.type_absence === 'MATERNITE' || demande.type_absence === 'PATERNITE'

  // Pour maternité/paternité, les dates de début, de fin et la durée sont calculées automatiquement.
  if (!periodeAutomatique) {
    if (demande.date_debut) donnees.append('date_debut', demande.date_debut)
    if (demande.date_fin) donnees.append('date_fin', demande.date_fin)
  }

  donnees.append('lieu_jouissance', demande.lieu_jouissance)
  donnees.append('signature_agent', demande.signature_agent)

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


export interface RegleTrancheAnnuelle {
  annee_titre: number
  personnel_id: number
  premiere_tranche: boolean
  jours_obligatoires: number | null
  jours_minimum: number
  jours_maximum: number
  historique_incoherent: boolean
  message_historique: string
  nombre_tranches_existantes: number
  message: string
}

/** Retourne la règle de tranche de l'agent pour l'année de titre choisie. */
export async function recupererRegleTrancheAnnuelle(
  anneeTitre: number,
  personnelId?: number,
): Promise<RegleTrancheAnnuelle> {
  const { data } = await api.get<RegleTrancheAnnuelle>(
    '/demandes/regle-tranche-annuelle/',
    {
      params: {
        annee_titre: anneeTitre,
        ...(personnelId !== undefined ? { personnel: personnelId } : {}),
      },
    },
  )
  return data
}
