# Correctif des 5 échecs de tests — 8 novembre 2026

## Cause 1 — signature des demandes personnelles

Les 4 tests de `VerrouillageDemandesTests` créaient une demande personnelle d'agent sans joindre la signature. La règle applicative impose pourtant une signature à une demande personnelle. La signature n'est facultative que lorsqu'un chef de service saisit une demande pour un autre agent de son service.

Le helper de test fournit désormais `SIGNATURE_TEST_DATA_URI`. La validation applicative et la règle de sécurité ne sont pas assouplies.

## Cause 2 — numéro de décision déjà utilisé

Le test supposait que le numéro imprimé dans le titre `DECISION N° 2205` était nécessairement le numéro tamponné. Ce n'est plus la règle OCR : seul un numéro reconnu dans la zone du cachet de l'en-tête est proposé. Le test de doublon simule donc un résultat OCR fiable (`numero_decision = 2205`) pour tester le contrôle API indépendamment de la reconnaissance optique.

## Installation

Fusionner les fichiers du correctif dans `backend/`, puis lancer :

```powershell
python manage.py test
```

Aucune migration de base de données n'est nécessaire. Ces modifications mettent à jour les fixtures/tests, sans modifier les règles métier ni les permissions.
