"""Soumission, règles de dépôt et justificatifs (RG-01 à RG-15)."""

import calendar
import logging

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from personnels.enums import Sexe
from personnels.models import Personnel

from ..enums import StatutDemande, TypeAbsence
from ..regles import (
    EXTENSIONS_JUSTIFICATIF_AUTORISEES,
    JUSTIFICATIF_OBLIGATOIRE,
    TAILLE_MAX_JUSTIFICATIF_OCTETS,
    TYPES_INTERDITS_AUX_STAGIAIRES,
    TYPES_PERIODE_AUTOMATIQUE,
    TYPES_AVEC_FORMULAIRE_OFFICIEL,
    TYPES_RESERVES_AUX_FEMMES,
    TYPES_RESERVES_AUX_HOMMES,
    duree_maximale,
    periode_automatique,
)
from . import quotas
from .notifications import notifier_justificatif_joint

logger = logging.getLogger(__name__)


def appliquer_periode_automatique(demande):
    """Maternité / paternité : déduit début et fin de la date prévue (90 j / 15 j).

    Toute date saisie par le client est écrasée : la période réglementaire est
    calculée par le système, jamais déclarée par l'agent.
    """
    if demande.type_absence not in TYPES_PERIODE_AUTOMATIQUE:
        return
    if demande.date_evenement_prevue is None:
        raise ValidationError({
            "date_evenement_prevue": "La date prévue de l'accouchement est obligatoire (RG-11)."
        })
    demande.date_debut, demande.date_fin = periode_automatique(
        demande.type_absence, demande.date_evenement_prevue
    )


def verifier_dossier_complet(demande):
    """Contrôle les champs du formulaire officiel pour les trois types concernés.

    Maternité, paternité, mission et repos sanitaire sont des annonces : elles ne
    nécessitent pas la fiche officielle MEN (RG-16).
    """
    if demande.type_absence not in TYPES_AVEC_FORMULAIRE_OFFICIEL:
        return

    personnel = demande.personnel
    manquants = []
    champs = {
        "nom": personnel.nom_complet,
        "IM": personnel.im,
        "corps": personnel.corps,
        "grade": personnel.grade,
        "service ou direction": personnel.service or personnel.direction,
        "motif": demande.motif,
        "lieu de jouissance": demande.lieu_jouissance,
        "date de début": demande.date_debut,
        "date de fin": demande.date_fin,
    }
    for libelle, valeur in champs.items():
        if valeur is None or (isinstance(valeur, str) and not valeur.strip()):
            manquants.append(libelle)

    if demande.type_absence in TYPES_PERIODE_AUTOMATIQUE and demande.date_evenement_prevue is None:
        manquants.append("date prévue de l'accouchement")

    if manquants:
        raise ValidationError(
            "Formulaire incomplet : champs obligatoires manquants : " + ", ".join(manquants) + "."
        )


def _verifier_coherence_des_dates(demande):
    if not (demande.date_debut and demande.date_fin):
        raise ValidationError("Les dates de début et de fin sont obligatoires.")
    if demande.date_fin < demande.date_debut:
        raise ValidationError({"date_fin": "La date de fin précède la date de début."})


def _verifier_eligibilite(demande):
    """RG-02 et restrictions d'éligibilité par public/sexe."""
    personnel = demande.personnel

    if personnel.est_stagiaire and demande.type_absence in TYPES_INTERDITS_AUX_STAGIAIRES:
        if demande.type_absence == TypeAbsence.CONGE_ANNUEL:
            message = "Les stagiaires n'ont pas droit au congé annuel (RG-02)."
        else:
            message = "Ce congé est réservé aux fonctionnaires et aux ECD."
        raise ValidationError({"type_absence": message})

    if demande.type_absence in TYPES_RESERVES_AUX_FEMMES and personnel.sexe != Sexe.FEMININ:
        raise ValidationError({"type_absence": "Le congé de maternité est réservé aux mères."})
    if demande.type_absence in TYPES_RESERVES_AUX_HOMMES and personnel.sexe != Sexe.MASCULIN:
        raise ValidationError({"type_absence": "Le congé de paternité est réservé aux pères."})


