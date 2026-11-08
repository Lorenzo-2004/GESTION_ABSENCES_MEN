"""Remplace les libellés de démonstration par des identités fictives au format normal.

Le script cible exclusivement les deux personnels créés précédemment avec les IM
DSI-CHEF-001 et DSI-DIR-001. Il conserve leurs rôles, mots de passe, liens aux
comptes, direction et affectations de service. Par défaut, il affiche un aperçu.

Aperçu :
  python manage.py shell -c "exec(open('renommer_comptes_dsi_identites_normales.py', encoding='utf-8-sig').read())"

Application :
  $env:MEN_APPLIQUER_IDENTITES_NORMALES_DSI = '1'
  python manage.py shell -c "exec(open('renommer_comptes_dsi_identites_normales.py', encoding='utf-8-sig').read())"
  Remove-Item Env:MEN_APPLIQUER_IDENTITES_NORMALES_DSI

Les noms et matricules proposés sont des exemples fictifs de forme normale.
Ils doivent être remplacés par les identités réelles validées par la RH avant
utilisation opérationnelle. Aucun mot de passe n'est lu, modifié ou affiché.
"""
import os
from django.db import transaction
from organisation.models import Direction, Service
from personnels.models import Personnel, Utilisateur

APPLIQUER = os.environ.get("MEN_APPLIQUER_IDENTITES_NORMALES_DSI", "").strip() == "1"

IDENTITES = [
    {
        "ancien_im": "DSI-CHEF-001",
        "ancien_role": "ROLE_CHEF_SERVICE",
        "im": "342566",
        "cin": "201987654321",
        "nom": "RAZAFINDRAKOTO",
        "prenoms": "Hery Tahina",
        "sexe": "M",
        "date_naissance": "1987-05-14",
        "corps": "Cadre A",
        "grade": "Chef de Service",
        "service_code": "SSIF",
    },
    {
        "ancien_im": "DSI-DIR-001",
        "ancien_role": "ROLE_DIRECTEUR",
        "im": "342567",
        "cin": "201876543219",
        "nom": "ANDRIAMBOLOLONA",
        "prenoms": "Mamy Haja",
        "sexe": "M",
        "date_naissance": "1980-09-23",
        "corps": "Administrateur Civil",
        "grade": "Directeur",
        "service_code": None,
    },
]


def valider_cibles(direction, service_sinfo):
    plans = []
    for spec in IDENTITES:
        personne = Personnel.objects.filter(im=spec["ancien_im"]).first()
        if personne is None:
            raise RuntimeError(
                f"Personnel source {spec['ancien_im']} introuvable. Aucune modification effectuée."
            )
        if personne.direction_id != direction.pk:
            raise RuntimeError(
                f"{spec['ancien_im']} n'appartient pas à la DSI. Aucune modification effectuée."
            )

        comptes = list(Utilisateur.objects.filter(personnel=personne))
        if len(comptes) != 1:
            raise RuntimeError(
                f"{spec['ancien_im']} doit avoir exactement un compte associé (trouvé : {len(comptes)})."
            )
        compte = comptes[0]
        if compte.role != spec["ancien_role"]:
            raise RuntimeError(
                f"Rôle inattendu pour {spec['ancien_im']} : {compte.role}. Aucune modification effectuée."
            )

        conflits = [
            ("IM", Personnel.objects.filter(im=spec["im"]).exclude(pk=personne.pk).exists()),
            ("CIN", Personnel.objects.filter(cin=spec["cin"]).exclude(pk=personne.pk).exists()),
            ("identifiant de compte", Utilisateur.objects.filter(username=spec["im"]).exclude(pk=compte.pk).exists()),
        ]
        conflict = [nom for nom, existe in conflits if existe]
        if conflict:
            raise RuntimeError(
                f"Conflit sur {' / '.join(conflict)} pour le nouvel IM {spec['im']}. "
                "Aucune modification effectuée. Choisir un IM/CIN disponibles."
            )

        service_attendu = service_sinfo if spec["service_code"] == "SINFO" else None
        plans.append({"spec": spec, "personne": personne, "compte": compte, "service": service_attendu})
    return plans


print("\n=== IDENTITÉS NORMALES — DSI ===")
print("Mode : " + ("APPLICATION" if APPLIQUER else "APERÇU (aucune modification)"))
direction = Direction.objects.filter(code_direction="DSI").first()
if direction is None:
    raise RuntimeError("Direction DSI introuvable. Aucune modification effectuée.")
service_sinfo = Service.objects.filter(code_service="SINFO", direction=direction).first()
if service_sinfo is None:
    raise RuntimeError("Service Informatique SINFO de la DSI introuvable. Aucune modification effectuée.")
plans = valider_cibles(direction, service_sinfo)

for plan in plans:
    spec, personne, compte = plan["spec"], plan["personne"], plan["compte"]
    service_label = plan["service"].nom_service if plan["service"] else "Aucun service (direction)"
    print(
        f"- {spec['ancien_im']} -> IM {spec['im']} | {spec['nom']} {spec['prenoms']} "
        f"| {spec['ancien_role']} | CIN {spec['cin']} | {service_label} "
        f"| personnel ID {personne.pk} | compte ID {compte.pk}"
    )

if not APPLIQUER:
    print("\nAucune modification effectuée.")
    print("Pour appliquer : définir MEN_APPLIQUER_IDENTITES_NORMALES_DSI=1 puis relancer.")
else:
    from datetime import date
    with transaction.atomic():
        for plan in plans:
            spec, personne, compte = plan["spec"], plan["personne"], plan["compte"]
            personne.im = spec["im"]
            personne.cin = spec["cin"]
            personne.nom = spec["nom"]
            personne.prenoms = spec["prenoms"]
            personne.sexe = spec["sexe"]
            personne.date_naissance = date.fromisoformat(spec["date_naissance"])
            personne.corps = spec["corps"]
            personne.grade = spec["grade"]
            personne.service = plan["service"]
            # Pas d'adresse électronique inventée : la laisser vide en attendant la valeur validée.
            personne.email = ""
            personne.telephone = ""
            personne.save(update_fields=[
                "im", "cin", "nom", "prenoms", "sexe", "date_naissance",
                "corps", "grade", "service", "email", "telephone",
            ])

            compte.username = spec["im"]
            compte.first_name = spec["prenoms"]
            compte.last_name = spec["nom"]
            compte.email = ""
            # Le rôle et le hash du mot de passe existant restent inchangés.
            compte.save(update_fields=["username", "first_name", "last_name", "email"])
            print(f"Mis à jour : personnel {personne.pk} / compte {compte.pk} — IM {personne.im} — {personne.nom} {personne.prenoms} — {compte.role}")

    print("\nMise à jour terminée. Rôles, mots de passe, relations et données de congé non modifiés.")
    print("IMPORTANT : noms/IM/CIN fictifs de forme normale ; remplace-les par des données RH validées avant un usage réel.")
