# Mise à jour frontend MEN — navigation et notifications — 22 octobre 2026

Cette archive est séparée du backend. Elle comprend la version frontend fournie comme la plus récente, la dernière `DecisionsRHPage.tsx` du correctif PDF 400 et les améliorations ci-dessous.

## Espace Chef de service

La navigation latérale est désormais présentée en sections distinctes :
- **Gestion du service** : vue d'ensemble, demandes à examiner, équipe, planning et saisie déléguée pour un agent.
- **Mon espace personnel** : profil, demandes personnelles, nouvelle demande, soldes et historique.

## Espace RH

- **Gestion RH** : vue d'ensemble RH, décisions RH et report des reliquats.
- **Mon service** : vue d'ensemble, équipe et planning si le compte RH est rattaché à un service.
- **Mon espace personnel** : profil, demandes, dépôt d'une demande, soldes et historique.

## Notifications visuelles

Les messages d'erreur et de succès de ces deux pages sont maintenant affichés dans un panneau flottant en haut à droite, au-dessus du contenu, avec fermeture explicite. Ils ne déplacent plus les tableaux ou formulaires et restent visibles à travers les changements de sous-vue. Ce sont des messages de retour d'action ; ils ne remplacent pas un centre de notifications persistantes.

## PDF / décisions RH

Le formulaire RH impose maintenant l'imputation budgétaire/chapitre avant l'enregistrement. Les décisions activées doivent en outre satisfaire la validation backend.

## Vérification

À la racine `frontend/` :

```powershell
npm run build
npm run lint
```

Les dépendances `node_modules` ne sont pas incluses dans le ZIP.