def _ajouter_mois(jour, nombre_mois):
    """Ajoute des mois calendaires en conservant un jour valide en fin de mois."""
    index = jour.year * 12 + (jour.month - 1) + nombre_mois
    annee, mois_zero = divmod(index, 12)
    mois = mois_zero + 1
    jour_mois = min(jour.day, calendar.monthrange(annee, mois)[1])
    return jour.replace(year=annee, month=mois, day=jour_mois)


def verifier_delai_de_depot(demande, aujourdhui=None):
    """Applique RG-11 ; le mode test peut désactiver les fenêtres de temps."""
    aujourdhui = aujourdhui or timezone.localdate()
    type_absence = demande.type_absence

    # La date prévue est une donnée métier obligatoire, même lorsque les tests
    # désactivent les bornes temporelles pour utiliser des dates historiques.
    if type_absence in (TypeAbsence.MATERNITE, TypeAbsence.PATERNITE):
        if demande.date_evenement_prevue is None:
            raise ValidationError({
                "date_evenement_prevue": "La date prévue de l'accouchement est obligatoire (RG-11)."
            })

    if not getattr(settings, "MEN_APPLIQUER_DELAIS_REGLEMENTAIRES", True):
        return

    if type_absence == TypeAbsence.CONGE_ANNUEL:
        delai = (demande.date_debut - aujourdhui).days
        if not 14 <= delai <= 30:
            raise ValidationError({
                "date_debut": (
                    "Le congé annuel doit être déposé entre 14 et 30 jours avant "
                    "sa date de début (RG-11)."
                )
            })

    elif type_absence == TypeAbsence.MISSION:
        delai = (demande.date_debut - aujourdhui).days
        if delai < 7:
            raise ValidationError({
                "date_debut": "Une mission doit être déposée au moins 7 jours avant son début (RG-11)."
            })

    elif type_absence == TypeAbsence.MATERNITE:
        evenement = demande.date_evenement_prevue
        if evenement is None:
            raise ValidationError({
                "date_evenement_prevue": "La date prévue de l'accouchement est obligatoire (RG-11)."
            })
        premiere_date = _ajouter_mois(aujourdhui, 1)
        derniere_date = _ajouter_mois(aujourdhui, 3)
        if not premiere_date <= evenement <= derniere_date:
            raise ValidationError({
                "date_evenement_prevue": (
                    "La demande de maternité doit être déposée entre un et trois mois "
                    "avant la date prévue de l'accouchement (RG-11)."
                )
            })

    elif type_absence == TypeAbsence.PATERNITE:
        evenement = demande.date_evenement_prevue
        if evenement is None:
            raise ValidationError({
                "date_evenement_prevue": "La date prévue de l'accouchement est obligatoire (RG-11)."
            })
        delai = (evenement - aujourdhui).days
        if not 14 <= delai <= 30:
            raise ValidationError({
                "date_evenement_prevue": (
                    "La demande de paternité doit être déposée entre 14 et 30 jours "
                    "avant la date prévue de l'accouchement (RG-11)."
                )
            })


def _verifier_duree_maximale(demande, nombre_jours):
    # RG-14 : ces deux compteurs sont fixes, pas de simples plafonds.
    durees_fixes = {
        TypeAbsence.MATERNITE: 90,
        TypeAbsence.PATERNITE: 15,
    }
    if demande.type_absence in durees_fixes:
        attendue = durees_fixes[demande.type_absence]
        if nombre_jours != attendue:
            raise ValidationError({
                "date_fin": (
                    f"La durée réglementaire de {demande.get_type_absence_display()} "
                    f"est fixée à {attendue} jours calendaires (RG-14)."
                )
            })
        return

    maximum = duree_maximale(demande.type_absence)
    if maximum is not None and nombre_jours > maximum:
        raise ValidationError({
            "date_fin": (
                f"Durée maximale dépassée : {maximum} jours pour "
                f"{demande.get_type_absence_display()}."
            )
        })


