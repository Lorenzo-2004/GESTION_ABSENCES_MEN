"""Saisie guidée d’un agent MEN et de sa décision annuelle.

À exécuter depuis le dossier backend du projet avec :
python manage.py shell -c "exec(open('saisie_un_agent_complet.py', encoding='utf-8').read())"

Le script ne modifie aucune donnée avant confirmation explicite.
Les identités, références de décision et données budgétaires ne sont jamais inventées.
Les mots de passe sont saisis localement, sans affichage.
"""
from datetime import date
from getpass import getpass
import re

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from organisation.models import Direction, Service
from personnels.enums import Role, Statut
from personnels.models import Personnel, Utilisateur
from conges.enums import NatureDecision
from conges.models import DecisionConge
from conges.services.soldes import valider_et_activer_par_rh


CONFIRMATION = "CREER L AGENT ET SA DECISION"


def demander(texte, *, obligatoire=True, valeur_defaut=None, secret=False):
    while True:
        if secret:
            valeur = getpass(f"{texte} : ")
        else:
            suffixe = f" [{valeur_defaut}]" if valeur_defaut is not None else ""
            valeur = input(f"{texte}{suffixe} : ").strip()
        if valeur == "" and valeur_defaut is not None:
            return valeur_defaut
        if valeur == "" and obligatoire:
            print("Ce champ est obligatoire.")
            continue
        if valeur == "-" and not obligatoire:
            return ""
        return valeur


def demander_date(texte, *, obligatoire=True):
    while True:
        valeur = demander(
            f"{texte} (AAAA-MM-JJ; '-' si non applicable)",
            obligatoire=obligatoire,
        )
        if not valeur:
            return None
        try:
            return date.fromisoformat(valeur)
        except ValueError:
            print("Date invalide. Utilise le format AAAA-MM-JJ, par exemple 1988-04-23.")


def demander_oui_non(texte, defaut=False):
    indication = "O/n" if defaut else "o/N"
    while True:
        valeur = input(f"{texte} ({indication}) : ").strip().lower()
        if not valeur:
            return defaut
        if valeur in ("o", "oui", "y", "yes"):
            return True
        if valeur in ("n", "non", "no"):
            return False
        print("Réponds par oui ou non.")


def choisir_direction():
    directions = list(Direction.objects.order_by("code_direction"))
    if not directions:
        raise RuntimeError("Aucune direction n'est enregistrée dans la base.")
    print("\nDirections enregistrées :")
    for direction in directions:
        print(f"  {direction.code_direction:<20} {direction.nom_direction}")
    codes = {d.code_direction.upper(): d for d in directions}
    while True:
        code = demander("Code de direction").upper()
        if code in codes:
            return codes[code]
        print("Code inconnu. Choisis un code affiché ci-dessus.")


def choisir_service(direction):
    services = list(Service.objects.filter(direction=direction).order_by("code_service"))
    if not services:
        raise RuntimeError(
            f"Aucun service n'est enregistré pour la direction {direction.code_direction}."
        )
    print(f"Services de {direction.code_direction} :")
    for service in services:
        print(f"  {service.code_service:<20} {service.nom_service}")
    codes = {s.code_service.upper(): s for s in services}
    while True:
        code = demander("Code du service d'affectation").upper()
        if code in codes:
            return codes[code]
        print("Code de service inconnu pour cette direction.")


def demander_choix(texte, options):
    print(texte)
    for code, libelle in options:
        print(f"  {code} — {libelle}")
    valides = {code for code, _ in options}
    while True:
        valeur = demander("Choix").upper()
        if valeur in valides:
            return valeur
        print("Choix invalide.")


def saisir_agent(numero):
    print("\n" + "=" * 72)
    print("AGENT — DONNÉES PERSONNELLES")
    print("=" * 72)
    im = demander("Indice matricule (IM)")
    cin = demander("Numéro CIN")
    nom = demander("Nom")
    prenoms = demander("Prénoms")
    sexe = demander_choix("Sexe :", [("M", "Masculin"), ("F", "Féminin")])
    date_naissance = demander_date("Date de naissance")
    if date_naissance > timezone.localdate():
        raise ValueError("La date de naissance ne peut pas se trouver dans le futur.")
    telephone = demander("Téléphone (saisis '-' si non disponible)", obligatoire=False)
    email = demander("Adresse e-mail (saisis '-' si non disponible)", obligatoire=False)
    statut = demander_choix(
        "Statut administratif :",
        [
            ("FONCTIONNAIRE", "Fonctionnaire"),
            ("ECD", "Agent non encadré de l'État (ECD)"),
            ("STAGIAIRE", "Stagiaire"),
        ],
    )
    corps = demander("Corps")
    grade = demander("Grade")
    direction = choisir_direction()
    service = choisir_service(direction)

    if statut == Statut.STAGIAIRE:
        raise ValueError(
            f"L'agent {im} est déclaré stagiaire. Le système interdit de lui enregistrer "
            "une décision de congé annuel. Aucune donnée n'a été créée."
        )

    compte_test = Utilisateur(
        username=im,
        email=email,
        first_name=prenoms,
        last_name=nom,
        role=Role.AGENT,
    )
    while True:
        mot_de_passe = demander(
            f"Mot de passe initial du compte agent {im}", secret=True
        )
        confirmation = demander(
            f"Confirmer le mot de passe du compte agent {im}", secret=True
        )
        if not mot_de_passe:
            print("Le mot de passe ne peut pas être vide.")
            continue
        if mot_de_passe != confirmation:
            print("Les mots de passe ne correspondent pas.")
            continue
        try:
            validate_password(mot_de_passe, user=compte_test)
        except ValidationError as erreur:
            print("Mot de passe refusé par les règles Django :")
            for message in erreur.messages:
                print(f"  - {message}")
            continue
        break

    return {
        "im": im,
        "cin": cin,
        "nom": nom,
        "prenoms": prenoms,
        "sexe": sexe,
        "date_naissance": date_naissance,
        "telephone": telephone,
        "email": email,
        "statut": statut,
        "corps": corps,
        "grade": grade,
        "direction": direction,
        "service": service,
        "mot_de_passe": mot_de_passe,
    }


