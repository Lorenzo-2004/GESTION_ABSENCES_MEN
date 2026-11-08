# Correction — demande pour un agent côté RH

## Ce qui change
- Ajout d'une entrée « Demande pour un agent » dans la navigation RH.
- Ajout de la route `/app/rh/nouvelle-demande`, réservée au rôle RH.
- Côté RH, possibilité de rechercher un agent du ministère par nom, IM ou service.
- Côté Chef de service, la sélection préalable de l'agent est également exigée : un accès sans agent sélectionné n'ouvre plus par erreur une demande personnelle.
- Une fois l'agent sélectionné, les deux espaces utilisent le même formulaire `NouvelleDemandePage` et les mêmes contrôles de saisie. Le périmètre de sélection demeure différent : ministère entier pour RH, service de l'utilisateur pour Chef de service.

## Fichiers concernés
- `src/App.tsx`
- `src/components/men/miseEnPageRH.tsx`
- `src/pages/agent/NouvelleDemandePage.tsx`
- `src/pages/rh/DecisionsRHPage.tsx`

## Vérification
La vérification TypeScript `tsc -b` a réussi dans l'environnement de préparation. Le bundle Vite n'a pas pu être validé dans l'environnement Linux de préparation, car les dépendances natives Vite/Rolldown installées dans l'archive sont celles de Windows. Sur le PC Windows du projet, vérifier avec `npm run build`.
