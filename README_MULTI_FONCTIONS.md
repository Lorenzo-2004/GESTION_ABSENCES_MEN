# Mise à jour MEN — rôles à plusieurs fonctions

Cette mise à jour applique la règle métier suivante sans modifier le schéma de la base :

- Un compte `ROLE_CHEF_SERVICE` conserve son espace Chef et possède aussi son espace personnel d'agent.
- Un compte `ROLE_RH`, lorsqu'il est lié à une fiche Personnel affectée à un service, conserve son espace RH et peut aussi agir comme responsable de ce service et comme agent pour ses propres demandes.
- Les demandes personnelles d'un Chef de service ou d'un compte RH responsable de service sont directement présentées au Directeur. Elles ne passent pas dans la file de validation de leur propre service.
- Les autres demandes du service peuvent être visées par le Chef ou le responsable RH du service. Le service métier de validation reste chargé du contrôle du périmètre et du décompte.
- Les pages « Mes demandes » et « Mon historique » ajoutent le filtre `personnel=<id de ma fiche>` afin qu'un Chef ou une RH voie ses demandes personnelles depuis l'espace personnel, sans confondre cette liste avec les listes de gestion.
- Le planning utilisé dans l'espace Service RH est limité au service de la fiche RH connectée.

## Installation

1. Fais une copie de sauvegarde de ton dossier `frontend/src` et des fichiers backend concernés.
2. Arrête Vite et Django.
3. Extrais l'archive à la racine de `C:\Users\LORENZO\PROJECT_MEN\` et accepte le remplacement des fichiers correspondants.
4. Conserve ton fichier `backend/.env` : il n'est pas inclus dans cette mise à jour.
5. Vérifie que la fiche Personnel du compte RH est bien rattachée au service RH correspondant. Les fonctions chef de service de la RH nécessitent cette association.

Aucune migration de base de données n'est nécessaire pour ce correctif.

## Vérifications à exécuter sur le poste Windows

Depuis `backend` :

```powershell
python manage.py test conges.tests.CircuitValidationTests.test_rh_est_aussi_chef_de_service_et_sa_demande_va_au_directeur
python manage.py test conges.tests_api.DecisionRHAPITests.test_rh_agit_comme_chef_de_service_dans_sa_file
python manage.py test conges.tests_api.DecisionRHAPITests.test_demande_personnelle_rh_est_presentee_au_directeur
python manage.py test conges personnels organisation
```

Depuis `frontend` :

```powershell
npm run build
```

Les tests Django ajoutés sont présents dans l'archive, mais n'ont pas pu être exécutés dans l'environnement de préparation, où Django n'était pas installé et où l'installation des dépendances ne pouvait pas accéder au réseau. La vérification TypeScript `tsc -b` a réussi. Le build Vite complet est à effectuer dans l'environnement Windows du projet, car le binding natif de Rolldown disponible dans le runtime de préparation était incompatible avec Linux.
