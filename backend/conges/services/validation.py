"""Circuit hiérarchique du MEN, y compris la validation effective par le chef (RG-13)."""

from django.core.exceptions import ValidationError
from django.db import transaction

from personnels.enums import Role
from personnels.models import Personnel

from ..enums import Avis, Niveau, StatutDemande, TypeAbsence
from ..models import DemandeAbsence, SoldeConge, ValidationWorkflow
from ..regles import TYPES_AVEC_OBSERVATION_OBLIGATOIRE


def _niveau_du_valideur(valideur):
    compte = getattr(valideur, "compte", None)
    role = compte.role if compte else None
    if role in (Role.CHEF_SERVICE, Role.RH):
        return Niveau.CHEF_SERVICE
    if role == Role.DIRECTEUR:
        return Niveau.DIRECTEUR
    raise ValidationError("Seuls le chef de service et le directeur peuvent valider une demande.")


def _verifier_communs(demande, valideur, avis, observation):
    if avis not in Avis.values:
        raise ValidationError({"avis": "Avis invalide."})
    if valideur.pk == demande.personnel_id:
        raise ValidationError("Vous ne pouvez pas valider votre propre demande.")
    if demande.type_absence in TYPES_AVEC_OBSERVATION_OBLIGATOIRE and not (observation or "").strip():
        raise ValidationError({"observation": "Une observation motivée est obligatoire (RG-07)."})


def _statut_apres_avis_chef(demande, valideur, avis_favorable):
    if demande.statut_demande != StatutDemande.EN_ATTENTE:
        raise ValidationError("Cette demande n'est plus en attente de visa.")
    if demande.personnel.est_chef_de_service:
        raise ValidationError("La demande d'un chef de service va directement au directeur (RG-10).")
    if valideur.service_id is None or valideur.service_id != demande.personnel.service_id:
        raise ValidationError("Cette demande n'appartient pas à votre service.")
    return StatutDemande.APPROUVE_CS if avis_favorable else StatutDemande.REJETE


def _statut_apres_decision_directeur(demande, valideur, avis_favorable):
    if valideur.direction_id != demande.personnel.direction_id:
        raise ValidationError("Cette demande n'appartient pas à votre direction.")

    demandeur = demande.personnel
    if demande.statut_demande == StatutDemande.APPROUVE_CS:
        # RG-13 : l'accord du chef est la validation effective; le directeur enregistre le visa.
        if not avis_favorable:
            raise ValidationError(
                "La demande est déjà validée par le chef de service ; le visa du directeur est formel (RG-13)."
            )
        return StatutDemande.VALIDE_DIR

    if demande.statut_demande == StatutDemande.EN_ATTENTE and demandeur.est_chef_de_service:
        # RG-10 : pour sa propre demande, le chef contourne son niveau et le directeur décide.
        return StatutDemande.VALIDE_DIR if avis_favorable else StatutDemande.REJETE

    raise ValidationError("Cette demande n'est pas en attente de décision du directeur.")


def _decompter_le_solde(demande):
    """Débite seulement le quota annuel, en tenant compte des autres demandes en attente."""
    if demande.type_absence != TypeAbsence.CONGE_ANNUEL or demande.personnel.est_stagiaire:
        return None

    try:
        solde = SoldeConge.objects.select_for_update().get(
            personnel_id=demande.personnel_id,
            annee=demande.annee,
        )
    except SoldeConge.DoesNotExist as exc:
        raise ValidationError("Aucun solde de congé activé pour cette année.") from exc

    disponibles = solde.jours_disponibles()
    if demande.nombre_jours > disponibles:
        raise ValidationError(
            f"Solde insuffisant à la validation : {disponibles} jour(s) disponible(s), "
            f"{demande.nombre_jours} demandé(s)."
        )
    solde.deduire_jours(demande.nombre_jours)
    return solde


@transaction.atomic
def enregistrer_avis(demande, valideur, avis, observation=""):
    """Enregistre le visa, avec verrouillage du dossier et sans double débit du solde."""
    # Même verrou par agent que pour la soumission : protège les quotas contre les
    # validations/soumissions simultanées qui touchent le même solde.
    Personnel.objects.select_for_update().get(pk=demande.personnel_id)
    demande = DemandeAbsence.objects.select_for_update().select_related("personnel").get(pk=demande.pk)
    niveau = _niveau_du_valideur(valideur)
    _verifier_communs(demande, valideur, avis, observation)
    avis_favorable = avis == Avis.FAVORABLE
    statut_initial = demande.statut_demande

    if niveau == Niveau.CHEF_SERVICE:
        nouveau_statut = _statut_apres_avis_chef(demande, valideur, avis_favorable)
    else:
        nouveau_statut = _statut_apres_decision_directeur(demande, valideur, avis_favorable)

    validation = ValidationWorkflow.objects.create(
        demande=demande,
        valideur=valideur,
        niveau=niveau,
        avis=avis,
        observation=(observation or "").strip(),
    )
    demande.statut_demande = nouveau_statut
    demande.save(update_fields=["statut_demande"])

    # RG-13 : débit à l'accord du chef; pour la demande propre d'un chef, au visa du directeur.
    debit_effectif = (
        niveau == Niveau.CHEF_SERVICE and nouveau_statut == StatutDemande.APPROUVE_CS
    ) or (
        niveau == Niveau.DIRECTEUR
        and statut_initial == StatutDemande.EN_ATTENTE
        and demande.personnel.est_chef_de_service
        and nouveau_statut == StatutDemande.VALIDE_DIR
    )
    if debit_effectif:
        _decompter_le_solde(demande)

    return validation