def _verifier_justificatif(demande):
    """RG-08 : aucune pièce n'est exigée aujourd'hui (JUSTIFICATIF_OBLIGATOIRE est vide)."""
    if demande.type_absence in JUSTIFICATIF_OBLIGATOIRE and not demande.fichier_justificatif:
        raise ValidationError({
            "fichier_justificatif": "Un justificatif est obligatoire pour ce type d'absence (RG-08)."
        })


def valider_fichier_justificatif(fichier):
    """Contrôle extension, taille et présence du contenu avant enregistrement."""
    if fichier is None:
        raise ValidationError({"fichier_justificatif": "Aucun fichier fourni."})

    nom = (getattr(fichier, "name", "") or "").lower()
    if not nom.endswith(EXTENSIONS_JUSTIFICATIF_AUTORISEES):
        formats = ", ".join(EXTENSIONS_JUSTIFICATIF_AUTORISEES)
        raise ValidationError({"fichier_justificatif": f"Format non autorisé. Formats acceptés : {formats}."})

    taille = getattr(fichier, "size", 0) or 0
    if taille <= 0:
        raise ValidationError({"fichier_justificatif": "Le fichier justificatif est vide."})
    if taille > TAILLE_MAX_JUSTIFICATIF_OCTETS:
        limite_mo = TAILLE_MAX_JUSTIFICATIF_OCTETS // (1024 * 1024)
        raise ValidationError({"fichier_justificatif": f"Le fichier dépasse la taille maximale de {limite_mo} Mo."})

    signatures = {
        ".pdf": (b"%PDF-",),
        ".jpg": (b"\xff\xd8\xff",),
        ".jpeg": (b"\xff\xd8\xff",),
        ".png": (b"\x89PNG\r\n\x1a\n",),
        ".tif": (b"II*\x00", b"MM\x00*"),
        ".tiff": (b"II*\x00", b"MM\x00*"),
    }
    extension = next((ext for ext in signatures if nom.endswith(ext)), None)
    position = fichier.tell() if hasattr(fichier, "tell") else None
    try:
        entete = fichier.read(8)
    finally:
        if position is not None and hasattr(fichier, "seek"):
            fichier.seek(position)
    if extension is None or not any(entete.startswith(sig) for sig in signatures[extension]):
        raise ValidationError({
            "fichier_justificatif": "Le contenu du fichier ne correspond pas à son extension."
        })


def verifier_regles(demande):
    """Applique les règles métier de soumission et renvoie le nombre de jours."""
    appliquer_periode_automatique(demande)
    _verifier_coherence_des_dates(demande)
    _verifier_eligibilite(demande)
    verifier_dossier_complet(demande)

    nombre_jours = demande.calculer_nombre_jours()
    _verifier_duree_maximale(demande, nombre_jours)
    verifier_delai_de_depot(demande)
    _verifier_justificatif(demande)

    # Un agent ne peut pas être comptabilisé deux fois sur les mêmes journées.
    quotas.verifier_absence_de_chevauchement(demande)

    # RG-03 / RG-04 : seuls les congés annuels utilisent le solde annuel.
    if demande.type_absence == TypeAbsence.CONGE_ANNUEL:
        quotas.verifier_solde_conge_annuel(demande, nombre_jours)

    # RG-01 : plafond mensuel et annuel des permissions/autorisations uniquement.
    quotas.verifier_plafonds(demande)
    return nombre_jours


@transaction.atomic
def soumettre_demande(demande):
    """Vérifie les règles et enregistre la demande, avec verrou par agent."""
    # Sérialise les contrôles de plafond et de solde pour les demandes concurrentes du même agent.
    Personnel.objects.select_for_update().get(pk=demande.personnel_id)
    verifier_regles(demande)
    demande.statut_demande = StatutDemande.EN_ATTENTE
    demande.save()

    if demande.fichier_justificatif:
        notifier_justificatif_joint(demande)
    return demande


@transaction.atomic
def joindre_justificatif(demande, fichier):
    """Attache une pièce validée et déclenche les notifications RG-15."""
    valider_fichier_justificatif(fichier)
    demande = type(demande).objects.select_for_update().get(pk=demande.pk)
    demande.fichier_justificatif = fichier
    demande.save(update_fields=["fichier_justificatif"])
    notifier_justificatif_joint(demande)
    return demande