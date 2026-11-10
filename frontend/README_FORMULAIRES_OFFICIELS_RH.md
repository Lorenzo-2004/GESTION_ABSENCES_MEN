# MEN — Réaffectation des PDF officiels après visa du chef de service

## Nouvelle règle
Après visa du chef de service (`APPROUVE_CS`), les formulaires PDF officiels sont accessibles **dans l’espace du chef du service de l’agent**, et non dans la rubrique RH. La règle s’applique aussi aux demandes `VALIDE_DIR` et `ARCHIVEE`. Le statut `EN_ATTENTE` n’est pas affiché dans le dossier des formulaires visés. Les demandes `REJETE` n’y figurent pas.

Les formulaires concernent seulement `CONGE_ANNUEL`, `PERMISSION` et `AUTORISATION`. Le stockage du PDF scellé, la génération, le journal d’audit, le contrôle d’intégrité et le circuit de validation ne sont pas modifiés. Il s’agit d’une modification **d’accès et de présentation**, pas d’un transfert physique du fichier.

## Backend
Nouvelle route authentifiée : `GET /api/demandes/formulaires-service/`. Réservée au rôle `ROLE_CHEF_SERVICE`, elle renvoie les PDF éligibles du service et de la direction du chef connecté, avec pagination `page`/`taille` dans le format API habituel. Les autres rôles obtiennent 403.

L’action existante `GET /api/demandes/{id}/formulaire/` refuse désormais un formulaire après visa si l’utilisateur n’est pas le chef du service de l’agent (403). Le périmètre des autres services reste caché via l’isolation des demandes (404). **Avant visa**, les droits et la génération existants restent inchangés. `GET /api/demandes/{id}/integrite/` demeure disponible selon son périmètre de consultation existant ; ce endpoint ne télécharge pas le PDF.

## Frontend
- Retrait du menu et de la section « Formulaires officiels » RH.
- Ajout de `/app/chef-service/formulaires`, menu « PDF officiels à signer ».
- Liste des formulaires de l’équipe, recherche, téléchargement, contrôle du format `%PDF-` et vérification du journal d’intégrité avant présentation à l’impression.
- Les autres fonctions RH, les comptes et les absences ne sont pas changés.

## Vérification locale

Depuis `backend` :

```powershell
python manage.py test conges.tests_formulaires_service
python manage.py test
```

Depuis `frontend` :

```powershell
npm ci
npm run build
npm run dev
```

Aucune migration n’est requise. La compilation Python et TypeScript ont été vérifiées ; la suite Django ne peut pas être exécutée dans l’environnement de préparation (Django absent).