def saisir_decision(numero, agent):
    print("\n" + "-" * 72)
    print(f"DÉCISION RH — {agent['nom']} {agent['prenoms']} (IM {agent['im']})")
    print("Saisis les valeurs telles qu'elles figurent sur la décision officielle.")
    print("N'utilise pas de références de démonstration ni de valeurs budgétaires fictives.")
    numero_decision = demander("Numéro officiel de la décision")
    annees_titre = demander("Année(s) du titre (ex. 2026 ou 2025-2026)")
    annees = sorted(set(int(a) for a in re.findall(r"(?:19|20)\d{2}", annees_titre)))
    if not annees:
        raise ValueError("Le champ 'Année(s) du titre' doit contenir au moins une année valide.")
    date_emission = demander_date("Date d'émission de la décision")
    date_reference = demander_date(
        "Date de demande de référence", obligatoire=False
    )
    budget = demander("Budget indiqué sur la décision")
    imputation = demander("Imputation budgétaire / chapitre officiel")
    indice = demander("Indice figurant sur la décision")
    corps_grade = demander(
        "Corps et grade imprimés sur la décision",
        valeur_defaut=f"{agent['corps']} {agent['grade']}".strip(),
    )
    details_jours = demander("Détails des jours tels qu'indiqués sur la décision")
    signataire = demander("Nom et fonction du signataire officiel")
    activer = demander_oui_non(
        "Activer immédiatement cette décision et créer les soldes via le service RH ?",
        defaut=False,
    )
    return {
        "numero_decision": numero_decision,
        "annees_titre": annees_titre,
        "annees": annees,
        "date_emission": date_emission,
        "date_demande_reference": date_reference,
        "budget": budget,
        "imputation_budgetaire": imputation,
        "indice": indice,
        "corps_grade": corps_grade,
        "details_jours": details_jours,
        "signataire": signataire,
        "activer": activer,
    }


def verifier_doublons(agents, decisions):
    erreurs = []
    ims = [a["im"].strip() for a in agents]
    cins = [a["cin"].strip() for a in agents]
    numeros = [d["numero_decision"].strip() for d in decisions]

    # Le script ne saisit qu’un agent et une décision ; les contrôles ci-dessous
    # vérifient leurs collisions avec les enregistrements déjà présents en base.

    for im in ims:
        if Personnel.objects.filter(im=im).exists():
            erreurs.append(f"L'IM {im} existe déjà dans la table des personnels.")
        if Utilisateur.objects.filter(username=im).exists():
            erreurs.append(f"Le nom de compte {im} existe déjà.")
    for cin in cins:
        if Personnel.objects.filter(cin=cin).exists():
            erreurs.append(f"La CIN {cin} existe déjà dans la table des personnels.")
    for numero in numeros:
        if DecisionConge.objects.filter(numero_decision=numero).exists():
            erreurs.append(f"Le numéro de décision {numero} existe déjà.")

    return erreurs


def afficher_recapitulatif(agents, decisions):
    print("\n" + "=" * 76)
    print("RÉCAPITULATIF — AUCUNE DONNÉE N'EST ENCORE ENREGISTRÉE")
    print("=" * 76)
    for i, (agent, decision) in enumerate(zip(agents, decisions), start=1):
        service = f"{agent['service'].code_service} — {agent['service'].nom_service}"
        print(f"\n{i}. {agent['nom']} {agent['prenoms']} | IM {agent['im']} | CIN {agent['cin']}")
        print(f"   Né(e) le : {agent['date_naissance']} | Sexe : {agent['sexe']} | Statut : {agent['statut']}")
        print(f"   Direction : {agent['direction'].code_direction} — {agent['direction'].nom_direction}")
        print(f"   Service : {service}")
        print(f"   Téléphone : {agent['telephone'] or '[NON RENSEIGNÉ]'} | E-mail : {agent['email'] or '[NON RENSEIGNÉ]'}")
        print(f"   Corps / grade : {agent['corps']} / {agent['grade']} | Compte : {agent['im']}")
        print(f"   Décision : {decision['numero_decision']} | Titre : {decision['annees_titre']}")
        print(f"   Émise le : {decision['date_emission']} | Indice : {decision['indice']}")
        print(f"   Budget : {decision['budget']} | Imputation : {decision['imputation_budgetaire']}")
        print(f"   Corps/grade décision : {decision['corps_grade']} | Jours : {decision['details_jours']}")
        print(f"   Signataire : {decision['signataire']}")
        print(f"   Activation demandée : {'OUI' if decision['activer'] else 'NON (RH pourra activer depuis l’application)'}")
    print("\nLes mots de passe ne sont jamais affichés dans ce récapitulatif.")


