"""Notifications courriel déclenchées lorsqu'un justificatif est joint (RG-15)."""

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction

from personnels.enums import Role
from personnels.models import Personnel

from ..enums import TypeAbsence

logger = logging.getLogger(__name__)
TYPES_NOTIFIES = {
    TypeAbsence.MISSION,
    TypeAbsence.REPOS_SANITAIRE,
    TypeAbsence.MATERNITE,
    TypeAbsence.PATERNITE,
}


def _destinataires(demande):
    """Chef(s) du service et directeur(s) de la direction du demandeur."""
    personnel = demande.personnel
    emails = set()

    if personnel.service_id:
        emails.update(
            Personnel.objects.filter(
                service_id=personnel.service_id,
                compte__role__in=(Role.CHEF_SERVICE, Role.RH),
                email__gt="",
            ).values_list("email", flat=True)
        )

    emails.update(
        Personnel.objects.filter(
            direction_id=personnel.direction_id,
            compte__role=Role.DIRECTEUR,
            email__gt="",
        ).values_list("email", flat=True)
    )
    return sorted(email.strip() for email in emails if email and email.strip())


def _envoyer_notification(demande, destinataires):
    """Envoie une notification sans faire échouer le dépôt si le serveur mail est indisponible."""
    if not destinataires:
        return

    sujet = f"MEN — justificatif joint à {demande.numero_enregistrement or f'demande {demande.pk}'}"
    corps = (
        "Un justificatif vient d'être joint à une demande d'absence.\n\n"
        f"Demande : {demande.numero_enregistrement or demande.pk}\n"
        f"Agent : {demande.personnel.nom_complet} (IM {demande.personnel.im})\n"
        f"Type : {demande.get_type_absence_display()}\n"
        f"Période : du {demande.date_debut:%d/%m/%Y} au {demande.date_fin:%d/%m/%Y}\n\n"
        "Veuillez consulter l'intranet MEN pour ouvrir le dossier et sa pièce jointe."
    )

    try:
        send_mail(
            sujet,
            corps,
            getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@men.local"),
            destinataires,
            fail_silently=False,
        )
    except Exception:  # noqa: BLE001 - un mail indisponible ne doit pas perdre la demande
        logger.exception("Échec d'envoi de notification pour la demande %s", demande.pk)


def notifier_justificatif_joint(demande):
    """Planifie le courriel après validation transactionnelle de l'enregistrement."""
    if demande.type_absence not in TYPES_NOTIFIES or not demande.fichier_justificatif:
        return

    destinataires = _destinataires(demande)
    if not destinataires:
        logger.info("Aucun destinataire courriel configuré pour la demande %s", demande.pk)
        return

    transaction.on_commit(lambda: _envoyer_notification(demande, destinataires))
