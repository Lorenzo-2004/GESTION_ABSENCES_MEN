# Mise à jour du frontend MEN

## Fonctionnalités intégrées

- Route `ROLE_CHEF_SERVICE` `/app/chef-service/nouvelle-demande` pour déposer une demande personnelle, envoyée au circuit de validation prévu par le backend.
- Dans `Personnels`, une action `Préparer une demande` permet au chef de saisir une demande pour un agent de son service. Le personnel ciblé est recontrôlé à partir du service retourné par l'API.
- Dans `Personnels`, une file de demandes en attente permet au chef d'accorder ou de refuser le visa, avec observation obligatoire pour une permission ou une autorisation.
- Le calendrier `/app/chef-service/planning` continue de lire les absences via `/api/demandes/planning/`.
- Dans `Mes demandes`, le bouton `Aperçu PDF officiel` récupère `/api/demandes/{id}/formulaire/` et affiche le formulaire officiel du backend dans un aperçu intégré, avec téléchargement et impression.
- IM saisi à la connexion : normalisation numérique limitée à six chiffres et message immédiat lorsqu'un IM numérique est incomplet.
- Adresse e-mail des comptes : validation immédiate imposant exactement le domaine `@gmail.com`.
- Lors de la sélection d'une fiche de personnel pour créer un compte, les contraintes IM (6 chiffres), CIN (12 chiffres), nom/prénoms, direction et service sont contrôlées. La création du compte est bloquée si la fiche existante est non conforme.

## Alignement avec le backend MEN — 19 octobre 2026

- Le formulaire de nouvelle demande envoie maintenant `annee_titre` pour un congé annuel, champ exigé par le sérialiseur et contrôlé par les règles de droits annuels.
- Le formulaire demande `date_evenement_prevue` pour les congés de maternité et de paternité. Il vérifie aussi côté interface les durées fixes de 90 et 15 jours calendaires, que le backend reste chargé de faire respecter.
- Le formulaire vérifie maintenant côté interface les délais de dépôt RG-11 avant l’envoi : congé annuel entre 14 et 30 jours avant la date de début, mission au moins 7 jours avant, maternité entre 1 et 3 mois avant l’événement, et paternité entre 14 et 30 jours avant l’événement. Les champs de dates affichent les limites calculées et les validations backend restent autoritaires.
- Les actions d’avis du Chef de service et du Directeur réinitialisent le CSRF avant leurs requêtes POST, comme les autres écritures utilisant les cookies HttpOnly.
- Les services qui consomment les listes de comptes supportent l’enveloppe de pagination du backend MEN (`resultats`, `total`, `suivante`, `precedente`) ainsi que l’enveloppe DRF standard.
- L’écran RH récupère désormais les pages des décisions et des personnels par lots de taille bornée, afin que les filtres et les indicateurs calculés côté interface ne se limitent pas à la première page par défaut.
- Les types de demandes exposent aussi `annee_titre` et `date_evenement_prevue` lorsque ces valeurs sont retournées par le backend.
- Les déclarations TypeScript inutilisées qui empêchaient `tsc -b` de réussir ont été retirées.

## Limite importante des formulaires actuels

Dans cette version de l'interface, les champs CIN, nom, prénoms, direction et service sont des données de fiches de personnel consultées en lecture seule ; il n'existe pas de page frontend dédiée à leur création ou modification. Ces données sont donc signalées et vérifiées au moment de la sélection d'une fiche, mais ne peuvent pas être corrigées depuis cette page. Pour imposer les règles à toutes les sources (API, imports, autres clients), il faudra aussi ajouter les validations correspondantes côté backend et dans un futur formulaire de gestion des personnels.

## Vérification

- Le contrôle TypeScript `tsc -b` a réussi après les corrections.
- Le build Vite complet n’a pas pu être validé dans cet environnement Linux : l’archive de départ contenait le binaire natif Rolldown pour Windows seulement. Sur le poste Windows du projet, vérifier avec `npm run build` (et `npm ci` si les dépendances locales doivent être réinstallées).
- L’archive de livraison exclut `node_modules`, `dist` et tout fichier `.env` ; elle contient le code source et les fichiers de verrouillage nécessaires.

```powershell
cd C:\Users\LORENZO\PROJECT_MEN\frontend
npm run build
```


## Accès multi-fonctions (Chef de service et RH)

Les comptes `ROLE_CHEF_SERVICE` et `ROLE_RH` peuvent aussi ouvrir l'espace personnel : profil, demandes propres, nouvelle demande, soldes et historique. Les listes personnelles filtrent par l'identifiant de la fiche associée (`personnel`) afin de ne pas confondre les demandes d'un responsable avec celles de ses agents. Les menus donnent un accès direct aux autres espaces autorisés. Le correctif backend compagnon met également à jour le circuit de validation, les files d'attente et les notifications pour considérer RH comme responsable de son service.

## Palette et typographies — correction ciblée

Cette version conserve l'architecture, les composants, la disposition, les espacements, les illustrations et les animations de l'interface précédente. La seule modification visuelle est l'application de la palette de la bibliothèque dans une distribution claire inspirée des principes Apple Design : fond `#FAFAF8`, texte `#0A0A0A`, actions principales `#1B1BFF`, accent `#00FF9C`, surfaces blanches et bordures gris clair. Le noir est utilisé comme encre/texte et non comme fond global.

Typographies locales via Fontsource : Space Grotesk pour les titres et l'affichage, Inter pour le texte, les formulaires et la navigation. Les imports distants Google Fonts sont retirés pour un usage intranet hors-ligne.
