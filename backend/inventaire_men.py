from django.apps import apps

CONFIG = {
    "organisation.Direction": [
        "code_direction", "nom_direction", "nom", "libelle",
    ],
    "organisation.Service": [
        "code_service", "nom_service", "direction_id", "nom", "libelle",
    ],
    "personnels.Personnel": [
        "im", "nom_complet", "nom", "prenom", "statut",
        "fonction", "grade", "corps", "direction_id", "service_id",
    ],
    "personnels.Utilisateur": [
        "username", "role", "is_superuser", "is_staff",
        "is_active", "personnel_id",
    ],
    "conges.DemandeAbsence": [
        "personnel_id", "type_absence", "statut_demande",
        "statut", "date_debut", "date_fin",
    ],
    "conges.DecisionConge": [
        "personnel_id", "numero_decision", "indice",
        "annee_titre", "annees_titre",
    ],
    "conges.SoldeConge": [
        "personnel_id", "annee", "annee_titre",
        "jours_acquis", "jours_pris", "reliquat", "solde",
    ],
    "conges.ValidationWorkflow": [
        "demande_id", "demande_absence_id", "etape",
        "statut", "validateur_id",
    ],
    "conges.TraceSignature": [
        "demande_id", "demande_absence_id",
        "type_evenement", "code_evenement",
    ],
}

print("\n=== INVENTAIRE DETAILLE MEN ===")

for label, candidats in CONFIG.items():
    app_label, model_name = label.split(".", 1)

    try:
        model = apps.get_model(app_label, model_name)
    except LookupError:
        print(f"\n{label} : modèle introuvable")
        continue

    noms_champs = {
        field.attname
        for field in model._meta.concrete_fields
    }

    champs = [model._meta.pk.attname]
    champs.extend(
        nom for nom in candidats
        if nom in noms_champs and nom not in champs
    )

    print(f"\n{label} | total : {model.objects.count()}")

    for ligne in model.objects.values(*champs)[:30]:
        print(ligne)
