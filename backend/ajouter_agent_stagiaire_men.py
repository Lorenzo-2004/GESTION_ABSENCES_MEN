"""Créer un seul agent stagiaire MEN (sans décision annuelle de congé).

À placer dans backend, au même niveau que manage.py, puis lancer :
python manage.py shell -c "exec(open('ajouter_agent_stagiaire_men.py', encoding='utf-8').read())"

Aucune donnée n'est modifiée avant la confirmation explicite.
Le script ne crée aucune décision RH ni aucun solde de congé annuel :
la règle métier MEN exclut les stagiaires du congé annuel.
"""
from datetime import date
from getpass import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from organisation.models import Direction, Service
from personnels.enums import Role, Sexe, Statut
from personnels.models import Personnel, Utilisateur

CONFIRMATION = "CREER LE STAGIAIRE"


def demander(texte, *, obligatoire=True, valeur_defaut=None):
    while True:
        suffixe = f" [{valeur_defaut}]" if valeur_defaut is not None else ""
        valeur = input(f"{texte}{suffixe} : ").strip()
        if not valeur and valeur_defaut is not None:
            return valeur_defaut
        if not valeur and obligatoire:
            print("Ce champ est obligatoire.")
            continue
        if valeur == "-" and not obligatoire:
            return ""
        return valeur


def demander_date(texte):
    while True:
        valeur = demander(f"{texte} (AAAA-MM-JJ)")
        try:
            resultat = date.fromisoformat(valeur)
        except ValueError:
            print("Date invalide. Exemple : 1998-04-23.")
            continue
        if resultat > timezone.localdate():
            print("La date ne peut pas se trouver dans le futur.")
            continue
        return resultat


def choisir_direction():
    directions = list(Direction.objects.order_by("code_direction"))
    if not directions:
        raise RuntimeError("Aucune direction n'est enregistrée dans la base.")
    print("\nDirections existantes :")
    for d in directions:
        print(f"  {d.code_direction} — {d.nom_direction}")
    codes = {d.code_direction.upper(): d for d in directions}
    while True:
        code = demander("Code de direction").upper()
        if code in codes:
            return codes[code]
        print("Code inconnu : choisis un code affiché ci-dessus.")


def choisir_service(direction):
    services = list(Service.objects.filter(direction=direction).order_by("code_service"))
    if not services:
        print("Aucun service dans cette direction. Le service restera non renseigné.")
        return None
    print(f"\nServices de {direction.code_direction} :")
    for s in services:
        print(f"  {s.code_service} — {s.nom_service}")
    choix = {s.code_service.upper(): s for s in services}
    choix["AUCUN"] = None
    while True:
        code = demander("Code du service (ou AUCUN si non applicable)").upper()
        if code in choix:
            return choix[code]
        print("Code inconnu : choisis un service affiché ou AUCUN.")


def verifier_doublons(im, cin):
    erreurs = []
    if Personnel.objects.filter(im=im).exists():
        erreurs.append(f"L'IM {im} existe déjà dans la table des personnels.")
    if Utilisateur.objects.filter(username=im).exists():
        erreurs.append(f"Le compte utilisateur {im} existe déjà.")
    if Personnel.objects.filter(cin=cin).exists():
        erreurs.append("Cette CIN existe déjà dans la table des personnels.")
    return erreurs


