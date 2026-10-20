"""Règles de gestion réglementaires du MEN (CDC §4, RG-01 à RG-10).

Ce module ne contient que des constantes et des fonctions pures : il ne dépend
d'aucun modèle, ce qui le rend testable isolément et réutilisable par l'API.
"""

from datetime import date, timedelta

from .enums import StatutDemande, TypeAbsence

DROIT_ANNUEL_DEFAUT = 30  # jours calendaires / an pour Fonctionnaires et ECD

# RG-01 : type -> (plafond mensuel, plafond annuel) en jours
PLAFONDS = {
    TypeAbsence.PERMISSION: (3, 15),
    TypeAbsence.AUTORISATION: (5, 30),
}

# Durées maximales réglementaires (CDC §3.1)
DUREE_MAX_JOURS = {
    TypeAbsence.MATERNITE: 90,  # RG-14 : compteur fixe de 90 jours
    TypeAbsence.PATERNITE: 15,
}

# RG-08 : pièces justificatives obligatoires
JUSTIFICATIF_OBLIGATOIRE = {
    TypeAbsence.MISSION,
    TypeAbsence.REPOS_SANITAIRE,
    TypeAbsence.MATERNITE,
    TypeAbsence.PATERNITE,
}

# RG-07 : observation motivée obligatoire pour les demandes de faveur
TYPES_AVEC_OBSERVATION_OBLIGATOIRE = {
    TypeAbsence.PERMISSION,
    TypeAbsence.AUTORISATION,
}

# RG-04 : seules les demandes de congé annuel exigent une décision RH préalable
TYPES_SOUMIS_DECISION_RH = {TypeAbsence.CONGE_ANNUEL}

# RG-02 : les stagiaires n'ont accès ni au congé annuel ni aux congés familiaux
TYPES_INTERDITS_AUX_STAGIAIRES = {
    TypeAbsence.CONGE_ANNUEL,
    TypeAbsence.MATERNITE,
    TypeAbsence.PATERNITE,
}

# Congés réservés à un sexe (CDC §3.1)
TYPES_RESERVES_AUX_FEMMES = {TypeAbsence.MATERNITE}
TYPES_RESERVES_AUX_HOMMES = {TypeAbsence.PATERNITE}

# Demandes qui consomment des jours d'un quota (plafonds RG-01)
STATUTS_ACTIFS = (
    StatutDemande.EN_ATTENTE,
    StatutDemande.APPROUVE_CS,
    StatutDemande.VALIDE_DIR,
    StatutDemande.ARCHIVEE,
)

# Demandes encore dans le circuit : seules celles-là peuvent être modifiées ou annulées
STATUTS_EN_COURS = (StatutDemande.EN_ATTENTE,)

# Demandes définitivement closes
STATUTS_CLOS = (StatutDemande.REJETE, StatutDemande.ARCHIVEE)

# Demandes qui occupent le calendrier de l'agent : tant qu'une demande couvre des
# journées et qu'elle est dans le circuit ou validée, aucune autre ne peut couvrir
# les mêmes journées (une personne ne peut pas être absente deux fois en même temps).
STATUTS_OCCUPANTS = (
    StatutDemande.EN_ATTENTE,
    StatutDemande.APPROUVE_CS,
    StatutDemande.VALIDE_DIR,
    StatutDemande.ARCHIVEE,
)

# Une demande de congé annuel qui occupe le calendrier immobilise aussi des jours de solde
STATUTS_CONSOMMANT_LE_SOLDE = STATUTS_OCCUPANTS

EXTENSIONS_JUSTIFICATIF_AUTORISEES = (
    ".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff",
)
TAILLE_MAX_JUSTIFICATIF_OCTETS = 15 * 1024 * 1024  # 15 Mo


def nombre_jours_calendaires(debut: date, fin: date) -> int:
    """Nombre de jours calendaires entre deux dates, bornes incluses (CDC §3.1)."""
    return (fin - debut).days + 1


def iter_jours(debut: date, fin: date):
    """Itère sur chaque date couverte par la période, bornes incluses."""
    total = nombre_jours_calendaires(debut, fin)
    return (debut + timedelta(days=decalage) for decalage in range(total))


def annee_de_reference(debut: date) -> int:
    """Année d'imputation d'une absence : celle de sa date de début."""
    return debut.year


def plafond_mensuel(type_absence) -> int | None:
    """Plafond mensuel d'un type d'absence, ou None si ce type n'est pas plafonné."""
    bornes = PLAFONDS.get(type_absence)
    return bornes[0] if bornes else None


def plafond_annuel(type_absence) -> int | None:
    """Plafond annuel d'un type d'absence, ou None si ce type n'est pas plafonné."""
    bornes = PLAFONDS.get(type_absence)
    return bornes[1] if bornes else None


def duree_maximale(type_absence) -> int | None:
    """Durée maximale d'un type d'absence, ou None s'il n'y a pas de maximum."""
    return DUREE_MAX_JOURS.get(type_absence)
