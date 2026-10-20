# Corrections — sécurité des décisions RH et soumission des demandes

## Changements

1. `backend/conges/views.py`
   - `DemandeAbsenceViewSet.perform_create()` est maintenant entourée par `transaction.atomic`.
   - Si les contrôles métier échouent après la création du modèle, l'insertion est annulée au lieu de laisser une demande invalide en base.
   - `DecisionCongeViewSet` exige désormais le rôle RH ou Administrateur aussi bien en lecture (liste/détail) qu'en écriture.

2. `backend/commun/permissions.py`
   - Le message de permission `EstRH` mentionne la RH et l'administrateur, correspondant aux rôles autorisés par la règle existante.

3. `backend/conges/tests_api.py`
   - Le test de rejet métier vérifie qu'aucune demande invalide ne reste en base.
   - Un test vérifie que l'agent, le chef de service et le directeur ne peuvent ni lister ni lire une décision RH, tandis que la RH garde l'accès.

## Vérifications effectuées

- Compilation syntaxique Python de l'ensemble du backend : réussie.
- La suite Django n'a pas pu être exécutée dans cet environnement, car Django et Django REST Framework ne sont pas installés et l'accès au dépôt de paquets est indisponible.

## Exécution des tests sur un poste équipé

Depuis le dossier `backend`, créez/activez l'environnement virtuel, installez les dépendances (`pip install -r requirements.txt`), puis lancez :

```bash
# Windows PowerShell
$env:DJANGO_SETTINGS_MODULE = "config.settings.test"
python manage.py test conges.tests_api.DemandeAPITests.test_regle_metier_renvoie_400_pas_500 conges.tests_api.DecisionRHAPITests
```

Le fichier `.env` local n'est pas inclus dans cette archive. Copiez `.env.example` vers `.env` uniquement si nécessaire et remplacez les valeurs d'exemple par votre configuration locale.
