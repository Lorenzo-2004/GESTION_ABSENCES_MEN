"""Soldes de congé : activation RH, report des reliquats et archivage (RG-03/RG-04/RG-12)."""

from django.core.exceptions import ValidationError
from django.db import transaction

from personnels.models import Personnel

from ..enums import StatutDemande, TypeAbsence
from ..models import DecisionConge, DemandeAbsence, SoldeConge
from ..regles import DROIT_ANNUEL_DEFAUT


def _verrouiller_personnel(personnel):
    """Verrou commun aux opérations de solde d'un même agent."""
    return Personnel.objects.select_for_update().get(pk=personnel.pk)


def _reliquat_a_reporter(personnel, annee):
    """Retourne le solde restant de l'année précédente, reports historiques inclus."""
    precedent = (
        SoldeConge.objects.select_for_update()
        .filter(personnel_id=personnel.pk, annee=annee - 1)
        .first()
    )
    if precedent is None:
        return 0
    # precedent.solde_restant = droit annuel + reports antérieurs - jours déjà pris.
    # Ne jamais ajouter report_anterieur une seconde fois.
    return max(precedent.solde_restant, 0)


@transaction.atomic
def propager_report(solde, strict=False):
    """Répercute le reliquat de `solde` sur les années suivantes, en cascade.

    Règle métier : le reliquat d'une année s'ajoute en entier au droit de la suivante,
    et ainsi de suite. Avec 30 j de droit : 10 j restants en N → 40 j en N+1 ; 20 j
    restants en N+1 → 50 j en N+2. Le report n'est donc jamais figé : dès que les jours
    pris d'une année changent, les années qui suivent (si elles existent) sont recalculées.

    `strict=True` refuse la modification si une année suivante deviendrait négative,
    c'est-à-dire si les jours reportés ont déjà été consommés sur cette année-là.
    """
    courant = solde
    while True:
        suivant = (
            SoldeConge.objects.select_for_update()
            .filter(personnel_id=courant.personnel_id, annee=courant.annee + 1)
            .first()
        )
        if suivant is None:
            return

        suivant.report_anterieur = max(courant.solde_restant, 0)
        suivant.calculer_solde_restant()
        if strict and suivant.solde_restant < 0:
            raise ValidationError(
                f"Ces jours ont déjà été utilisés sur l'année {suivant.annee} (report du reliquat) : "
                f"le solde de {suivant.annee} deviendrait négatif ({suivant.solde_restant} j)."
            )
        suivant.save(update_fields=["report_anterieur", "solde_restant"])
        courant = suivant


@transaction.atomic
def solde_ou_creer(personnel, annee, droit_annuel=DROIT_ANNUEL_DEFAUT):
    """Retourne (solde, créé) sans réinitialiser un solde déjà enregistré."""
    personnel = _verrouiller_personnel(personnel)
    solde = (
        SoldeConge.objects.select_for_update()
        .filter(personnel_id=personnel.pk, annee=annee)
        .first()
    )
    if solde is not None:
        return solde, False

    solde = SoldeConge.objects.create(
        personnel=personnel,
        annee=annee,
        droit_annuel=droit_annuel,
        report_anterieur=_reliquat_a_reporter(personnel, annee),
    )
    # Une année plus récente existait peut-être déjà : elle reprend le nouveau reliquat.
    propager_report(solde)
    return solde, True


