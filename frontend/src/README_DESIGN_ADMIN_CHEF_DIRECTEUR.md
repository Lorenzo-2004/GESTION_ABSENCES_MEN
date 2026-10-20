# Mise à jour visuelle — Admin, Chef de service et Directeur

Cette mise à jour reprend le langage visuel de `DecisionsRHPage.tsx` pour les espaces Admin, Chef de service et Directeur, sans appliquer le changement aux pages Agent.

## Pages concernées

- `src/pages/admin/AdminComptesPage.tsx`
- `src/pages/chef-service/DashboardChefServicePage.tsx`
- `src/pages/chef-service/PersonnelsServicePage.tsx`
- `src/pages/chef-service/PlanningServicePage.tsx`
- `src/pages/directeur/DashboardDirecteurPage.tsx`

## Modifications visuelles

- Tuiles KPI en gris clair `#E3E3E8`, avec chiffres et libellés foncés, icônes sur fond clair et barres d’avancement accentuées.
- Bandeaux d’accueil sur fond gris doux `#EDEDF1`, avec typographie foncée et boutons principaux bleus.
- Cadre de contenu blanc avec bordure `#E5E5EA` et coins arrondis, inspiré de la page RH de référence.
- Palette maintenue : `#FAFAF8`, `#0A0A0A`, `#1B1BFF`, `#00FF9C`.
- Polices globales Space Grotesk pour les titres et Inter pour les textes, déjà configurées dans `src/main.tsx` et `src/index.css`.

## Hors périmètre

- Aucune page `src/pages/agent/*` n’a été modifiée.
- Les routes, appels API, permissions, logique métier et code backend ne sont pas modifiés par ce patch visuel.

## Vérification

Le contrôle TypeScript a réussi. Le build Vite complet est à refaire sur le poste Windows après installation des dépendances avec `npm install`, puis `npm run build`.
