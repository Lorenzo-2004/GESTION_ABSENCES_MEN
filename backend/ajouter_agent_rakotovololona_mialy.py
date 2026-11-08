"""Créer la fiche personnel et le compte de RAKOTOVOLOLONA Mialy Nirina Tsizaraina.

À exécuter depuis le dossier backend, au niveau de manage.py :
  python manage.py shell -c "exec(open('ajouter_agent_rakotovololona_mialy.py', encoding='utf-8').read())"

Le script :
- n'invente ni décision de congé ni solde annuel ;
- vérifie les doublons IM, CIN et username ;
- exige que la direction DSI et le service SSIF rattaché à DSI existent ;
- crée le personnel et son compte ROLE_AGENT dans une seule transaction ;
- demande le mot de passe sans l'afficher et demande une confirmation explicite.
"""
from datetime import date
from getpass import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction

from organisation.models import Direction, Service
from personnels.enums import Role, Sexe, Statut
from personnels.models import Personnel, Utilisateur

CONFIRMATION = "CREER MIALY 474941"

DONNEES = {
    "im": "474941",
    # Conservé tel que transmis. Ne normaliser qu'en accord avec la convention
    # CIN déjà utilisée dans la base du projet.
    "cin": "201 345 756 095",
    "nom": "RAKOTOVOLOLONA",
    "prenoms": "Mialy Nirina Tsizaraina",
    "sexe": Sexe.FEMININ,
    "date_naissance": date(1983, 3, 22),
    "telephone": "0380945671",
    "email": "rakotovololonamialy@gmail.com",
    "statut": Statut.FONCTIONNAIRE,
    "corps": "Encadreur",
    "grade": "Aux ECHELLE IV 2°ECHELON",
}


def verifier_doublons():
    erreurs = []
    im = DONNEES["im"]
    cin = DONNEES["cin"]
    if Personnel.objects.filter(im=im).exists():
        erreurs.append(f"L'IM {im} existe déjà dans personnels.")
    cin_normalisee = "".join(caractere for caractere in cin if caractere.isdigit())
    # Détecte aussi un doublon si la CIN existante a été enregistrée sans espaces.
    cins_existantes = Personnel.objects.values_list("cin", flat=True)
    if any(
        "".join(caractere for caractere in valeur if caractere.isdigit()) == cin_normalisee
        for valeur in cins_existantes
    ):
        erreurs.append("Cette CIN existe déjà dans personnels (avec ou sans espaces).")
    if Utilisateur.objects.filter(username=im).exists():
        erreurs.append(f"Le compte utilisateur {im} existe déjà.")
    return erreurs


def demander_mot_de_passe():
    utilisateur_test = Utilisateur(
        username=DONNEES["im"],
        email=DONNEES["email"],
        first_name=DONNEES["prenoms"],
        last_name=DONNEES["nom"],
        role=Role.AGENT,
    )
    while True:
        mot_de_passe = getpass("Mot de passe initial du compte (saisie masquée) : ")
        confirmation = getpass("Confirmer le mot de passe (saisie masquée) : ")
        if not mot_de_passe:
            print("Le mot de passe ne peut pas être vide.")
            continue
        if mot_de_passe != confirmation:
            print("Les mots de passe ne correspondent pas.")
            continue
        try:
            validate_password(mot_de_passe, user=utilisateur_test)
        except ValidationError as exc:
            print("Mot de passe refusé par les règles Django :")
            for message in exc.messages:
                print(f"  - {message}")
            continue
        return mot_de_passe


def main():
    print("=" * 72)
    print("CRÉATION D'UN AGENT MEN — PERSONNEL + COMPTE UTILISATEUR")
    print("=" * 72)

    erreurs = verifier_doublons()
    if erreurs:
        print("BLOCAGE — aucune donnée n'a été créée :")
        for erreur in erreurs:
            print(f"  - {erreur}")
        return

    try:
        direction = Direction.objects.get(code_direction__iexact="DSI")
    except Direction.DoesNotExist:
        print("BLOCAGE — la direction DSI n'existe pas. Aucune donnée créée.")
        return
    except Direction.MultipleObjectsReturned:
        print("BLOCAGE — plusieurs directions correspondent au code DSI. Aucune donnée créée.")
        return

    try:
        service = Service.objects.get(
            direction=direction,
            code_service__iexact="SSIF",
        )
    except Service.DoesNotExist:
        print(
            "BLOCAGE — le service SSIF rattaché à DSI n'existe pas. "
            "Aucune donnée créée ; vérifie le code du service dans la base."
        )
        return
    except Service.MultipleObjectsReturned:
        print("BLOCAGE — plusieurs services SSIF existent sous DSI. Aucune donnée créée.")
        return

    mot_de_passe = demander_mot_de_passe()

    print("\nRÉCAPITULATIF — rien n'est encore enregistré")
    print("- Nom :", DONNEES["nom"])
    print("- Prénoms :", DONNEES["prenoms"])
    print("- IM :", DONNEES["im"])
    print("- CIN :", DONNEES["cin"])
    print("- Sexe : Féminin")
    print("- Date de naissance :", DONNEES["date_naissance"].isoformat())
    print("- Téléphone :", DONNEES["telephone"])
    print("- E-mail :", DONNEES["email"])
    print("- Statut : Fonctionnaire")
    print("- Corps / grade :", DONNEES["corps"], "/", DONNEES["grade"])
    print(f"- Direction : {direction.code_direction} — {direction.nom_direction}")
    print(f"- Service : {service.code_service} — {service.nom_service}")
    print("- Compte utilisateur :", DONNEES["im"], "(mot de passe masqué)")
    print("- Décision RH et solde annuel : non créés, faute de données fournies.")

    confirmation = input(
        f"\nPour confirmer, tape exactement '{CONFIRMATION}' : "
    ).strip()
    if confirmation != CONFIRMATION:
        print("Annulé. Aucune donnée n'a été enregistrée.")
        return

    try:
        with transaction.atomic():
            erreurs = verifier_doublons()
            if erreurs:
                raise RuntimeError("Doublon détecté avant insertion : " + " | ".join(erreurs))

            # Recharger les références dans la transaction et confirmer leur appartenance.
            direction = Direction.objects.get(pk=direction.pk, code_direction__iexact="DSI")
            service = Service.objects.get(
                pk=service.pk,
                direction=direction,
                code_service__iexact="SSIF",
            )

            personnel = Personnel(
                **DONNEES,
                direction=direction,
                service=service,
                check_presence=True,
            )
            personnel.full_clean()
            personnel.save()

            compte = Utilisateur(
                username=DONNEES["im"],
                email=DONNEES["email"],
                first_name=DONNEES["prenoms"],
                last_name=DONNEES["nom"],
                role=Role.AGENT,
                personnel=personnel,
                is_active=True,
            )
            compte.set_password(mot_de_passe)
            compte.full_clean(exclude=["password"])
            compte.save()
    except Exception as exc:
        print("\nÉCHEC — transaction annulée ; aucun nouvel enregistrement conservé.")
        print(f"Détail : {exc}")
        return

    print("\nSUCCÈS — agent créé.")
    print(f"Personnel ID : {personnel.pk}")
    print(f"Compte ID : {compte.pk} | identifiant de connexion : {compte.username}")
    print("Aucune décision RH ni aucun solde de congé n'a été créé.")
    print("Conserve le mot de passe dans un gestionnaire sécurisé ; ne le partage pas dans le chat.")


main()