@transaction.atomic
def reporter_reliquats(annee_source):
    """Reporte tous les reliquats de l'année source vers N+1, sans double comptage.

    L'opération peut être relancée : elle recopie le reliquat canonique de l'année source.
    Les droits annuels et jours déjà pris sur le solde cible sont préservés.
    """
    annee_cible = annee_source + 1
    soldes_reportes = []
    personnel_ids = list(
        SoldeConge.objects.filter(annee=annee_source)
        .order_by("personnel_id")
        .values_list("personnel_id", flat=True)
    )

    for personnel_id in personnel_ids:
        personnel = Personnel.objects.select_for_update().get(pk=personnel_id)
        source = (
            SoldeConge.objects.select_for_update()
            .filter(personnel_id=personnel.pk, annee=annee_source)
            .first()
        )
        if source is None:
            continue

        reliquat = max(source.solde_restant, 0)
        cible, cree = SoldeConge.objects.get_or_create(
            personnel=personnel,
            annee=annee_cible,
            defaults={
                "droit_annuel": source.droit_annuel,
                "report_anterieur": reliquat,
            },
        )
        if not cree:
            cible = SoldeConge.objects.select_for_update().get(pk=cible.pk)
            cible.report_anterieur = reliquat
            # save() recalcule solde_restant à partir des champs sources, tout en
            # conservant droit_annuel et jours_pris déjà enregistrés sur la cible.
            cible.save(update_fields=["report_anterieur", "solde_restant"])

        # Les années suivantes (N+2, N+3…) reprennent aussi le reliquat recalculé.
        propager_report(cible)
        soldes_reportes.append(cible)

    return soldes_reportes


@transaction.atomic
def valider_et_activer_par_rh(decision):
    """Valide une décision RH et crée les droits des années citées.

    Une décision n'active jamais les droits d'un stagiaire et l'activation ne
    réinitialise pas les soldes déjà présents (jours pris et reports conservés).
    """
    decision.clean()
    annees = sorted(set(decision.annees()))
    if not annees:
        raise ValidationError(
            "La décision ne cite aucune année exploitable dans son champ « années du titre »."
        )

    _verrouiller_personnel(decision.personnel)
    decision.est_valide = True
    decision.save()

    soldes = []
    for annee in annees:
        solde, _ = solde_ou_creer(
            decision.personnel,
            annee,
            droit_annuel=DROIT_ANNUEL_DEFAUT,
        )
        soldes.append(solde)
    return soldes


def droits_annuels_du_personnel(personnel, annee):
    """Synthèse des droits annuels destinée à l'API et au frontend."""
    solde = personnel.get_solde_actif(annee)
    if solde is None:
        return {
            "annee": annee,
            "actif": False,
            "droit_annuel": 0,
            "report_anterieur": 0,
            "jours_pris": 0,
            "jours_engages": 0,
            "solde_restant": 0,
            "jours_disponibles": 0,
            "decision_valide": personnel.verifier_decision_annuelle(annee),
        }

    return {
        "annee": annee,
        "actif": True,
        "droit_annuel": solde.droit_annuel,
        "report_anterieur": solde.report_anterieur,
        "jours_pris": solde.jours_pris,
        "jours_engages": solde.jours_engages(),
        "solde_restant": solde.solde_restant,
        "jours_disponibles": solde.jours_disponibles(),
        "decision_valide": personnel.verifier_decision_annuelle(annee),
    }


@transaction.atomic
def archiver_demandes(annee):
    """Archive les demandes ayant reçu le visa formel du directeur pour l'année."""
    return DemandeAbsence.objects.filter(
        type_absence__in=[
            TypeAbsence.CONGE_ANNUEL,
            TypeAbsence.PERMISSION,
            TypeAbsence.AUTORISATION,
            TypeAbsence.MISSION,
            TypeAbsence.MATERNITE,
            TypeAbsence.PATERNITE,
            TypeAbsence.REPOS_SANITAIRE,
        ],
        statut_demande=StatutDemande.VALIDE_DIR,
        date_debut__year=annee,
    ).update(statut_demande=StatutDemande.ARCHIVEE)


def solde_du_personnel(personnel, annee):
    """Retourne le solde brut de l'année, ou None s'il n'existe pas."""
    return personnel.soldes.filter(annee=annee).first()


__all__ = [
    "archiver_demandes",
    "droits_annuels_du_personnel",
    "propager_report",
    "reporter_reliquats",
    "solde_ou_creer",
    "solde_du_personnel",
    "valider_et_activer_par_rh",
]