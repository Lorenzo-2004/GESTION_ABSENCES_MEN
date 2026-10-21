"""Contrôles de quotas (RG-01, RG-03, RG-04) et de chevauchement."""

from collections import Counter
from datetime import date

from django.core.exceptions import ValidationError
from django.db.models import Q, Sum

from ..enums import TypeAbsence
from ..models import DemandeAbsence
from ..regles import (
    STATUTS_ACTIFS,
    STATUTS_EN_COURS,
    STATUTS_OCCUPANTS,
    iter_jours,
    plafond_annuel,
    plafond_mensuel,
)


def annees_couvertes(demande) -> list[int]:
    """Années civiles touchées par les dates de la demande."""
    if not demande.date_debut or not demande.date_fin or demande.date_fin < demande.date_debut:
        return []
    return sorted({jour.year for jour in iter_jours(demande.date_debut, demande.date_fin)})


def _compteurs(jours) -> tuple[Counter, Counter]:
    """Compte les jours par (année, mois) et par année."""
    par_mois, par_annee = Counter(), Counter()
    for jour in jours:
        par_mois[(jour.year, jour.month)] += 1
        par_annee[jour.year] += 1
    return par_mois, par_annee


def demandes_concurrentes(demande, statuts=STATUTS_ACTIFS, meme_type=True):
    """Demandes du même agent qui chevauchent les années civiles ciblées."""
    annees = annees_couvertes(demande)
    if not annees:
        return DemandeAbsence.objects.none()

    criteres = {
        "personnel_id": demande.personnel_id,
        "statut_demande__in": tuple(statuts),
        "date_debut__lte": date(max(annees), 12, 31),
        "date_fin__gte": date(min(annees), 1, 1),
    }
    if meme_type:
        criteres["type_absence"] = demande.type_absence

    requete = DemandeAbsence.objects.filter(**criteres)
    if demande.pk:
        requete = requete.exclude(pk=demande.pk)
    return requete


def jours_deja_consommes(demande) -> tuple[Counter, Counter]:
    """Compteurs des jours déjà utilisés par les demandes actives du même type."""
    jours_existants = (
        jour
        for existante in demandes_concurrentes(demande)
        for jour in iter_jours(existante.date_debut, existante.date_fin)
    )
    return _compteurs(jours_existants)


def verifier_plafonds(demande):
    """Applique les plafonds mensuels et annuels (RG-01)."""
    max_mensuel = plafond_mensuel(demande.type_absence)
    max_annuel = plafond_annuel(demande.type_absence)
    if max_mensuel is None or max_annuel is None:
        return

    mois_nouveaux, annees_nouvelles = _compteurs(iter_jours(demande.date_debut, demande.date_fin))
    mois_existants, annees_existantes = jours_deja_consommes(demande)

    for (annee, mois), nombre in mois_nouveaux.items():
        if mois_existants[(annee, mois)] + nombre > max_mensuel:
            raise ValidationError(
                f"Plafond mensuel dépassé : {max_mensuel} jour(s) maximum par mois "
                f"pour {demande.get_type_absence_display()} (RG-01)."
            )

    for annee, nombre in annees_nouvelles.items():
        if annees_existantes[annee] + nombre > max_annuel:
            raise ValidationError(
                f"Plafond annuel dépassé : {max_annuel} jour(s) maximum par an "
                f"pour {demande.get_type_absence_display()} (RG-01)."
            )


def verifier_absence_de_chevauchement(demande):
    """Interdit deux demandes qui couvrent les mêmes jours pour le même agent."""
    if not demande.date_debut or not demande.date_fin or demande.date_fin < demande.date_debut:
        return
    jours_demandes = set(iter_jours(demande.date_debut, demande.date_fin))
    for existante in demandes_concurrentes(demande, statuts=STATUTS_OCCUPANTS, meme_type=False):
        conflit = jours_demandes & set(iter_jours(existante.date_debut, existante.date_fin))
        if conflit:
            raise ValidationError(
                {
                    "date_debut": (
                        f"Chevauchement avec la demande "
                        f"{existante.numero_enregistrement or existante.pk} "
                        f"du {existante.date_debut:%d/%m/%Y} au {existante.date_fin:%d/%m/%Y} "
                        f"(premier jour en conflit : {min(conflit):%d/%m/%Y})."
                    )
                }
            )


def verifier_solde_conge_annuel(demande, nombre_jours):
    """Vérifie la décision RH préalable et le solde mobilisable (RG-03/RG-04)."""
    personnel = demande.personnel
    annee = demande.annee

    if personnel.est_stagiaire:
        raise ValidationError({"type_absence": "Les stagiaires n'ont pas droit au congé annuel (RG-02)."})

    if not personnel.verifier_decision_annuelle(annee):
        raise ValidationError(
            {"type_absence": f"Aucune décision de congé valide enregistrée par la RH pour {annee} (RG-04)."}
        )

    solde = personnel.get_solde_actif(annee)
    if solde is None:
        raise ValidationError(
            f"Aucun solde de congé activé pour {annee}. La RH doit enregistrer la décision annuelle."
        )

    # La vue persiste une DemandeAbsence avant d'appeler ce service. Il faut donc
    # exclure la demande courante de l'engagement, sinon ses jours sont comptés deux fois.
    engagements = DemandeAbsence.objects.filter(
        personnel_id=personnel.pk,
        type_absence=TypeAbsence.CONGE_ANNUEL,
        statut_demande__in=STATUTS_EN_COURS,
    ).filter(
        Q(annee_titre=annee)
        | Q(annee_titre__isnull=True, date_debut__year=annee)
    )
    if demande.pk:
        engagements = engagements.exclude(pk=demande.pk)
    jours_engages = engagements.aggregate(total=Sum("nombre_jours"))["total"] or 0
    disponibles = solde.solde_restant - jours_engages
    if nombre_jours > disponibles:
        raise ValidationError(
            f"Solde insuffisant : {max(disponibles, 0)} jour(s) disponible(s) sur {annee} "
            f"({solde.solde_restant} au solde, dont {jours_engages} déjà engagé(s) "
            f"par d'autres demandes en cours), pour {nombre_jours} jour(s) demandé(s)."
        )
    return solde


def verifier_tranches_conge_annuel(demande, nombre_jours):
    """Compatibilité avec d'anciens appels : le CDC ne fixe aucune tranche minimale.

    La règle historique imposant une première tranche de 15 jours ne fait pas partie
    des règles RG-01 à RG-18. La fonction est volontairement sans effet et pourra être
    supprimée une fois tous les anciens déploiements mis à jour.
    """
    return None
