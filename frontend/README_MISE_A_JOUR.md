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
- Pour maternité et paternité, le formulaire ne demande que `date_evenement_prevue` : il affiche les dates de début et de fin calculées en lecture seule (90 jours et 15 jours calendaires). Le frontend n'envoie pas `date_debut` / `date_fin` pour ces types ; le backend les calcule et reste l'autorité métier.
- Le formulaire vérifie maintenant côté interface les délais de dépôt avant l’envoi : congé annuel entre 14 et 30 jours avant la date de début, mission au moins 7 jours avant, maternité entre 1 et 3 mois avant l’événement, et paternité entre 14 et 30 jours avant l’événement. Les champs de dates affichent les limites calculées et les validations backend restent autoritaires.
- Les actions d’avis du Chef de service et du Directeur réinitialisent le CSRF avant leurs requêtes POST, comme les autres écritures utilisant les cookies HttpOnly.
- Les services qui consomment les listes de comptes supportent l’enveloppe de pagination du backend MEN (`resultats`, `total`, `suivante`, `precedente`) ainsi que l’enveloppe DRF standard.
- L’écran RH récupère désormais les pages des décisions et des personnels par lots de taille bornée, afin que les filtres et les indicateurs calculés côté interface ne se limitent pas à la première page par défaut.
- Les types de demandes exposent aussi `annee_titre` et `date_evenement_prevue` lorsque ces valeurs sont retournées par le backend.
- Les déclarations TypeScript inutilisées qui empêchaient `tsc -b` de réussir ont été retirées.

## Limite importante des formulaires actuels

Dans cette version de l'interface, les champs CIN, nom, prénoms, direction et service sont des données de fiches de personnel consultées en lecture seule ; il n'existe pas de page frontend dédiée à leur création ou modification. Ces données sont donc signalées et vérifiées au moment de la sélection d'une fiche, mais ne peuvent pas être corrigées depuis cette page. Pour imposer les règles à toutes les sources (API, imports, autres clients), il faudra aussi ajouter les validations correspondantes côté backend et dans un futur formulaire de gestion des personnels.

## Vérification

- Le contrôle syntaxique des fichiers TypeScript/TSX n’a révélé aucune erreur. La compilation TypeScript complète n’a pas pu être relancée sur cette livraison, car les dépendances npm ne sont pas disponibles dans l’environnement actuel.
- Le build Vite complet n’a pas pu être validé dans cet environnement, car l’installation des dépendances n’a pas abouti. Sur le poste Windows du projet, exécuter `npm ci`, puis `npm run build`.
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


## Adaptation au backend archivé du 21 octobre 2026

- Le formulaire de demande reflète exactement les sept types backend et masque les types incompatibles avec le statut/sexe du personnel (notamment les restrictions stagiaire et maternité/paternité).
- Les champs `motif` et `lieu_jouissance` sont requis, comme l'exige le sérialiseur pour produire le formulaire officiel complet. Pour maternité/paternité, seule la date prévue est envoyée ; les dates calculées sont montrées en lecture seule.
- Les justificatifs sont facultatifs dans le formulaire. Les formats acceptés sont PDF, JPG/JPEG, PNG et TIF/TIFF, avec une limite d'interface de 15 Mo conforme au backend.
- L'écran RH OCR affiche les valeurs reconnues, les champs manquants et les avertissements renvoyés par l'OCR. Il avertit en cas de numéro déjà enregistré et empêche l'enregistrement avec ce même numéro détecté ; la base reste la protection définitive contre les doublons.
- Les liens vers l'espace Chef de service ne sont présentés à la RH que si son compte est rattaché à un service. En accès direct sans rattachement, le tableau de bord explique la situation et propose de revenir à l'espace RH.
- L'écran de report explique que le solde N+1 reprend automatiquement le reliquat à sa création et que l'action RH sert aussi à recalculer les soldes N+1 déjà existants puis à propager le report en cascade.

### Vérifications réalisées pour cette livraison

