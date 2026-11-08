# Correctif OCR — indices, numéros et signataire

Ce paquet conserve le comportement métier du backend (dont la règle de tranche de congé annuel de 15 jours) et corrige les extractions OCR ciblées :

- l'indice peut contenir un suffixe alphabétique, par exemple `231 T`, `231T` ou `231 - t` ;
- les numéros de décision espacés par l'OCR sont réunis (`9 290` devient `9290`) ;
- la zone marquée `NUMERO_DECISION_OCR` est prioritaire ;
- le signataire favorise la fonction délégataire la plus spécifique (notamment Directeur des Ressources Humaines) plutôt que le Ministre ou le Secrétaire général ;
- les lignes de paraphe/bruit comme `a ice Fe Généra` ne sont pas proposées comme nom.

La lecture du signataire reste une proposition OCR à confirmer par la RH.

## Installation

Fusionner les fichiers de l'archive dans le projet existant, sans supprimer les fichiers locaux. L'archive contient une seule migration `0008_alter_decisionconge_indice_code.py` ; ne pas ajouter une deuxième migration `0008` différente.

Depuis `backend/` :

```powershell
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test conges.tests --settings=config.settings.test
python manage.py test conges.tests_api --settings=config.settings.test
```

Ce correctif OCR seul ne requiert pas une nouvelle migration par rapport à la structure existante.
