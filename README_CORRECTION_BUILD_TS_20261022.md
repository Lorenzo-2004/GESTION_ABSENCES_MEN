# Correction TypeScript — décisions RH et OCR du cachet

Cette archive reprend le frontend de navigation/notifications fourni précédemment et corrige les types partagés dans `src/services/rhDecisionsService.ts` :

- `DecisionConge.indice` est une chaîne (`string | null`) pour préserver les indices alphanumériques comme `231 T`.
- `CreationDecision.indice` est aussi une chaîne pour correspondre au champ backend `CharField`.
- `DonneesExtraitesDecision` déclare `signataire` et `texte_cachet`, renvoyés par l’OCR du backend.

## Installation

Sauvegarder le fichier existant, puis remplacer :

`frontend/src/services/rhDecisionsService.ts`

par le fichier de cette archive. Le reste de l'archive est la version précédente de navigation et notifications.

Dans le dossier `frontend`, lancer :

```powershell
npm ci
npm run build
```

La compilation complète n'a pas pu être exécutée dans l'environnement de préparation, car les dépendances npm (notamment `vite/client` et `@types/node`) n'étaient pas installées. Le correctif répond aux six erreurs TS signalées dans `DecisionsRHPage.tsx`.