- Le contrôle syntaxique des fichiers TypeScript/TSX n’a révélé aucune erreur ; la compilation complète reste à vérifier après installation des dépendances sur le poste du projet.
- Le build Vite complet n’a pas pu être exécuté ici, car les dépendances npm ne sont pas disponibles. Sur le poste du projet, exécuter `npm ci`, puis `npm run build`.
- L'archive fournie contient les sources et le fichier de verrouillage ; `node_modules` et `dist` en sont exclus.


### Règle de disponibilité du formulaire officiel

La fiche officielle PDF est proposée uniquement pour `CONGE_ANNUEL`, `PERMISSION` et `AUTORISATION`. Elle n’est pas proposée pour `MATERNITE`, `PATERNITE`, `MISSION` ni `REPOS_SANITAIRE`, qui sont traités comme des annonces. Les champs motif et lieu restent transmis, car le backend actuel les exige pour créer toutes les demandes/annonces.


## Messages affichés à l’utilisateur

- Les messages visibles ne citent pas les codes internes des règles de gestion. Ils donnent directement la consigne ou la raison du refus.
- Les erreurs techniques, adresses locales, traces d’exécution et codes HTTP ne sont pas affichés. En cas d’indisponibilité, l’interface conseille de réessayer sans exposer l’adresse du service.
- Les soumissions, créations de compte, avis du Chef de service et du Directeur, activations de décisions et reports de reliquats disposent de confirmations explicites en français.

## Correctifs d'interface — confirmations et statistiques circulaires

- Les confirmations d'activation des décisions RH et de report des reliquats utilisent maintenant une boîte de dialogue intégrée à l'application, au lieu des fenêtres natives du navigateur qui affichent le nom d'hôte local.
- Les grands cercles de synthèse dans « Mes demandes » et « Historique des congés » ont une bordure et un anneau extérieur secondaires, assortis aux autres indicateurs circulaires de l'interface.

## Validation des saisies et anneaux statistiques

- Les compteurs « demandes » et « historique » utilisent un anneau de fond clair, une bordure intérieure fine et un halo extérieur, conformément à la référence visuelle.
- Le graphique circulaire des soldes conserve deux segments calculés depuis les données réelles : jours pris (orange) et jours disponibles (turquoise), avec la valeur disponible au centre.
- Les champs de l’année de référence et de l’indice filtrent les caractères non numériques ; les années de décision acceptent une année, une plage ou une liste d’années.
- Les noms/signalataires sont limités aux lettres, espaces, apostrophes et traits d’union. Les numéros administratifs gardent les chiffres, lettres et séparateurs courants.
- Les champs de texte libre (motif, lieu, détails) conservent les chiffres utiles mais refusent les caractères de contrôle. Le mot de passe et les recherches ne sont pas filtrés abusivement.
- Les données OCR sont traitées comme des données non fiables et nettoyées avant d’être placées dans le formulaire.

## Signature électronique avant soumission

La page **Nouvelle demande** contient une zone de signature sur canvas, utilisable à la souris ou au doigt. La signature doit être tracée avant d'envoyer la demande ; elle peut être effacée puis redessinée. Le frontend envoie le PNG avec la demande. L'API conserve la signature et ses métadonnées de traçabilité. Pour le congé annuel, la permission et l'autorisation d'absence, l'image est imprimée dans la zone « Signature de l'intéressé(e) » du formulaire officiel MEN. Les autres types conservent la signature à la demande, sans fiche officielle.

## Vérification de l'intégrité du formulaire signé

Lorsque l'agent ouvre le PDF officiel d'une demande, le frontend demande au backend de vérifier l'empreinte du PDF, l'image de signature et la chaîne de traçabilité. Il affiche un indicateur de vérification et permet de consulter la date, le compte associé et l'empreinte SHA-256 du PDF.

Si un contrôle échoue, le backend refuse le téléchargement du document déjà scellé et le frontend affiche un message destiné à l'utilisateur.

## Signature électronique — zone de tracé améliorée

Le formulaire Nouvelle demande utilise une zone de signature avec courbes de Bézier, épaisseur du trait modulée selon la vitesse, canvas haute résolution et action « Annuler le dernier trait ». Tout le traitement est réalisé dans le navigateur : aucune image de signature n'est envoyée à un service externe et aucune dépendance de signature supplémentaire n'est nécessaire. Cette approche garde le frontend compatible avec le déploiement Intranet hors ligne.
