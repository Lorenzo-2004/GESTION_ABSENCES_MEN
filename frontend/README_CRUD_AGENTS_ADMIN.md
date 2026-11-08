# Frontend MEN — CRUD des fiches agents

Cette archive contient le frontend complet du projet MEN, avec l'ajout de la section « Fiches agents » dans l'espace Admin.

## Installation et lancement

Depuis le dossier `frontend` :

```powershell
npm ci
npm run dev
```

Vérification TypeScript :

```powershell
npx tsc -b
```

Build de production :

```powershell
npm run build
```

Les dossiers `node_modules` et `dist` ne sont pas inclus dans cette archive : `npm ci` installe les dépendances depuis `package-lock.json`, et `npm run build` recrée `dist`.

## Fichiers principaux du CRUD agents

- `src/pages/admin/AdminComptesPage.tsx` : ajoute les onglets « Comptes utilisateurs » et « Fiches agents ».
- `src/pages/admin/GestionAgentsAdmin.tsx` : interface de consultation, création, modification et suppression d'une fiche agent.
- `src/services/adminComptesService.ts` : appels API pour les agents, directions et services, sans retirer les appels existants de gestion des comptes.
- `src/lib/validationChamps.ts` : fonctions et messages de validation utilisés par le formulaire.

## Contrat API attendu

Le formulaire utilise les routes suivantes :

- `GET /api/personnels/`
- `POST /api/personnels/`
- `PATCH /api/personnels/{id}/`
- `DELETE /api/personnels/{id}/`
- `GET /api/directions/`
- `GET /api/services/`

La réponse des API d'organisation doit fournir les identifiants et libellés des directions/services. Si les noms d'URL ou les clés JSON du backend diffèrent, le service frontend devra être adapté.

**Important :** le backend doit autoriser explicitement `ROLE_ADMIN` à créer, modifier et supprimer les fiches personnel. Le frontend ne peut pas contourner une permission serveur qui refuse ces opérations. Vérifier également que le backend accepte les formats IM et CIN utilisés dans les données réelles de la base ; les contrôles visuels du formulaire ne remplacent pas les contraintes backend.