def main():
    print("=" * 72)
    print("AJOUT D'UN SEUL AGENT STAGIAIRE — MEN")
    print("=" * 72)
    print("Le statut sera fixé à STAGIAIRE conformément à ta demande.")
    print("Aucune décision annuelle ni aucun solde de congé annuel ne seront créés.\n")

    im = demander("Indice matricule (IM)")
    cin = demander("Numéro CIN")
    nom = demander("Nom")
    prenoms = demander("Prénoms")
    sexe = demander("Sexe — M masculin / F féminin").upper()
    while sexe not in (Sexe.MASCULIN, Sexe.FEMININ):
        print("Valeur invalide : saisis M ou F.")
        sexe = demander("Sexe — M masculin / F féminin").upper()
    date_naissance = demander_date("Date de naissance")
    telephone = demander("Téléphone (saisis '-' si non disponible)", obligatoire=False)
    email = demander("E-mail (saisis '-' si non disponible)", obligatoire=False)
    corps = demander("Corps / cadre")
    grade = demander("Grade")
    direction = choisir_direction()
    service = choisir_service(direction)

    compte_test = Utilisateur(
        username=im,
        email=email,
        first_name=prenoms,
        last_name=nom,
        role=Role.AGENT,
    )
    while True:
        mot_de_passe = getpass(f"Mot de passe initial du compte {im} (saisie masquée) : ")
        confirmation = getpass("Confirmer le mot de passe (saisie masquée) : ")
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

    erreurs = verifier_doublons(im, cin)
    if erreurs:
        print("\nBLOCAGE — aucune donnée n'a été créée :")
        for erreur in erreurs:
            print(f"  - {erreur}")
        print("Vérifie l'IM/CIN de l'agent à ajouter. Le script n'a touché à aucun dossier existant.")
        return

    print("\n" + "=" * 72)
    print("RÉCAPITULATIF — AUCUNE DONNÉE N'EST ENCORE ENREGISTRÉE")
    print("=" * 72)
    print(f"Nom complet : {nom} {prenoms}".strip())
    print(f"IM : {im} | CIN : {cin} | Sexe : {sexe}")
    print(f"Date de naissance : {date_naissance}")
    print(f"Téléphone : {telephone or '[NON RENSEIGNÉ]'} | E-mail : {email or '[NON RENSEIGNÉ]'}")
    print(f"Statut : {Statut.STAGIAIRE.label}")
    print(f"Corps / grade : {corps} / {grade}")
    print(f"Direction : {direction.code_direction} — {direction.nom_direction}")
    print(f"Service : {service.code_service + ' — ' + service.nom_service if service else '[NON RENSEIGNÉ]'}")
    print(f"Compte : {im} (mot de passe non affiché)")
    print("Décision annuelle : NON CRÉÉE — stagiaire non éligible au congé annuel.")
    print("Solde annuel : NON CRÉÉ.")

    confirmation = demander(
        f"Pour confirmer uniquement la création du dossier stagiaire, tape exactement '{CONFIRMATION}'"
    )
    if confirmation != CONFIRMATION:
        print("Annulé. Aucune donnée n'a été enregistrée.")
        return

    try:
        with transaction.atomic():
            erreurs = verifier_doublons(im, cin)
            if erreurs:
                raise RuntimeError("Doublon détecté avant insertion : " + " | ".join(erreurs))

            personnel = Personnel(
                im=im,
                cin=cin,
                direction=direction,
                service=service,
                nom=nom,
                prenoms=prenoms,
                sexe=sexe,
                date_naissance=date_naissance,
                telephone=telephone,
                email=email,
                statut=Statut.STAGIAIRE,
                corps=corps,
                grade=grade,
            )
            personnel.full_clean()
            personnel.save()

            utilisateur = Utilisateur(
                username=im,
                email=email,
                first_name=prenoms,
                last_name=nom,
                role=Role.AGENT,
                personnel=personnel,
            )
            utilisateur.set_password(mot_de_passe)
            utilisateur.full_clean(exclude=["password"])
            utilisateur.save()
    except Exception as erreur:
        print("\nÉCHEC : transaction annulée ; aucun nouveau dossier n'a été conservé.")
        print(f"Détail : {erreur}")
        return

    print("\nSUCCÈS — agent stagiaire créé.")
    print(f"Personnel ID : {personnel.pk} | IM : {personnel.im} | Compte : {utilisateur.username}")
    print("Aucune décision annuelle ni aucun solde de congé annuel n'a été créé.")
    print("Conserve le mot de passe saisi dans ton environnement sécurisé et ne le partage pas dans le chat.")


main()
