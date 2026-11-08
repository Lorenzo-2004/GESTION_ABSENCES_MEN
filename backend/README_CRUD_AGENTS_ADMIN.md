# Mise à jour du backend — CRUD des fiches agents (Admin)

Cette version ajoute une validation serveur des données envoyées par le formulaire CRUD des fiches agents. Elle conserve les modèles, les migrations et les règles métier d'absence.

## Compatibilité de l'API

Les routes utilisées par l'interface existent déjà :

- `GET /api/personnels/` : liste les fiches dans le périmètre autorisé ;
- `POST /api/personnels/` : crée une fiche ;
- `PATCH /api/personnels/{id}/` : modifie une fiche ;
- `DELETE /api/personnels/{id}/` : supprime une fiche si aucune donnée protégée ne la référence ;
- `GET /api/directions/` : liste les directions ;
- `GET /api/services/` : liste les services.

Le sérialiseur `PersonnelSerializer` renvoie bien les champs attendus par le frontend : `id_personnel`, `im`, `cin`, `nom`, `prenoms`, `sexe`, `date_naissance`, `telephone`, `email`, `statut`, `corps`, `grade`, `direction`, `direction_libelle`, `service` et `service_libelle`.

Les droits existaient déjà dans le projet : `ROLE_ADMIN` et `ROLE_RH` peuvent écrire sur les fiches du personnel ; les autres rôles disposent d'un accès en lecture limité à leur périmètre. La gestion des directions et services reste réservée à `ROLE_ADMIN` en écriture.

## Contrôles ajoutés côté serveur

- IM : exactement 6 chiffres ;
- CIN : exactement 12 chiffres, les espaces de présentation sont tolérés puis retirés ; les doublons sont contrôlés aussi après retrait des espaces ;
- nom et prénoms : lettres Unicode, espaces, apostrophes et traits d'union ;
- date de naissance : ne peut pas être dans le futur ;
- téléphone : caractères téléphoniques usuels uniquement et 8 à 15 chiffres ;
- corps et grade : non vides, au moins une lettre, ponctuation administrative usuelle ;
- service : doit appartenir à la direction sélectionnée.

Les champs `prenom(s)`, `corps` et `grade` sont exigés à la création comme dans le formulaire Admin. Lors d'une modification partielle, les anciennes fiches incomplètes ne sont pas rejetées uniquement parce que ces champs n'ont pas été modifiés.

Les erreurs de suppression liées à des références protégées sont déjà converties par le gestionnaire d'exceptions du projet en réponse HTTP 409.

## Modifications de cette mise à jour

- `personnels/serializers.py` : validations serveur du formulaire agent ;
- `personnels/views.py` : docstring clarifiée sur les rôles autorisés ;
- `personnels/tests_admin_agents_api.py` : nouveaux tests API pour le CRUD, les validations, l'appartenance service/direction et le refus d'écriture pour un agent.

Aucune migration de base de données n'est nécessaire : aucun modèle ni champ n'a été modifié.

## Installation locale

Depuis le dossier `backend` :

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py check
python manage.py test personnels.tests_admin_agents_api personnels.tests personnels.tests_admin_comptes_api --settings=config.settings.test
```

Le fichier `.env` local n'est volontairement pas inclus dans cette archive. Conservez votre `.env` existant et vérifiez ses paramètres avant de lancer le serveur.
