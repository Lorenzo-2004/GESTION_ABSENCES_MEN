# Re-vérification frontend MEN — 26/10/2026

## Changements ciblés
- `src/pages/agent/MesDemandesPage.tsx` : retrait du panneau de synthèse et des cartes KPI qui dupliquaient les statistiques de la page Historique. La recherche, les filtres, la liste paginée et les actions existantes restent en place.
- Les champs de recherche de Mes demandes, Historique et du module RH utilisent `type="search"`.
- `src/pages/agent/NouvelleDemandePage.tsx` : le champ lieu ignore les retours à la ligne, tabulations et caractères de contrôle lors de la saisie/collage. Aucun champ métier ou payload d'API n'a été renommé.

## Audit des types et champs
- Les dates de saisie utilisent `type="date"`; les dates calculées pour maternité/paternité sont `readOnly`.
- L'année de titre de congé annuel et l'indice RH utilisent des champs numériques avec limites/étape entière et filtres clavier adaptés.
- Les justificatifs/scans utilisent `type="file"` avec liste d'extensions acceptées.
- Les statuts, types d'absence, agents et rôles sont choisis par `select`, `radio` ou `checkbox` lorsque pertinent.
- Les champs textuels libres restants (numéro de décision, budget, imputation, grade, signataire, motif/lieu) restent textuels car leurs formats peuvent contenir des lettres, séparateurs ou phrases.
- Les champs de date calculés et le motif automatique restent en lecture seule dans le frontend. Les validations serveur demeurent nécessaires et ne sont pas remplacées par la validation de navigateur.

## Contrôles exécutés ici
- `node node_modules/typescript/bin/tsc -b --pretty false` : réussi.
- `vite build` : non exécuté jusqu'au bout, car le `node_modules` fourni avec l'archive n'a pas le binding natif Linux requis par Rolldown. Ce n'est pas une validation de build complète. Reconstruire dans l'environnement Windows du projet avec `npm ci`, puis `npm run build`.
- `npm run lint` : non validé dans cet environnement, dont les dépendances installées signalent l'absence d'une configuration ESLint `eslint.config.*`.

Le ZIP livré est une archive de sources/configuration ; `node_modules` et `dist` sont exclus, comme pour une livraison de code source reproductible à partir de `package-lock.json`.
