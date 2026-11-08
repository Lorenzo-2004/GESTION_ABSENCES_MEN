# Formulaires officiels classés par service — Espace RH

Une rubrique **Formulaires officiels** est ajoutée au menu RH.

## Fonctionnement

- Elle récupère toutes les demandes au statut `APPROUVE_CS` via `GET /api/demandes/` et suit toutes les pages renvoyées par la pagination Django.
- Le classement est fait à partir du service et de la direction de l'agent. La RH peut filtrer par service et rechercher un agent, un IM, un numéro ou un type de demande.
- Le bouton de téléchargement appelle `GET /api/demandes/{id}/formulaire/`, puis vérifie l'intégrité du document et du journal via `GET /api/demandes/{id}/integrite/` avant de sauvegarder le PDF localement.
- Les fiches officielles existent uniquement pour `CONGE_ANNUEL`, `PERMISSION` et `AUTORISATION`. Les autres demandes restent dans leur groupe, mais affichent qu'aucun formulaire PDF officiel n'est prévu.

Aucune modification du backend ni migration de base de données n'est nécessaire : les routes, le filtre de statut, la visibilité ministérielle RH, la génération du formulaire et le contrôle d'intégrité existent déjà dans le backend fourni.

## Fichiers modifiés

- `src/components/men/miseEnPageRH.tsx`
- `src/pages/rh/DecisionsRHPage.tsx`
- `src/services/congesService.ts`