def main():
    print("SAISIE GUIDÉE : UN AGENT ET SA DÉCISION ANNUELLE MEN")
    print("Toutes les valeurs doivent correspondre aux documents réels.")
    print("Le script ne supprime ni ne modifie aucun enregistrement existant.\n")

    agent = saisir_agent(1)
    decision = saisir_decision(1, agent)
    agents = [agent]
    decisions = [decision]

    erreurs = verifier_doublons(agents, decisions)
    if erreurs:
        print("\nBLOCAGE — aucune insertion n'a été effectuée :")
        for erreur in erreurs:
            print(f"  - {erreur}")
        return

    afficher_recapitulatif(agents, decisions)
    print("\nAttention : l'activation ouvre les droits annuels et crée les soldes des années du titre.")
    if demander(f"Pour confirmer la création du dossier et de sa décision, tape exactement '{CONFIRMATION}'", obligatoire=True) != CONFIRMATION:
        print("Annulé. Aucune donnée n'a été enregistrée.")
        return

    crees = []
    try:
        with transaction.atomic():
            # Nouvelle vérification dans la transaction, avant les premières insertions.
            erreurs = verifier_doublons(agents, decisions)
            if erreurs:
                raise RuntimeError("Doublon détecté avant insertion : " + " | ".join(erreurs))

            for agent, decision_data in zip(agents, decisions):
                personnel = Personnel.objects.create(
                    im=agent["im"],
                    cin=agent["cin"],
                    direction=agent["direction"],
                    service=agent["service"],
                    nom=agent["nom"],
                    prenoms=agent["prenoms"],
                    sexe=agent["sexe"],
                    date_naissance=agent["date_naissance"],
                    telephone=agent["telephone"],
                    email=agent["email"],
                    statut=agent["statut"],
                    corps=agent["corps"],
                    grade=agent["grade"],
                )

                Utilisateur.objects.create_user(
                    username=agent["im"],
                    password=agent["mot_de_passe"],
                    email=agent["email"],
                    first_name=agent["prenoms"],
                    last_name=agent["nom"],
                    role=Role.AGENT,
                    personnel=personnel,
                )

                decision = DecisionConge.objects.create(
                    numero_decision=decision_data["numero_decision"],
                    personnel=personnel,
                    direction=agent["direction"],
                    budget=decision_data["budget"],
                    imputation_budgetaire=decision_data["imputation_budgetaire"],
                    corps_grade=decision_data["corps_grade"],
                    indice=decision_data["indice"],
                    annees_titre=decision_data["annees_titre"],
                    details_jours=decision_data["details_jours"],
                    date_demande_reference=decision_data["date_demande_reference"],
                    date_emission=decision_data["date_emission"],
                    signataire=decision_data["signataire"],
                    nature=NatureDecision.SAISIE_MANUELLE,
                    est_valide=False,
                )

                soldes = []
                if decision_data["activer"]:
                    soldes = valider_et_activer_par_rh(decision)
                    decision.refresh_from_db()

                crees.append({
                    "personnel_id": personnel.pk,
                    "im": personnel.im,
                    "username": personnel.im,
                    "decision_id": decision.pk,
                    "numero_decision": decision.numero_decision,
                    "active": decision.est_valide,
                    "soldes": [(s.annee, s.solde_restant) for s in soldes],
                })
    except Exception as erreur:
        print("\nÉCHEC : la transaction a été annulée. Aucune donnée n’a été conservée.")
        print(f"Détail : {erreur}")
        return

    print("\nSUCCÈS — le dossier de l’agent et sa décision ont été créés.")
    for item in crees:
        print(
            f"- Agent IM {item['im']} (personnel ID {item['personnel_id']}) ; "
            f"compte {item['username']} ; décision {item['numero_decision']} "
            f"(ID {item['decision_id']}) ; active={item['active']}"
        )
        if item["active"]:
            for annee, solde in item["soldes"]:
                print(f"    Solde {annee} : {solde} jour(s) restant(s)")
        else:
            print("    Décision non activée : les droits ne sont pas encore ouverts.")
    print("\nNe partage pas les mots de passe dans le chat. La première connexion devra utiliser l'IM et le mot de passe saisi localement.")


main()
