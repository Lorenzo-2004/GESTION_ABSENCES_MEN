# Restauration frontend — état antérieur à la saisie déléguée sans signature

Cette restauration annule uniquement les changements récents du formulaire qui introduisaient :
- le sélecteur d’agent dans la page Nouvelle demande ;
- la signature facultative lors d’une saisie déléguée ;
- l’envoi sans `signature_agent`.

Les deux fichiers restaurés sont `src/pages/agent/NouvelleDemandePage.tsx` et `src/services/nouvelleDemandeService.ts`. Les autres fichiers du frontend envoyé par l’utilisateur sont conservés, notamment la navigation, les notifications, le traitement RH et la règle de tranche annuelle de 15 jours.

Ce package ne contient ni `node_modules/` ni `dist/`. Après extraction, exécuter `npm ci` puis `npm run build`.
