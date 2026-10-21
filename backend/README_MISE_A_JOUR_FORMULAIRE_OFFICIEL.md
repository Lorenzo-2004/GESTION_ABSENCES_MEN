# Mise à jour du backend — fiche officielle PDF

## Règle appliquée
La génération de la fiche officielle du MEN est autorisée uniquement pour :
- `CONGE_ANNUEL`
- `PERMISSION`
- `AUTORISATION`

Les types `MATERNITE`, `PATERNITE`, `MISSION` et `REPOS_SANITAIRE` sont traités comme des annonces et ne produisent pas cette fiche.

## Changements
- Ajout de `TYPES_AVEC_FORMULAIRE_OFFICIEL` dans `conges/regles.py` comme source unique de la règle.
- L'action API `GET /api/demandes/{id}/formulaire/` renvoie une erreur HTTP 400 structurée pour les types annonce.
- Le service `conges.services.pdf.generer_formulaire_pdf()` applique le même contrôle, y compris en cas d'appel direct hors endpoint.
- Le contrôle des champs destinés au formulaire officiel ne s'applique plus aux types annonce.
- Le test précédent qui attendait un PDF pour `MISSION` a été remplacé par un test de refus de génération pour les quatre types annonce.

## Migration
Aucune migration de base de données n'est nécessaire.

## Vérification
Les fichiers Python modifiés passent `py_compile`. Les tests Django n'ont pas pu être exécutés dans l'environnement de préparation, car Django n'y est pas installé. Exécuter dans l'environnement local du projet :

```powershell
python manage.py test conges.tests_api.FormulairePdfRemplissageTests --settings=config.settings.test
```

## Fichiers locaux
Pour éviter d'embarquer des paramètres privés ou des données de test, l'archive n'inclut pas `.env`, les journaux locaux ni `media-tests`. Lors d'un remplacement complet du dossier, conserve et recopie ton fichier `.env` actuel et tes médias réels. `.env.example` est inclus comme référence.


## Signature électronique à la soumission

Le formulaire Nouvelle demande intègre une zone de signature dessinée avant l'envoi. Le client transmet un PNG transparent ; l'API valide le format, les dimensions et la présence de traits, conserve l'image, l'horodatage, le compte ayant soumis la demande et l'empreinte SHA-256. Pour le congé annuel, la permission et l'autorisation, le PNG est placé dans la zone « Signature de l'intéressé(e) » du formulaire officiel MEN. Les annonces sans fiche officielle conservent la signature et ses métadonnées sur la demande sans générer de fiche.

Après mise à jour, exécuter `python manage.py migrate`. Cette signature dessinée est une signature électronique interne et traçable ; elle n'est pas à elle seule une signature numérique qualifiée reposant sur un certificat de confiance.
