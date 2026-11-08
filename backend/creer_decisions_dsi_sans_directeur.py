"""Prépare trois décisions locales pour les tests MEN de la DSI.

Aperçu par défaut : ne modifie rien.
Application uniquement si MEN_APPLIQUER_DECISIONS_DSI=1.
Les références suivent une numérotation locale simple sans suffixe « DEMO ».
Les enregistrements ne sont pas activés et ne constituent pas des actes officiels.
Aucun solde n'est créé directement : l'activation RH devra le faire via le service métier.
"""

import os
from datetime import date

from django.db import transaction
from django.utils import timezone

from organisation.models import Direction
from personnels.models import Personnel, Utilisateur
from conges.models import DecisionConge

DIRECTION_CODE = "DSI"
ANNEE = timezone.localdate().year
APPLIQUER = os.environ.get("MEN_APPLIQUER_DECISIONS_DSI") == "1"

# Le directeur n'a pas de décision prévue dans ce jeu de données.
# Cette numérotation est locale au projet de test et ne doit pas être présentée
# comme une référence officielle de l'administration.
CIBLES = {
    "342564": 1,  # RH
    "555555": 2,  # Agent
    "342566": 3,  # Chef de service
}
ROLES_ATTENDUS = {
    "342564": "ROLE_RH",
    "555555": "ROLE_AGENT",
    "342566": "ROLE_CHEF_SERVICE",
}


def description(personnel):
    comptes = list(
        Utilisateur.objects.filter(personnel=personnel)
        .order_by("username")
        .values_list("username", "role")
    )
    compte_txt = ", ".join(f"{username} ({role})" for username, role in comptes) or "aucun compte lié"
    service = personnel.service.code_service if personnel.service_id else "Direction DSI"
    return (
        f"IM {personnel.im} | {personnel.nom} {personnel.prenoms} | "
        f"service {service} | compte(s): {compte_txt}"
    )


def champs_decision(personnel, direction):
    corps_grade = " ".join(
        str(v).strip()
        for v in (personnel.corps, personnel.grade)
        if v and str(v).strip()
    )
    return {
        "personnel": personnel,
        "direction": direction,
        "budget": "Budget Général",
        "imputation_budgetaire": "",
        "corps_grade": corps_grade,
        "indice": None,
        "annees_titre": str(ANNEE),
        "details_jours": "",
        "date_demande_reference": None,
        "date_emission": timezone.localdate(),
        "signataire": "",
        "nature": "SAISIE_MANUELLE",
        "est_valide": False,
    }


def main():
    try:
        direction = Direction.objects.get(code_direction=DIRECTION_CODE)
    except Direction.DoesNotExist:
        raise SystemExit("ERREUR : la direction DSI est introuvable.")

    plan = []
    erreurs = []
    print("=== DÉCISIONS DSI — NUMÉROTATION LOCALE ===")
    print(f"Direction : {direction.nom_direction} (ID {direction.pk})")
    print(f"Année portée par le titre : {ANNEE}")
    print("Périmètre : RH, agent et chef de service. Le directeur est exclu.")
    print("Mode : APPLICATION" if APPLIQUER else "Mode : APERÇU (aucune modification)")
    print("Note : références locales de test, non officielles ; aucune décision ne sera activée.")

    for im, sequence in CIBLES.items():
        numero = f"{sequence:03d}/DSI/{ANNEE}"
        personnel = (
            Personnel.objects.filter(im=im, direction=direction)
            .select_related("direction", "service")
            .first()
        )
        if personnel is None:
            erreurs.append(f"Personnel IM {im} introuvable dans la DSI.")
            continue

        compte = Utilisateur.objects.filter(personnel=personnel).order_by("username").first()
        role = compte.role if compte else None
        if role != ROLES_ATTENDUS[im]:
            erreurs.append(
                f"IM {im} : rôle attendu {ROLES_ATTENDUS[im]}, rôle trouvé {role or 'aucun compte'}.")
        if personnel.est_stagiaire:
            erreurs.append(f"IM {im} : stagiaire, congé annuel non autorisé par les règles métier.")

        existante = DecisionConge.objects.filter(numero_decision=numero).first()
        if existante and existante.personnel_id != personnel.pk:
            erreurs.append(
                f"Référence {numero} déjà utilisée par un autre personnel (ID {existante.personnel_id}).")

        plan.append((personnel, numero, champs_decision(personnel, direction), existante))

    for personnel, numero, defaults, existante in plan:
        if existante:
            print(
                f"EXISTANTE : {numero} | décision ID {existante.pk} | "
                f"valide={existante.est_valide} | {description(personnel)}")
        else:
            print(
                f"À CRÉER : {numero} | titre {ANNEE} | indice non renseigné | "
                f"non activée | {description(personnel)}")

    if erreurs:
        print("\nBLOCAGE — aucune modification ne sera effectuée :")
        for erreur in erreurs:
            print(f"- {erreur}")
        raise SystemExit(1)

    if not APPLIQUER:
        print("\nAPERÇU TERMINÉ : aucune donnée modifiée.")
        print("Pour appliquer après vérification, définis MEN_APPLIQUER_DECISIONS_DSI=1.")
        return

    crees = 0
    with transaction.atomic():
        # Revalide toutes les références dans la transaction pour éviter une collision.
        for personnel, numero, defaults, _ in plan:
            decision, creee = DecisionConge.objects.get_or_create(
                numero_decision=numero,
                defaults=defaults,
            )
            if decision.personnel_id != personnel.pk or decision.direction_id != direction.pk:
                raise RuntimeError(f"La référence {numero} ne correspond pas au personnel attendu.")
            if decision.est_valide:
                raise RuntimeError(
                    f"La décision {numero} est déjà activée ; arrêt pour ne pas modifier un dossier actif.")
            crees += int(creee)
            print(
                f"{'CRÉÉE' if creee else 'DÉJÀ PRÉSENTE'} : {numero} | ID {decision.pk} | "
                f"valide={decision.est_valide} | {description(personnel)}")

    print(f"\nTerminé : {crees} nouvelle(s) décision(s) enregistrée(s).")
    print("Aucune décision activée et aucun solde créé directement.")
    print("Les références sont locales au jeu de tests ; ne pas les présenter comme officielles.")


main()
